// Integrationstest gegen ECHTES Postgres (B16). Inventur erzeugt einen INVENTUR-
// StockMove-Korrekturbeleg (statt qty direkt zu setzen); der Saldo = Σ Bewegungen.
// Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaStockRepository } from "./prisma-stock.repository.js";
import { StockService } from "../modules/stock/stock.service.js";
import { InventoryService } from "../modules/inventory/inventory.service.js";

const ART = "art_b16";
const VAR = "var_b16";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("InventoryService (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("InventoryService — Inventurkorrektur als Ledger-Beleg gegen echtes Postgres", () => {
    const stock = new StockService(new PrismaStockRepository(), new MemoryAuditSink());
    const inventory = new InventoryService(stock);

    async function cleanup() {
      await prisma.stockMove.deleteMany({ where: { variantId: VAR } });
      await prisma.stockLevel.deleteMany({ where: { variantId: VAR } });
      await prisma.variant.deleteMany({ where: { id: VAR } });
      await prisma.article.deleteMany({ where: { id: ART } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.article.create({ data: { description: "Testartikel", ekCents: 0, vkCents: 0, id: ART, sku: "ART-B16", name: "Poloshirt" } });
      await prisma.variant.create({ data: { id: VAR, articleId: ART, sku: "B16-1" } });
      await stock.post({ variantId: VAR, deltaQty: 100, grund: "WARENEINGANG" });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("erzeugt einen INVENTUR-Beleg und stellt den Saldo richtig", async () => {
      const res = await inventory.recordCount({ variantId: VAR, countedQty: 93, belegRef: "INV-2026-Q2" });
      expect(res).toEqual({ delta: -7, corrected: true });

      const move = await prisma.stockMove.findFirst({ where: { variantId: VAR, grund: "INVENTUR" } });
      expect(move).toMatchObject({ deltaQty: -7, lager: "HAUPT", belegRef: "INV-2026-Q2" });

      // Saldo = Σ Bewegungen (100 − 7); StockLevel-Cache fortgeschrieben.
      expect((await stock.balance(VAR)).HAUPT).toBe(93);
      expect((await prisma.stockLevel.findUnique({ where: { variantId: VAR } }))?.qty).toBe(93);

      // Ohne Abweichung kein zweiter Beleg.
      const again = await inventory.recordCount({ variantId: VAR, countedQty: 93 });
      expect(again.corrected).toBe(false);
      expect(await prisma.stockMove.count({ where: { variantId: VAR, grund: "INVENTUR" } })).toBe(1);
    });
  });
}
