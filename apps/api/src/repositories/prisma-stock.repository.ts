// Prisma-Implementierung des Bewegungs-Ledgers (Produktionspfad, F4). Eine Buchung
// schreibt die `StockMove` und schreibt den `StockLevel`-Cache (HAUPT) in derselben
// Transaktion fort — MUSTER-Bewegungen lassen den Hauptbestand unberührt.

import { prisma } from "@texma/db";
import type { StockLager } from "@texma/shared";
import type {
  PostedMove,
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
}
