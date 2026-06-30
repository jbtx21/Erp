// Integrationstest gegen ECHTES Postgres (F4). Bewegungen schreiben das Ledger
// fort, der HAUPT-Cache (StockLevel) folgt; MUSTER-Lager wird getrennt geführt;
// der Saldo entspricht der Summe der Bewegungen. Nur RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { PrismaStockRepository } from "./prisma-stock.repository.js";
import { StockService } from "../modules/stock/stock.service.js";

const ART = "art_stk";
const VAR = "var_stk";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaStockRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("PrismaStockRepository — Bewegungs-Ledger gegen echtes Postgres", () => {
    const service = new StockService(new PrismaStockRepository(), new MemoryAuditSink());

    async function cleanup() {
      await prisma.stockMove.deleteMany({ where: { variantId: VAR } });
      await prisma.stockLevel.deleteMany({ where: { variantId: VAR } });
      await prisma.variant.deleteMany({ where: { id: VAR } });
      await prisma.article.deleteMany({ where: { id: ART } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.article.create({ data: { description: "Testartikel", ekCents: 0, vkCents: 0, id: ART, sku: "ART-STK", name: "Poloshirt" } });
      await prisma.variant.create({ data: { id: VAR, articleId: ART, sku: "STK-1" } });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it("bucht Bewegungen, führt den HAUPT-Cache fort und trennt das MUSTER-Lager", async () => {
      await service.post({ variantId: VAR, deltaQty: 100, grund: "WARENEINGANG" });
      const afterConsume = await service.post({ variantId: VAR, deltaQty: -30, grund: "VERBRAUCH" });
      expect(afterConsume.balanceHaupt).toBe(70);

      // Musterausgabe berührt den HAUPT-Cache nicht.
      const sample = await service.post({ variantId: VAR, deltaQty: 5, grund: "MUSTER", lager: "MUSTER" });
      expect(sample.balanceHaupt).toBe(70);

      const cache = await prisma.stockLevel.findUnique({ where: { variantId: VAR }, select: { qty: true } });
      expect(cache?.qty).toBe(70);

      expect(await service.balance(VAR)).toEqual({ HAUPT: 70, MUSTER: 5, SHOWROOM: 0, TRANSFERDRUCK: 0 });
    });
  });
}
