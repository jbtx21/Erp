// Integrationstest gegen ein ECHTES Postgres: Set/Bundle-Stückliste auf
// Variantenebene (Kap. 5.1). Prüft setComponents (Replace + isBundle-Flag) und
// listComponents (Label-Auflösung verknüpfter Komponenten). Opt-in via RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { PrismaProductRepository } from "./prisma-product.repository.js";

const ART = "art_test_bundle";
const SET = "var_test_set";
const COMP = "var_test_comp";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaProductRepository — Stückliste (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres (RUN_DB_TESTS=1 + DATABASE_URL)", () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe("PrismaProductRepository — Set/Bundle-Stückliste gegen echtes Postgres", () => {
    const repo = new PrismaProductRepository();

    async function cleanup() {
      await prisma.variantComponent.deleteMany({ where: { OR: [{ parentVariantId: SET }, { componentVariantId: COMP }] } });
      await prisma.variantAttribute.deleteMany({ where: { variantId: { in: [SET, COMP] } } });
      await prisma.variant.deleteMany({ where: { id: { in: [SET, COMP] } } });
      await prisma.article.deleteMany({ where: { id: ART } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.article.create({ data: { description: "Testartikel", ekCents: 0, vkCents: 0, id: ART, sku: "BUNDLE-ART", name: "Vereins-Set" } });
      await prisma.variant.create({ data: { id: SET, articleId: ART, sku: "SET-1" } });
      await prisma.variant.create({ data: { id: COMP, articleId: ART, sku: "POLO-1", attributes: { create: [{ name: "Farbe", value: "rot" }] } } });
    });
    afterAll(cleanup);

    it("setzt Komponenten, markiert isBundle und löst das Komponenten-Label auf", async () => {
      await repo.setComponents(SET, [
        { description: "Polo rot", qty: 1, componentVariantId: COMP },
        { description: "Stick Brust links", qty: 1, componentVariantId: null },
      ]);
      const comps = await repo.listComponents(SET);
      expect(comps).toHaveLength(2);
      expect(comps[0]?.componentLabel).toContain("Vereins-Set");
      expect(comps[1]?.componentLabel).toBeNull();
      const inCatalog = (await repo.catalog()).find((c) => c.variantId === SET);
      expect(inCatalog?.isBundle).toBe(true);
    });

    it("Replace ersetzt vollständig; leere Liste hebt isBundle auf", async () => {
      await repo.setComponents(SET, [{ description: "Nur eine", qty: 2, componentVariantId: null }]);
      expect(await repo.listComponents(SET)).toHaveLength(1);
      await repo.setComponents(SET, []);
      expect(await repo.listComponents(SET)).toHaveLength(0);
      expect((await repo.catalog()).find((c) => c.variantId === SET)?.isBundle).toBe(false);
    });
  });
}
