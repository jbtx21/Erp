// Integrationstest gegen ein ECHTES Postgres (C3). Prüft den Lieferanten-Katalog-
// Import auf Datenbankebene: Variantenauflösung per sku, idempotentes Upsert über
// (supplierId, variantId) und das IntegrationLog (INBOUND/catalog.sync). Läuft nur
// mit RUN_DB_TESTS=1 (sonst skip), damit Umgebungen ohne DB nicht fehlschlagen.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import type { SupplierCatalogItem } from "@texma/shared";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaSupplierRepository } from "./prisma-supplier.repository.js";
import { SupplierImportService } from "../modules/supplier-import/supplier-import.service.js";

const ART = "art_test_supplier";
const VAR1 = "var_test_red_l";
const VAR2 = "var_test_blk_m";
const SUP = "sup_test_id_identity";

const item = (sku: string, ekCents: number, qty: number | null): SupplierCatalogItem => ({
  supplierSku: `IDI-${sku}`,
  sku,
  ekCents,
  availableQty: qty,
});

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaSupplierRepository — Katalog (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres (RUN_DB_TESTS=1 + DATABASE_URL)", () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe("PrismaSupplierRepository — Katalog-Import gegen echtes Postgres", () => {
    const repo = new PrismaSupplierRepository();
    const service = new SupplierImportService(repo, new MemoryAuditSink());

    async function cleanup() {
      await prisma.supplierItem.deleteMany({ where: { supplierId: SUP } });
      await prisma.supplier.deleteMany({ where: { id: SUP } });
      await prisma.variantAttribute.deleteMany({ where: { variantId: { in: [VAR1, VAR2] } } });
      await prisma.variant.deleteMany({ where: { id: { in: [VAR1, VAR2] } } });
      await prisma.article.deleteMany({ where: { id: ART } });
      await prisma.integrationLog.deleteMany({ where: { connector: "supplier-id_identity" } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.article.create({ data: { description: "Testartikel", ekCents: 0, vkCents: 0, id: ART, sku: "ART-TEST", name: "Test-Shirt" } });
      await prisma.variant.create({ data: { id: VAR1, articleId: ART, sku: "0020-RED-L" } });
      await prisma.variant.create({ data: { id: VAR2, articleId: ART, sku: "0021-BLK-M" } });
      await prisma.supplier.create({
        data: { id: SUP, name: "ID Identity", kind: "ID_IDENTITY", active: true },
      });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("upsertet bekannte SKUs, überspringt unbekannte und ist idempotent", async () => {
      const first = await service.ingestCatalog(SUP, [
        item("0020-RED-L", 590, 120),
        item("S-UNKNOWN", 999, 5),
        item("0021-BLK-M", 745, 0),
      ]);
      expect(first).toMatchObject({ upserted: 2, skipped: 1 });
      expect(await prisma.supplierItem.count({ where: { supplierId: SUP } })).toBe(2);

      // Zweiter Lauf mit geändertem EK/Bestand → kein Duplikat, Werte fortgeschrieben.
      const second = await service.ingestCatalog(SUP, [item("0020-RED-L", 610, 80)]);
      expect(second.upserted).toBe(1);
      expect(await prisma.supplierItem.count({ where: { supplierId: SUP } })).toBe(2);

      const updated = await prisma.supplierItem.findUnique({
        where: { supplierId_variantId: { supplierId: SUP, variantId: VAR1 } },
      });
      expect(updated).toMatchObject({ ekCents: 610, availableQty: 80, supplierSku: "IDI-0020-RED-L" });
    });

    it("kann einen Katalog-Lauf im IntegrationLog ablegen (INBOUND/catalog.sync)", async () => {
      // Bildet ab, was der Worker-Runner via PrismaIntegrationLogStore schreibt (C3).
      await prisma.integrationLog.create({
        data: {
          connector: "supplier-id_identity",
          direction: "INBOUND",
          operation: "catalog.sync",
          status: "SUCCESS",
          attempt: 1,
          durationMs: 5,
        },
      });
      const log = await prisma.integrationLog.findFirst({
        where: { connector: "supplier-id_identity", operation: "catalog.sync" },
      });
      expect(log).toMatchObject({ direction: "INBOUND", status: "SUCCESS" });
    });
  });
}
