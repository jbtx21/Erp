// Prisma-Implementierung des Bewegungs-Ledgers (Produktionspfad, F4). Eine Buchung
// schreibt die `StockMove` und schreibt den `StockLevel`-Cache (HAUPT) in derselben
// Transaktion fort — MUSTER-Bewegungen lassen den Hauptbestand unberührt.

import { prisma } from "@texma/db";
import type { StockLager } from "@texma/shared";
import type {
  PostedMove,
  StockBalanceRow,
  StockMoveInput,
  StockRepository,
} from "../modules/stock/stock.service.js";

export class PrismaStockRepository implements StockRepository {
  async postMove(move: StockMoveInput): Promise<PostedMove> {
    return prisma.$transaction(async (tx) => {
      // Klare Meldung statt rohem FK-Fehler, wenn die Varianten-ID nicht existiert.
      const variant = await tx.variant.findUnique({ where: { id: move.variantId }, select: { id: true } });
      if (!variant) throw new Error(`Variante „${move.variantId}" nicht gefunden — bitte eine gültige Varianten-ID/SKU verwenden.`);
      // Multi-Lager 2b: bevorzugt auf warehouseId buchen (beliebiges Lager). Das lager-Enum
      // wird aus der Warehouse-Art abgeleitet (SONSTIGE → HAUPT als Platzhalter), bis das
      // Enum in Stufe 2c entfällt. Ohne warehouseId: Seed-Mapping aus dem Enum (2a).
      let lager: StockLager;
      let warehouseId: string;
      if (move.warehouseId) {
        const wh = await tx.warehouse.findUnique({ where: { id: move.warehouseId }, select: { kind: true } });
        if (!wh) throw new Error(`Lager ${move.warehouseId} nicht gefunden.`);
        warehouseId = move.warehouseId;
        lager = wh.kind === "SONSTIGE" ? "HAUPT" : (wh.kind as StockLager);
      } else {
        lager = move.lager ?? "HAUPT";
        warehouseId = `wh_${lager.toLowerCase()}`;
      }
      const created = await tx.stockMove.create({
        data: {
          variantId: move.variantId,
          deltaQty: move.deltaQty,
          grund: move.grund,
          lager,
          warehouseId,
          belegRef: move.belegRef ?? null,
        },
        select: { id: true },
      });

      let balanceHaupt: number;
      if (lager === "HAUPT") {
        const lvl = await tx.stockLevel.upsert({
          where: { variantId: move.variantId },
          create: { variantId: move.variantId, qty: move.deltaQty },
          update: { qty: { increment: move.deltaQty } },
          select: { qty: true },
        });
        balanceHaupt = lvl.qty;
      } else {
        const lvl = await tx.stockLevel.findUnique({
          where: { variantId: move.variantId },
          select: { qty: true },
        });
        balanceHaupt = lvl?.qty ?? 0;
      }

      return { id: created.id, balanceHaupt };
    });
  }

  async movesByVariant(
    variantId: string
  ): Promise<Array<{ deltaQty: number; lager: StockLager }>> {
    return prisma.stockMove.findMany({
      where: { variantId },
      select: { deltaQty: true, lager: true },
    });
  }

  async listBalances(): Promise<StockBalanceRow[]> {
    const grouped = await prisma.stockMove.groupBy({
      by: ["variantId", "lager"],
      _sum: { deltaQty: true },
    });
    const variantIds = [...new Set(grouped.map((g) => g.variantId))];
    const variants = await prisma.variant.findMany({ where: { id: { in: variantIds } }, select: { id: true, sku: true, article: { select: { name: true } } } });
    const meta = new Map(variants.map((v) => [v.id, { sku: v.sku, name: v.article.name }]));
    const byVariant = new Map<string, StockBalanceRow>();
    for (const g of grouped) {
      const row = byVariant.get(g.variantId) ?? {
        variantId: g.variantId, sku: meta.get(g.variantId)?.sku ?? g.variantId, name: meta.get(g.variantId)?.name ?? "",
        balances: { HAUPT: 0, MUSTER: 0, SHOWROOM: 0, TRANSFERDRUCK: 0 },
      };
      row.balances[g.lager as StockLager] = g._sum.deltaQty ?? 0;
      byVariant.set(g.variantId, row);
    }
    return [...byVariant.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  }
}
