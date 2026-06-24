// Integrationstest gegen ECHTES Postgres: Angebot→Auftrag materialisiert temporär (frei)
// erfasste Produktpositionen zu festen Artikeln (Article+Variant, STANDARD-Preis = VK) und
// verknüpft die Auftragsposition mit der neuen Variante. Opt-in via RUN_DB_TESTS=1.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@texma/db";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { NumberingService } from "../modules/numbering/numbering.service.js";
import { PrismaNumberingRepository } from "./prisma-numbering.repository.js";
import { PrismaSalesOrderRepository } from "./prisma-sales-order.repository.js";
import { SalesOrderService } from "../modules/sales/sales-order.service.js";

const PG = "pg_so_standard";
const CO = "co_so";
const Q = "quote_so";

const dbConfigured = process.env.RUN_DB_TESTS === "1";

if (!dbConfigured) {
  describe.skip("PrismaSalesOrderRepository (übersprungen: RUN_DB_TESTS!=1)", () => {
    it("benötigt Postgres", () => expect(true).toBe(true));
  });
} else {
  describe("Angebot→Auftrag — Materialisierung temporärer Artikel gegen echtes Postgres", () => {
    const svc = new SalesOrderService(new PrismaSalesOrderRepository(), new NumberingService(new PrismaNumberingRepository()), new MemoryAuditSink());

    async function cleanup() {
      const order = await prisma.order.findFirst({ where: { quoteId: Q }, select: { id: true } });
      if (order) await prisma.orderLine.deleteMany({ where: { orderId: order.id } });
      await prisma.order.deleteMany({ where: { quoteId: Q } });
      await prisma.quoteLine.deleteMany({ where: { quoteId: Q } });
      await prisma.quote.deleteMany({ where: { id: Q } });
      // Materialisierte Artikel (SKU-Präfix AB-…-P) inkl. Preis/Variante entfernen.
      const arts = await prisma.article.findMany({ where: { name: { in: ["Sonder-Polo SO", "Sonderstick SO"] } }, select: { id: true, variants: { select: { id: true } } } });
      const vIds = arts.flatMap((a) => a.variants.map((v) => v.id));
      if (vIds.length) {
        await prisma.priceGroupPrice.deleteMany({ where: { variantId: { in: vIds } } });
        await prisma.variant.deleteMany({ where: { id: { in: vIds } } });
      }
      await prisma.article.deleteMany({ where: { id: { in: arts.map((a) => a.id) } } });
      await prisma.company.deleteMany({ where: { id: CO } });
      await prisma.priceGroup.deleteMany({ where: { id: PG } });
    }

    beforeAll(async () => {
      await cleanup();
      await prisma.priceGroup.create({ data: { id: PG, kind: "STANDARD", name: "Standard (so)" } });
      await prisma.company.create({ data: { id: CO, name: "SO GmbH", priceGroupId: PG } });
      await prisma.quote.create({
        data: {
          id: Q, number: "AN-SO-1", companyId: CO, status: "VERSENDET",
          lines: { create: [
            { position: 1, description: "Sonder-Polo SO", qty: 5, unitNetCents: 1500, kind: "TEXTIL" },
            { position: 2, description: "Sonderstick SO", qty: 5, unitNetCents: 400, kind: "VEREDELUNG" },
            { position: 3, description: "Versand", qty: 1, unitNetCents: 590, kind: "SONSTIGE" },
          ] },
        },
      });
    });
    afterAll(cleanup);

    it("legt feste Artikel an, setzt STANDARD-Preis und verknüpft die Auftragsposition", async () => {
      const res = await svc.convertQuote(Q);

      const order = await prisma.order.findFirst({ where: { quoteId: Q }, select: { id: true, lines: { orderBy: { position: "asc" }, select: { description: true, variantId: true } } } });
      const lines = order!.lines;
      // TEXTIL + VEREDELUNG → feste Variante verknüpft; SONSTIGE bleibt frei (variantId null).
      expect(lines[0]?.variantId).toBeTruthy();
      expect(lines[1]?.variantId).toBeTruthy();
      expect(lines[2]?.variantId).toBeNull();

      const polo = await prisma.article.findFirst({ where: { sku: `${res.number}-P1` }, select: { name: true, isVeredelung: true, variants: { select: { id: true, prices: { select: { netCents: true } } } } } });
      expect(polo).toMatchObject({ name: "Sonder-Polo SO", isVeredelung: false });
      expect(polo?.variants[0]?.prices[0]?.netCents).toBe(1500); // STANDARD-Preis = VK

      const stick = await prisma.article.findFirst({ where: { sku: `${res.number}-P2` }, select: { isVeredelung: true } });
      expect(stick?.isVeredelung).toBe(true);
    });
  });
}
