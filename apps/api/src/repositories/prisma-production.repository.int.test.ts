// Integrationstest gegen ein ECHTES Postgres: Auftrag → Produktionsauftrag (Kap. 5.2).
// Prüft die BOM-Expansion (Set-Position → Komponenten × Menge), die Freigabe-Sperre und
// den Statuswechsel auf IN_PRODUKTION. Opt-in via RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { NumberingService } from "../modules/numbering/numbering.service.js";
import { PrismaNumberingRepository } from "./prisma-numbering.repository.js";
import { PrismaProductionRepository } from "./prisma-production.repository.js";
import { ProductionError, ProductionService } from "../modules/production/production.service.js";

const PG = "pg_prodtest";
const CO = "co_prodtest";
const ART = "art_prodtest";
const SET = "var_prodtest_set";
const COMP = "var_prodtest_comp";
const ORD = "ord_prodtest";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaProductionRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres (RUN_DB_TESTS=1 + DATABASE_URL)", () => { expect(true).toBe(true); });
  });
} else {
  describe("PrismaProductionRepository — Auftrag → PA gegen echtes Postgres", () => {
    const repo = new PrismaProductionRepository();
    const svc = new ProductionService(repo, new NumberingService(new PrismaNumberingRepository()), new MemoryAuditSink());

    async function cleanup() {
      await prisma.bomItem.deleteMany({ where: { production: { orderId: ORD } } });
      await prisma.productionOrder.deleteMany({ where: { orderId: ORD } });
      await prisma.orderLine.deleteMany({ where: { orderId: ORD } });
      await prisma.order.deleteMany({ where: { id: ORD } });
      await prisma.variantComponent.deleteMany({ where: { parentVariantId: SET } });
      await prisma.variant.deleteMany({ where: { id: { in: [SET, COMP] } } });
      await prisma.article.deleteMany({ where: { id: ART } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "WIEDERVERKAEUFER", name: "Prodtest" } });
      await prisma.company.create({ data: { id: CO, name: "Prodtest GmbH", priceGroupId: PG } });
      await prisma.article.create({ data: { id: ART, sku: "PRODSET", name: "Vereins-Set" } });
      await prisma.variant.create({ data: { id: COMP, articleId: ART, sku: "PROD-POLO" } });
      await prisma.variant.create({ data: { id: SET, articleId: ART, sku: "PROD-SET", isBundle: true, bundleComponents: { create: [
        { description: "Polo rot M", qty: 1, componentVariantId: COMP, position: 1 },
        { description: "Stick Brust links", qty: 1, position: 2 },
      ] } } });
      await prisma.order.create({ data: {
        id: ORD, number: "AB-PRODTEST", companyId: CO, status: "ANGELEGT", freigegeben: false,
        zugesagterLiefertermin: new Date("2026-09-30T00:00:00.000Z"),
        lines: { create: [{ position: 1, description: "Vereins-Set", qty: 50, unitNetCents: 4500, variantId: SET }] },
      } });
    });
    afterAll(cleanup);

    it("Terminvorschlag (Werktage) + blockt ohne Freigabe; erzeugt PA mit bestätigtem Termin + Stückliste", async () => {
      await expect(svc.createFromOrder(ORD)).rejects.toBeInstanceOf(ProductionError);

      // Werktage-Terminvorschlag je Veredelungsweg (manuell zu bestätigen).
      const preview = await svc.previewSchedule(ORD, "EXTERN_STICK_SIEBDRUCK");
      expect(preview.leadWorkingDays).toBe(10);
      expect(preview.proposedDueDate).not.toBeNull();
      expect(preview.proposedDueDate!.getTime()).toBeLessThan(new Date("2026-09-30T00:00:00.000Z").getTime());

      await svc.release(ORD);
      const confirmed = preview.proposedDueDate!;
      const res = await svc.createFromOrder(ORD, { dueDate: confirmed });
      expect(res.number).toMatch(/^PA-/);
      expect(res.bomItemCount).toBe(2);
      expect(res.dueDate?.getTime()).toBe(confirmed.getTime());

      const items = await prisma.bomItem.findMany({ where: { production: { orderId: ORD } }, orderBy: { qty: "asc" }, select: { description: true, qty: true, variantId: true } });
      expect(items).toHaveLength(2);
      expect(items.every((i) => i.qty === 50)).toBe(true);
      expect(items.find((i) => i.variantId === COMP)?.description).toBe("Polo rot M");

      const pa = await prisma.productionOrder.findUnique({ where: { orderId: ORD }, select: { dueDate: true } });
      expect(pa?.dueDate?.getTime()).toBe(confirmed.getTime());

      const order = await prisma.order.findUnique({ where: { id: ORD }, select: { status: true } });
      expect(order?.status).toBe("IN_PRODUKTION");

      // 1 Auftrag = 1 PA
      await expect(svc.createFromOrder(ORD)).rejects.toBeInstanceOf(ProductionError);
    });
  });
}
