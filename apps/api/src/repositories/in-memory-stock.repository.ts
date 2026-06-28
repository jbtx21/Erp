// In-Memory-Bewegungs-Ledger für Unit-Tests/Dev. Hält die Bewegungen je Variante
// und den HAUPT-Cache analog zur Prisma-Implementierung.

import { balanceByLager, type StockLager, type StockMoveReason } from "@texma/shared";
import type {
  PostedMove,
  StockBalanceRow,
  StockMoveInput,
  StockMoveQuery,
  StockMoveRow,
  StockRepository,
} from "../modules/stock/stock.service.js";

interface Row {
  id: string;
  deltaQty: number;
  lager: StockLager;
  grund: StockMoveReason;
  belegRef: string | null;
  createdAt: Date;
}

export class InMemoryStockRepository implements StockRepository {
  private readonly moves = new Map<string, Row[]>();
  private seq = 0;

  async postMove(move: StockMoveInput): Promise<PostedMove> {
    const lager: StockLager = move.lager ?? "HAUPT";
    const id = `mem-move-${++this.seq}`;
    const rows = this.moves.get(move.variantId) ?? [];
    rows.push({ id, deltaQty: move.deltaQty, lager, grund: move.grund, belegRef: move.belegRef ?? null, createdAt: new Date() });
    this.moves.set(move.variantId, rows);
    const balanceHaupt = rows
      .filter((r) => r.lager === "HAUPT")
      .reduce((s, r) => s + r.deltaQty, 0);
    return { id, balanceHaupt };
  }

  async movesByVariant(variantId: string): Promise<Array<{ deltaQty: number; lager: StockLager }>> {
    return (this.moves.get(variantId) ?? []).map((r) => ({ deltaQty: r.deltaQty, lager: r.lager }));
  }

  async listBalances(): Promise<StockBalanceRow[]> {
    return [...this.moves.entries()].map(([variantId, rows]) => ({
      variantId, sku: variantId, name: variantId, balances: balanceByLager(rows),
    }));
  }

  async listMoves(query: StockMoveQuery): Promise<StockMoveRow[]> {
    const all: StockMoveRow[] = [];
    for (const [variantId, rows] of this.moves.entries()) {
      for (const r of rows) all.push({ id: r.id, variantId, sku: variantId, name: variantId, deltaQty: r.deltaQty, grund: r.grund, lager: r.lager, belegRef: r.belegRef, createdAt: r.createdAt });
    }
    return all
      .filter((m) => (query.variantId ? m.variantId === query.variantId : true) && (query.lager ? m.lager === query.lager : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, query.limit);
  }
}
