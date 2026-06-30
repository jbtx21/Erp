// Integrationstest gegen ECHTES Postgres (T-10). Ist-Seite aus Auftragspositionen
// (Umsatz), Bestellpositionen der PA (Material) und Zeiterfassung (Lohn). Distinkter
// PriceGroup.kind (PREMIUM). Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import type { CostSide } from "@texma/shared";
import { PrismaPostCalcRepository } from "./prisma-postcalc.repository.js";
import { PostCalcService } from "../modules/postcalc/postcalc.service.js";

const PG = "pg_pc";
const CO = "co_pc";
const SUP = "sup_pc";
const ART = "art_pc";
const VAR = "var_pc";
const ORD = "order_pc";
const PA = "pa_pc";
const PO = "po_pc";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaPostCalcRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaPostCalcRepository — Nachkalkulation gegen echtes Postgres", () => {
    const service = new PostCalcService(new PrismaPostCalcRepository());

    async function cleanup() {
      await prisma.timeEntry.deleteMany({ where: { productionId: PA } });
      await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: PO } });
      await prisma.purchaseOrder.deleteMany({ where: { id: PO } });
      await prisma.productionOrder.deleteMany({ where: { id: PA } });
      await prisma.orderLine.deleteMany({ where: { orderId: ORD } });
      await prisma.order.deleteMany({ where: { id: ORD } });
      await prisma.variant.deleteMany({ where: { id: VAR } });
      await prisma.article.deleteMany({ where: { id: ART } });
      await prisma.supplier.deleteMany({ where: { id: SUP } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "PREMIUM", name: "Premium" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });
      await prisma.supplier.create({ data: { id: SUP, name: "Stofflieferant", kind: "MANUAL" } });
      await prisma.article.create({ data: { description: "Testartikel", ekCents: 0, vkCents: 0, id: ART, sku: "ART-PC", name: "Shirt" } });
      await prisma.variant.create({ data: { id: VAR, articleId: ART, sku: "PC-1" } });
      await prisma.order.create({
        // Plan-DB je Stück 600 (VK 1000 − EK 400) am Beleg gespeichert → Plan-Material ableitbar.
        data: { id: ORD, number: "AB-PC-1", companyId: CO, lines: { create: { position: 1, description: "Shirt", qty: 100, unitNetCents: 1000, dbCents: 600 } } },
      });
      await prisma.productionOrder.create({ data: { id: PA, number: "PA-PC-1", orderId: ORD } });
      await prisma.purchaseOrder.create({
        data: { id: PO, number: "BE-PC-1", supplierId: SUP, productionId: PA, lines: { create: { variantId: VAR, qty: 100, ekCents: 400 } } },
      });
      await prisma.timeEntry.create({ data: { productionId: PA, userId: "u1", minutes: 600 } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("leitet die Ist-Seite (Umsatz/Material/Lohn) korrekt ab und stellt sie dem Plan gegenüber", async () => {
      // Plan: Umsatz 1000 €, Material 350 €, 500 min × 0,80 € → DB 250 €.
      const plan: CostSide = { revenueCents: 100000, materialCents: 35000, laborMinutes: 500, laborRateCentsPerMinute: 80 };
      const res = await service.compute({ productionId: PA, plan, istLaborRateCentsPerMinute: 80 });

      // Ist: Umsatz 100×10€ = 1000 €, Material 100×4€ = 400 €, 600 min × 0,80 € = 480 € → DB 120 €.
      expect(res.ist).toMatchObject({ revenueCents: 100000, materialCents: 40000, laborCents: 48000, dbCents: 12000 });
      expect(res.dbVarianceCents).toBe(-13000);
    });

    it("leitet die Plan-Seite automatisch aus dem Beleg ab (Plan-Material = Umsatz − Plan-DB)", async () => {
      // Plan-DB 100×600 = 600 €; Plan-Material = 1000 − 600 = 400 €. Plan-Lohn manuell 500 min.
      const res = await service.computeForProduction({ productionId: PA, laborRateCentsPerMinute: 80, planLaborMinutes: 500 });
      expect(res.plan).toMatchObject({ revenueCents: 100000, materialCents: 40000, laborCents: 40000, dbCents: 20000 });
      expect(res.ist.dbCents).toBe(12000);
      expect(res.dbVarianceCents).toBe(-8000);
    });
  });
}
