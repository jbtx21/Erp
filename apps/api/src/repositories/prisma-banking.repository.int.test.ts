// Integrationstest gegen ECHTES Postgres (T-13). Prüft den CAMT-Abgleich auf DB-Ebene:
// Zahlungseingang ordnet dem offenen Posten zu (openCents → 0, Payment.matched), nicht
// zuordenbare Zahlung landet als unmatched in der Klärungsliste; Re-Import ist idempotent
// über Payment.externalRef. Nur mit RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaBankingRepository } from "./prisma-banking.repository.js";
import { BankingImportService } from "../modules/banking/banking-import.service.js";

const PG = "pg_bank";
const CO = "co_bank";
const ORD = "order_bank";
const INV = "inv_bank";
const OI = "oi_bank";
const REF_OK = "BANK-REF-OK";
const REF_UNK = "BANK-REF-UNK";

const stmt = `<Document><BkToCstmrStmt><Stmt>
  <Ntry><Amt Ccy="EUR">119.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><ValDt><Dt>2026-06-15</Dt></ValDt>
    <NtryDtls><TxDtls><Refs><AcctSvcrRef>${REF_OK}</AcctSvcrRef></Refs>
      <RmtInf><Ustrd>Zahlung Rechnung RB-2026-001</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
  <Ntry><Amt Ccy="EUR">42.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><ValDt><Dt>2026-06-15</Dt></ValDt>
    <NtryDtls><TxDtls><Refs><AcctSvcrRef>${REF_UNK}</AcctSvcrRef></Refs>
      <RmtInf><Ustrd>ohne Bezug</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
</Stmt></BkToCstmrStmt></Document>`;

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaBankingRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres (RUN_DB_TESTS=1 + DATABASE_URL)", () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe("PrismaBankingRepository — CAMT-Abgleich gegen echtes Postgres", () => {
    const repo = new PrismaBankingRepository();
    const service = new BankingImportService(repo, new MemoryAuditSink());

    async function cleanup() {
      await prisma.paymentAllocation.deleteMany({ where: { openItemId: OI } });
      await prisma.payment.deleteMany({ where: { externalRef: { in: [REF_OK, REF_UNK] } } });
      await prisma.openItem.deleteMany({ where: { id: OI } });
      await prisma.invoice.deleteMany({ where: { id: INV } });
      await prisma.order.deleteMany({ where: { id: ORD } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "TOP", name: "Top" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });
      await prisma.order.create({ data: { id: ORD, number: "AB-BANK-1", companyId: CO } });
      await prisma.invoice.create({
        data: { id: INV, number: "RB-2026-001", orderId: ORD, companyId: CO, netCents: 10000, taxCents: 1900, grossCents: 11900 },
      });
      await prisma.openItem.create({
        data: { id: OI, invoiceId: INV, openCents: 11900, dueDate: new Date(Date.UTC(2026, 6, 1)) },
      });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("ordnet den Treffer zu, stellt Unbekanntes in die Klärung und ist idempotent", async () => {
      const res = await service.importStatement(stmt);
      expect(res).toMatchObject({ imported: 2, matched: 1, clarified: 1 });

      const oi = await prisma.openItem.findUnique({ where: { id: OI } });
      expect(oi?.openCents).toBe(0); // Rechnung vollständig bezahlt

      const matchedPay = await prisma.payment.findUnique({ where: { externalRef: REF_OK } });
      expect(matchedPay).toMatchObject({ matched: true });

      const klaerung = await repo.listClarifications(10);
      expect(klaerung.some((p) => p.externalRef === REF_UNK)).toBe(true);

      // Re-Import: keine Doppelbuchung.
      const again = await service.importStatement(stmt);
      expect(again).toMatchObject({ imported: 0, skipped: 2 });
      expect(await prisma.payment.count({ where: { externalRef: { in: [REF_OK, REF_UNK] } } })).toBe(2);
    });
  });
}
