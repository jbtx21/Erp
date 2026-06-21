// Integrationstest gegen ECHTES Postgres (B7). Rechnungen werden Kostenstellen
// zugeordnet; die Auswertung summiert je Kostenstelle (keine Buchung, G1). Nur
// RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaCostCenterRepository } from "./prisma-cost-center.repository.js";
import { CostCenterService } from "../modules/cost-center/cost-center.service.js";

const PG = "pg_b7";
const CO = "co_b7";
const ORDS = ["ord_b7_1", "ord_b7_2", "ord_b7_3"];
const INVS = ["inv_b7_1", "inv_b7_2", "inv_b7_3"];

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaCostCenterRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaCostCenterRepository — Auswertung je Kostenstelle gegen echtes Postgres", () => {
    const service = new CostCenterService(new PrismaCostCenterRepository(), new MemoryAuditSink());

    async function cleanup() {
      await prisma.invoice.deleteMany({ where: { id: { in: INVS } } });
      await prisma.order.deleteMany({ where: { id: { in: ORDS } } });
      await prisma.costCenter.deleteMany({ where: { nummer: { in: ["K100", "K200"] } } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    let ccA = "";
    let ccB = "";

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "STANDARD", name: "Standard" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });
      ccA = (await service.create("K100", "Stickerei")).id;
      ccB = (await service.create("K200", "Druck")).id;

      for (let i = 0; i < 3; i++) {
        await prisma.order.create({ data: { id: ORDS[i]!, number: `AB-B7-${i + 1}`, companyId: CO } });
      }
      // 2 Rechnungen auf K100 (5000 + 2500), 1 auf K200 (3000), 1 unzugeordnet via assign später.
      await prisma.invoice.create({ data: { id: INVS[0]!, number: "RE-B7-1", orderId: ORDS[0]!, companyId: CO, netCents: 5000, taxCents: 950, grossCents: 5950, costCenterId: ccA } });
      await prisma.invoice.create({ data: { id: INVS[1]!, number: "RE-B7-2", orderId: ORDS[1]!, companyId: CO, netCents: 3000, taxCents: 570, grossCents: 3570, costCenterId: ccB } });
      await prisma.invoice.create({ data: { id: INVS[2]!, number: "RE-B7-3", orderId: ORDS[2]!, companyId: CO, netCents: 2500, taxCents: 475, grossCents: 2975 } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("summiert je Kostenstelle; nachträgliche Zuordnung verschiebt den Betrag", async () => {
      const before = await service.invoiceReport();
      // Reihenfolge der cuids ist nicht vorhersagbar — über Map vergleichen.
      const m = new Map(before.map((r) => [r.costCenterId, r]));
      expect(m.get(ccA)).toEqual({ costCenterId: ccA, totalCents: 5000, count: 1 });
      expect(m.get(ccB)).toEqual({ costCenterId: ccB, totalCents: 3000, count: 1 });
      expect(m.get(null)).toEqual({ costCenterId: null, totalCents: 2500, count: 1 });
      expect(before.at(-1)?.costCenterId).toBeNull(); // null sortiert zuletzt

      await service.assignInvoice(INVS[2]!, ccA);
      const after = await service.invoiceReport();
      const m2 = new Map(after.map((r) => [r.costCenterId, r]));
      expect(m2.get(ccA)).toEqual({ costCenterId: ccA, totalCents: 7500, count: 2 });
      expect(m2.get(ccB)).toEqual({ costCenterId: ccB, totalCents: 3000, count: 1 });
      expect(after.some((r) => r.costCenterId === null)).toBe(false);
    });
  });
}
