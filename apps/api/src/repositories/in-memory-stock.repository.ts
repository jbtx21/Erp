// In-Memory-Bewegungs-Ledger für Unit-Tests/Dev. Hält die Bewegungen je Variante
// und den HAUPT-Cache analog zur Prisma-Implementierung.

import { balanceByLager, type StockLager } from "@texma/shared";
import type {
  PostedMove,
  StockBalanceRow,
  StockMoveInput,
  StockRepository,
} from "../modules/stock/stock.service.js";

interface Row {
  deltaQty: number;
  lager: StockLager;
}

export class InMemoryStockRepository implements StockRepository {
  private readonly moves = new Map<string, Row[]>();
  private seq = 0;

  async postMove(move: StockMoveInput): Promise<PostedMove> {
    const lager: StockLager = move.lager ?? "HAUPT";
    const rows = this.moves.get(move.variantId) ?? [];
    rows.push({ deltaQty: move.deltaQty, lager });
    this.moves.set(move.variantId, rows);
    const balanceHaupt = rows
      .filter((r) => r.lager === "HAUPT")
      .reduce((s, r) => s + r.deltaQty, 0);
    return { id: `mem-move-${++this.seq}`, balanceHaupt };
  }

  async movesByVariant(variantId: string): Promise<Row[]> {
    return [...(this.moves.get(variantId) ?? [])];
  }

  async listBalances(): Promise<StockBalanceRow[]> {
    return [...this.moves.entries()].map(([variantId, rows]) => ({
      variantId, sku: variantId, name: variantId, balances: balanceByLager(rows),
    }));
  }
}
