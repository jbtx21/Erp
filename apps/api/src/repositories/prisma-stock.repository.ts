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
    const lager: StockLager = move.lager ?? "HAUPT";
    return prisma.$transaction(async (tx) => {
      const created = await tx.stockMove.create({
        data: {
          variantId: move.variantId,
          deltaQty: move.deltaQty,
          grund: move.grund,
          lager,
          // Multi-Lager Stufe 2a: warehouseId parallel mitschreiben (Seed-Mapping aus dem
          // Enum, Migration 0075). Stufe 2b stellt die Buchung primär auf warehouseId um.
          warehouseId: `wh_${lager.toLowerCase()}`,
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
