// Integrationstest gegen ECHTES Postgres (T-04). PA mit zwei Fremdvergabe-Stufen
// (Siebdruck → Stick): Stufe 2 startet erst nach Rücklauf von Stufe 1; Rücklauf-
// Zeitstempel wird gesetzt. Distinkter PriceGroup.kind (STANDARD via eigener Order-
// freier Aufbau; hier AGENTUR um Kollisionen zu meiden). Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { SubProductionTransitionError } from "@texma/shared";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaSubProductionRepository } from "./prisma-subproduction.repository.js";
import { SubProductionService } from "../modules/subproduction/subproduction.service.js";

const PG = "pg_sub";
const CO = "co_sub";
const S1 = "sup_sub_sieb";
const S2 = "sup_sub_stick";
const ORD = "order_sub";
const PA = "pa_sub";
const SUB1 = "sub_sub_1";
const SUB2 = "sub_sub_2";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaSubProductionRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaSubProductionRepository — mehrstufige Fremdvergabe gegen echtes Postgres", () => {
    const service = new SubProductionService(new PrismaSubProductionRepository(), new MemoryAuditSink());

    async function cleanup() {
      await prisma.subProductionOrder.deleteMany({ where: { id: { in: [SUB1, SUB2] } } });
      await prisma.productionOrder.deleteMany({ where: { id: PA } });
      await prisma.order.deleteMany({ where: { id: ORD } });
      await prisma.supplier.deleteMany({ where: { id: { in: [S1, S2] } } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "AGENTUR", name: "Agentur" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });
      await prisma.supplier.create({ data: { id: S1, name: "Siebdruck-Partner", kind: "MANUAL" } });
      await prisma.supplier.create({ data: { id: S2, name: "Stickerei-Partner", kind: "MANUAL" } });
      await prisma.order.create({ data: { id: ORD, number: "AB-SUB-1", companyId: CO } });
      await prisma.productionOrder.create({ data: { id: PA, number: "PA-SUB-1", orderId: ORD } });
      await prisma.subProductionOrder.create({ data: { id: SUB1, number: "PA-SUB-1-a", productionId: PA, sequence: 1, supplierId: S1 } });
      await prisma.subProductionOrder.create({ data: { id: SUB2, number: "PA-SUB-1-b", productionId: PA, sequence: 2, supplierId: S2 } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("erzwingt die Reihenfolge, bucht Mengen und liefert einen Plan mit Schwund", async () => {
      // Stufe 2 zuerst → blockiert.
      await expect(service.advanceStage(SUB2, "BEISTELLUNG_VERSANDT")).rejects.toBeInstanceOf(
        SubProductionTransitionError
      );

      const at = new Date(Date.UTC(2026, 5, 10));
      await service.advanceStage(SUB1, "BEISTELLUNG_VERSANDT", at, { menge: 100 });
      await service.advanceStage(SUB1, "RUECKLAUF_ERHALTEN", at, { menge: 96 });
      await service.advanceStage(SUB2, "BEISTELLUNG_VERSANDT", at, { menge: 96 });
      await service.advanceStage(SUB2, "RUECKLAUF_ERHALTEN", at, { menge: 90 });

      const sub2 = await prisma.subProductionOrder.findUnique({ where: { id: SUB2 } });
      expect(sub2).toMatchObject({ status: "RUECKLAUF_ERHALTEN", beistellMenge: 96, ruecklaufMenge: 90 });
      expect(sub2?.ruecklaufErhaltenAm?.toISOString().slice(0, 10)).toBe("2026-06-10");

      const status = await service.productionSubStatus(PA);
      expect(status.allReturned).toBe(true);

      // Plan: Gesamtschwund 4 (Stufe 1) + 6 (Stufe 2) = 10; Kettenausbeute 90 %.
      const plan = await service.productionSubPlan(PA, new Date(Date.UTC(2026, 5, 12)));
      expect(plan.totalScrap).toBe(10);
      expect(plan.yieldPercent).toBe(90);
      expect(plan.progressPercent).toBe(100);
      expect(plan.allReturned).toBe(true);
    });
  });
}
