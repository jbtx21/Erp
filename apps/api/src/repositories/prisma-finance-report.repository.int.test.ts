// Integrationstest gegen ECHTES Postgres (B19). OP-Aging aus offenen Posten +
// DSO aus finalisiertem Umsatz. Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { PrismaFinanceReportRepository } from "./prisma-finance-report.repository.js";
import { FinanceReportService } from "../modules/finance-report/finance-report.service.js";

const PG = "pg_b19";
const CO = "co_b19";
const ORDS = ["ord_b19_1", "ord_b19_2", "ord_b19_3"];
const INVS = ["inv_b19_1", "inv_b19_2", "inv_b19_3"];
const OIS = ["oi_b19_1", "oi_b19_2", "oi_b19_3"];

const asOf = new Date(Date.UTC(2026, 5, 30));
const due = (overdueDays: number) => new Date(asOf.getTime() - overdueDays * 86_400_000);

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaFinanceReportRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaFinanceReportRepository — OP-Aging/DSO gegen echtes Postgres", () => {
    const service = new FinanceReportService(new PrismaFinanceReportRepository());

    async function cleanup() {
      await prisma.openItem.deleteMany({ where: { id: { in: OIS } } });
      await prisma.invoice.deleteMany({ where: { id: { in: INVS } } });
      await prisma.order.deleteMany({ where: { id: { in: ORDS } } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "STANDARD", name: "Standard" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });
      for (let i = 0; i < 3; i++) {
        await prisma.order.create({ data: { id: ORDS[i]!, number: `AB-B19-${i + 1}`, companyId: CO } });
      }
      // 3 finalisierte Rechnungen (Umsatz 30000), je ein offener Posten in verschiedenen Buckets.
      await prisma.invoice.create({ data: { id: INVS[0]!, number: "RE-B19-1", orderId: ORDS[0]!, companyId: CO, netCents: 10000, taxCents: 1900, grossCents: 11900, finalized: true, issuedAt: due(20) } });
      await prisma.invoice.create({ data: { id: INVS[1]!, number: "RE-B19-2", orderId: ORDS[1]!, companyId: CO, netCents: 10000, taxCents: 1900, grossCents: 11900, finalized: true, issuedAt: due(50) } });
      await prisma.invoice.create({ data: { id: INVS[2]!, number: "RE-B19-3", orderId: ORDS[2]!, companyId: CO, netCents: 10000, taxCents: 1900, grossCents: 11900, finalized: true, issuedAt: due(100) } });
      await prisma.openItem.create({ data: { id: OIS[0]!, invoiceId: INVS[0]!, openCents: 5000, dueDate: due(10) } }); // 0–30
      await prisma.openItem.create({ data: { id: OIS[1]!, invoiceId: INVS[1]!, openCents: 7000, dueDate: due(45) } }); // 31–60
      await prisma.openItem.create({ data: { id: OIS[2]!, invoiceId: INVS[2]!, openCents: 9000, dueDate: due(120) } }); // >90
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("verteilt offene Posten auf Buckets und rechnet DSO", async () => {
      const r = await service.agingWithDso(due(90), asOf);
      expect(r.d0_30).toBe(5000);
      expect(r.d31_60).toBe(7000);
      expect(r.d90plus).toBe(9000);
      expect(r.total).toBe(21000);
      // DSO = total / Umsatz(im Fenster) × Tage. Umsatzfenster [due(90), asOf): RE-B19-1 (due20)
      // + RE-B19-2 (due50) = 20000; Tage 90. DSO = 21000/20000*90 = 94.5.
      expect(r.dsoDays).toBeCloseTo(94.5, 1);
    });
  });
}
