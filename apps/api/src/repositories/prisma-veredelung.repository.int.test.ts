// Integrationstest gegen ECHTES Postgres: Veredelungs-/Logo-Artikel (Kap. 5.4/11).
// Prüft die Anlage mit Pflicht-Veredler, EK (SupplierItem) und Mengenstaffel
// (PriceGroupPriceTier unter STANDARD). Opt-in via RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaProductRepository } from "./prisma-product.repository.js";
import { ProductError, ProductService } from "../modules/product/product.service.js";

const PG = "pg_vtest_standard";
const SUP = "sup_vtest_stick";
const SKU = "LOGO-VTEST";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaProductRepository.createVeredelungArticle (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => { expect(true).toBe(true); });
  });
} else {
  describe("Veredelungs-/Logo-Artikel gegen echtes Postgres", () => {
    const svc = new ProductService(new PrismaProductRepository(), new MemoryAuditSink());

    async function cleanup() {
      const arts = await prisma.article.findMany({ where: { sku: SKU }, select: { id: true, variants: { select: { id: true } } } });
      const variantIds = arts.flatMap((a) => a.variants.map((v) => v.id));
      if (variantIds.length) {
        await prisma.priceGroupPriceTier.deleteMany({ where: { variantId: { in: variantIds } } });
        await prisma.supplierItem.deleteMany({ where: { variantId: { in: variantIds } } });
      }
      await prisma.finishingSpec.deleteMany({ where: { article: { sku: SKU } } });
      await prisma.variant.deleteMany({ where: { sku: SKU } });
      await prisma.article.deleteMany({ where: { sku: SKU } });
      await prisma.supplier.deleteMany({ where: { id: SUP } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      // STANDARD-Preisgruppe ggf. anlegen (Staffel hängt darunter).
      await prisma.priceGroup.upsert({ where: { id: PG }, update: {}, create: { id: PG, kind: "STANDARD", name: "Standard (vtest)" } }).catch(() => {});
      await prisma.supplier.create({ data: { id: SUP, name: "Stick-Partner Nord (vtest)" } });
    });
    afterAll(cleanup);

    it("legt Logo mit Veredler + EK + Staffel an; verknüpft alles korrekt", async () => {
      const entry = await svc.createVeredelungArticle({
        name: "Logo vtest", sku: SKU, method: "STICK", placement: "Brust links", veredlerId: SUP,
        ekCents: 250, tiers: [{ minMenge: 1, vkCents: 600 }, { minMenge: 50, vkCents: 450 }],
      });
      expect(entry.sku).toBe(SKU);

      const art = await prisma.article.findFirst({ where: { sku: SKU }, select: { isVeredelung: true, veredlerId: true, finishingSpecs: { select: { method: true } } } });
      expect(art?.isVeredelung).toBe(true);
      expect(art?.veredlerId).toBe(SUP);
      expect(art?.finishingSpecs[0]?.method).toBe("STICK");

      const ek = await prisma.supplierItem.findFirst({ where: { variantId: entry.variantId }, select: { supplierId: true, ekCents: true } });
      expect(ek).toMatchObject({ supplierId: SUP, ekCents: 250 });

      const tiers = await prisma.priceGroupPriceTier.findMany({ where: { variantId: entry.variantId }, orderBy: { minMenge: "asc" }, select: { minMenge: true, netCents: true } });
      expect(tiers).toEqual([{ minMenge: 1, netCents: 600 }, { minMenge: 50, netCents: 450 }]);
    });

    it("weist einen unbekannten Veredler ab", async () => {
      await expect(svc.createVeredelungArticle({ name: "X", sku: "LOGO-VTEST-2", method: "STICK", veredlerId: "nope" }))
        .rejects.toBeInstanceOf(ProductError);
    });
  });
}
