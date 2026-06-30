// Integrationstest gegen ECHTES Postgres (T-11). Basisfelder werden aus PA → Auftrag,
// Stücklisten-Variante (Farbe/Größe aus Attributen) und aktiver Logo-Version abgeleitet;
// mit den Dienstleister-Feldern entsteht ein vollständiges PDF. Distinkter
// PriceGroup.kind (PREMIUM). Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { ProductionSheetService } from "../modules/production-sheet/production-sheet.service.js";
import { PrismaProductionSheetRepository } from "./prisma-production-sheet.repository.js";

const PG = "pg_ps";
const CO = "co_ps";
const ART = "art_ps";
const VAR = "var_ps";
const ORD = "order_ps";
const PA = "pa_ps";
const LOGO = "logo_ps";
const ATTR_F = "attr_ps_f";
const ATTR_G = "attr_ps_g";
const BOM = "bom_ps";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaProductionSheetRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaProductionSheetRepository — Produktionszettel gegen echtes Postgres", () => {
    const service = new ProductionSheetService(new PrismaProductionSheetRepository());

    async function cleanup() {
      await prisma.bomItem.deleteMany({ where: { id: BOM } });
      await prisma.productionOrder.deleteMany({ where: { id: PA } });
      await prisma.order.deleteMany({ where: { id: ORD } });
      await prisma.logoVersion.deleteMany({ where: { id: LOGO } });
      await prisma.variantAttribute.deleteMany({ where: { id: { in: [ATTR_F, ATTR_G] } } });
      await prisma.variant.deleteMany({ where: { id: VAR } });
      await prisma.article.deleteMany({ where: { id: ART } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "PREMIUM", name: "Premium" } });
      await prisma.company.create({ data: { id: CO, name: "ACME GmbH", priceGroupId: PG } });
      await prisma.logoVersion.create({ data: { id: LOGO, companyId: CO, version: 3, fileRef: "drive://logo", active: true } });
      await prisma.article.create({ data: { description: "Testartikel", ekCents: 0, vkCents: 0, id: ART, sku: "ART-PS", name: "Polo" } });
      await prisma.variant.create({ data: { id: VAR, articleId: ART, sku: "PS-1" } });
      await prisma.variantAttribute.create({ data: { id: ATTR_F, variantId: VAR, name: "Farbe", value: "Blau" } });
      await prisma.variantAttribute.create({ data: { id: ATTR_G, variantId: VAR, name: "Größe", value: "XL" } });
      await prisma.order.create({ data: { id: ORD, number: "AB-PS-1", companyId: CO } });
      await prisma.productionOrder.create({ data: { id: PA, number: "PA-PS-1", orderId: ORD } });
      await prisma.bomItem.create({ data: { id: BOM, productionId: PA, variantId: VAR, description: "Polo Blau XL", qty: 50 } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("leitet die Basisfelder ab und rendert ein vollständiges externes PDF", async () => {
      const res = await service.render({
        productionId: PA,
        kind: "EXTERN",
        extra: {
          dienstleister: "Siebdruck-Partner",
          positionierung: "Brust links",
          anlieferDatum: new Date(Date.UTC(2026, 5, 1)),
          fertigstellDatum: new Date(Date.UTC(2026, 5, 8)),
        },
      });
      expect(res.fileName).toBe("Produktionszettel-AB-PS-1-EXTERN.pdf");
      expect(Buffer.from(res.pdfBase64, "base64").subarray(0, 5).toString("ascii")).toBe("%PDF-");
    });
  });
}
