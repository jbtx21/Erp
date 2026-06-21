// Integrationstest gegen ECHTES Postgres (B4 / T-15). Eine Variante mit Einzelpreis,
// Preisgruppen-Staffel und kundenindividueller Staffel — geprüft wird die Präzedenz
// und die Stufenwahl an der Mengengrenze. Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { PrismaPricingRepository } from "./prisma-pricing.repository.js";
import { PricingService } from "../modules/pricing/pricing.service.js";

const PG = "pg_b4";
const CO = "co_b4";
const ART = "art_b4";
const VAR = "var_b4";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaPricingRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaPricingRepository — Mengenstaffel mit Präzedenz gegen echtes Postgres", () => {
    const service = new PricingService(new PrismaPricingRepository());

    async function cleanup() {
      await prisma.customerPriceTier.deleteMany({ where: { variantId: VAR } });
      await prisma.priceGroupPriceTier.deleteMany({ where: { variantId: VAR } });
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
      await prisma.article.create({ data: { id: ART, sku: "ART-B4", name: "Poloshirt" } });
      await prisma.variant.create({ data: { id: VAR, articleId: ART, sku: "B4-1" } });
      await prisma.priceGroupPrice.create({ data: { variantId: VAR, priceGroupId: PG, netCents: 1200 } });
      await prisma.priceGroupPriceTier.createMany({
        data: [
          { variantId: VAR, priceGroupId: PG, minMenge: 1, netCents: 1000 },
          { variantId: VAR, priceGroupId: PG, minMenge: 10, netCents: 900 },
        ],
      });
      await prisma.customerPriceTier.createMany({
        data: [
          { companyId: CO, variantId: VAR, minMenge: 10, netCents: 800 },
        ],
      });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("wählt Preis nach Präzedenz und Mengengrenze (T-15)", async () => {
      // Menge 5: keine Kundenstaffel (min 10), Preisgruppen-Staffel Stufe 1 → 1000.
      expect(await service.netPrice(CO, VAR, 5)).toBe(1000);
      // Menge 10: kundenindividuelle Staffel greift und sticht → 800.
      expect(await service.netPrice(CO, VAR, 10)).toBe(800);
    });
  });
}
