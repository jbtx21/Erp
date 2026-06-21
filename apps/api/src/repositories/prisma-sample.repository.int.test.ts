// Integrationstest gegen ECHTES Postgres (B5). Rückgabe < 21 Tagen → keine
// Rechnung; > 21 Tagen → Musterrechnung zum Listenpreis (Menge × Listenpreis),
// Nummer aus F1, Status BERECHNET, Muster-Lager über F4. Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { balanceByLager } from "@texma/shared";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaSampleLoanRepository } from "./prisma-sample.repository.js";
import { PrismaNumberingRepository } from "./prisma-numbering.repository.js";
import { SampleLoanService } from "../modules/sample/sample.service.js";
import { NumberingService } from "../modules/numbering/numbering.service.js";

const PG = "pg_b5";
const CO = "co_b5";
const ART = "art_b5";
const VAR = "var_b5";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaSampleLoanRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaSampleLoanRepository — 21-Tage-Musterautomatik gegen echtes Postgres", () => {
    const service = new SampleLoanService(
      new PrismaSampleLoanRepository(),
      new NumberingService(new PrismaNumberingRepository()),
      new MemoryAuditSink()
    );

    async function cleanup() {
      await prisma.dueItem.deleteMany({ where: { entity: "SampleLoan" } });
      await prisma.sampleLoan.deleteMany({ where: { companyId: CO } });
      await prisma.invoice.deleteMany({ where: { companyId: CO } });
      await prisma.stockMove.deleteMany({ where: { variantId: VAR } });
      await prisma.numberSequence.deleteMany({ where: { key: "INVOICE", year: 2026 } });
      await prisma.priceGroupPrice.deleteMany({ where: { variantId: VAR } });
      await prisma.variant.deleteMany({ where: { id: VAR } });
      await prisma.article.deleteMany({ where: { id: ART } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "STANDARD", name: "Standard" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });
      await prisma.article.create({ data: { id: ART, sku: "ART-B5", name: "Muster-Poloshirt" } });
      await prisma.variant.create({ data: { id: VAR, articleId: ART, sku: "B5-1" } });
      await prisma.priceGroupPrice.create({ data: { variantId: VAR, priceGroupId: PG, netCents: 1000 } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("Rückgabe vor Frist → keine Rechnung; Muster-Lager wieder ausgeglichen", async () => {
      const now = new Date(Date.UTC(2026, 2, 1));
      const loan = await service.issue({ companyId: CO, variantId: VAR, menge: 3, at: new Date(Date.UTC(2026, 1, 20)) });
      await service.returnSample(loan.id);

      const billed = await service.billOverdue(now);
      expect(billed).toEqual([]);
      expect(await prisma.invoice.count({ where: { companyId: CO } })).toBe(0);

      const moves = await prisma.stockMove.findMany({ where: { variantId: VAR }, select: { deltaQty: true, lager: true } });
      expect(balanceByLager(moves).MUSTER).toBe(0); // −3 Ausgabe + 3 Rückgabe
    });

    it("nach 21 Tagen → Musterrechnung zum Listenpreis (Menge × 1000)", async () => {
      const ausgabe = new Date(Date.UTC(2026, 3, 1));
      const loan = await service.issue({ companyId: CO, variantId: VAR, menge: 5, at: ausgabe });

      const before = await service.billOverdue(new Date(Date.UTC(2026, 3, 21))); // genau 21 Tage → fällig
      expect(before).toHaveLength(1);
      expect(before[0]).toMatchObject({ loanId: loan.id, netCents: 5000 }); // 5 × 1000

      const inv = await prisma.invoice.findUnique({ where: { number: before[0]!.invoiceNumber } });
      expect(inv).toMatchObject({ companyId: CO, netCents: 5000, taxCents: 950, grossCents: 5950, orderId: null, finalized: true });

      const updated = await prisma.sampleLoan.findUnique({ where: { id: loan.id } });
      expect(updated).toMatchObject({ status: "BERECHNET", invoiceId: inv!.id });

      // Erneuter Lauf berechnet nicht doppelt.
      expect(await service.billOverdue(new Date(Date.UTC(2026, 4, 1)))).toEqual([]);
    });
  });
}
