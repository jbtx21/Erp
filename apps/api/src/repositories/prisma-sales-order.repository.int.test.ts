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
            // P1 mit 10 % Positionsrabatt: VK-Liste 1500, effektiv 1350.
            { position: 1, description: "Sonder-Polo SO", qty: 5, unitNetCents: 1350, listNetCents: 1500, rabattPct: 10, kind: "TEXTIL" },
            { position: 2, description: "Sonderstick SO", qty: 5, unitNetCents: 400, kind: "VEREDELUNG" },
            { position: 3, description: "Versand", qty: 1, unitNetCents: 590, kind: "SONSTIGE" },
          ] },
        },
      });
    });
    afterAll(cleanup);

    it("legt feste Artikel an, setzt STANDARD-Preis und verknüpft die Auftragsposition", async () => {
      const res = await svc.convertQuote(Q);

      const order = await prisma.order.findFirst({ where: { quoteId: Q }, select: { id: true, lines: { orderBy: { position: "asc" }, select: { description: true, variantId: true, unitNetCents: true, listNetCents: true, rabattPct: true } } } });
      const lines = order!.lines;
      // TEXTIL + VEREDELUNG → feste Variante verknüpft; SONSTIGE bleibt frei (variantId null).
      expect(lines[0]?.variantId).toBeTruthy();
      expect(lines[1]?.variantId).toBeTruthy();
      expect(lines[2]?.variantId).toBeNull();
      // Positionsrabatt bleibt erhalten: effektiver Netto 1350, VK-Liste 1500, 10 %.
      expect(lines[0]).toMatchObject({ unitNetCents: 1350, listNetCents: 1500, rabattPct: 10 });

      const polo = await prisma.article.findFirst({ where: { sku: `${res.number}-P1` }, select: { name: true, type: true, description: true, variants: { select: { id: true, prices: { select: { netCents: true } } } } } });
      expect(polo).toMatchObject({ name: "Sonder-Polo SO", type: "STOCK", description: "Sonder-Polo SO" });
      expect(polo?.variants[0]?.prices[0]?.netCents).toBe(1500); // STANDARD-Preis = VK-Liste (ohne Rabatt)

      const stick = await prisma.article.findFirst({ where: { sku: `${res.number}-P2` }, select: { type: true } });
      expect(stick?.type).toBe("FINISHING");
    });

    it("orderForEdit + updateOrder: lädt und ersetzt die Positionen (vor Fakturierung)", async () => {
      const order = await prisma.order.findFirst({ where: { quoteId: Q }, select: { id: true } });
      const edit = await svc.getOrderForEdit(order!.id);
      expect(edit.invoiced).toBe(false);
      expect(edit.inProduction).toBe(false);
      expect(edit.delivered).toBe(false);
      expect(edit.lines.length).toBe(3);

      await svc.updateOrder(order!.id, CO, [
        { description: "Neu-Polo", qty: 7, unitNetCents: 1800, listNetCents: 2000, rabattPct: 10, kind: "TEXTIL", dbCents: 800 },
      ]);
      const after = await prisma.orderLine.findMany({ where: { orderId: order!.id }, orderBy: { position: "asc" }, select: { description: true, qty: true, unitNetCents: true, listNetCents: true, rabattPct: true } });
      expect(after).toEqual([{ description: "Neu-Polo", qty: 7, unitNetCents: 1800, listNetCents: 2000, rabattPct: 10 }]);
    });
  });
}
