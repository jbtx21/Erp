// Bestands-Service auf dem Bewegungs-Ledger (F4, Kap. 37.1). Jede Bestandsänderung
// ist eine append-only `StockMove`; der `StockLevel`-Cache (HAUPT-Lager) wird in
// derselben Transaktion fortgeschrieben. Direktes Setzen von Beständen gibt es
// nicht — Korrekturen (Inventur, B16) laufen ebenfalls als Bewegung.

import {
  balanceByLager,
  type StockLager,
  type StockMoveReason,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface StockMoveInput {
  variantId: string;
  deltaQty: number;
  grund: StockMoveReason;
  lager?: StockLager;
  /** Multi-Lager 2b: bevorzugt — bucht auf ein beliebiges Warehouse (lager wird abgeleitet). */
  warehouseId?: string;
  belegRef?: string | null;
}

export interface PostedMove {
  id: string;
  /** Neuer HAUPT-Lagerbestand nach der Buchung (aus dem Cache). */
  balanceHaupt: number;
}

export interface StockBalanceRow {
  variantId: string;
  sku: string;
  name: string;
  balances: Record<StockLager, number>;
}

/** Eine Zeile des Bewegungs-Journals (append-only Ledger, F4). */
export interface StockMoveRow {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  deltaQty: number;
  grund: StockMoveReason;
  lager: StockLager;
  belegRef: string | null;
  createdAt: Date;
}

export interface StockMoveQuery {
  variantId?: string;
  lager?: StockLager;
  limit: number;
}

export interface StockRepository {
  /** Schreibt eine Bewegung (append-only) und aktualisiert den StockLevel-Cache atomar. */
  postMove(move: StockMoveInput): Promise<PostedMove>;
  /** Alle Bewegungen einer Variante (für Saldo/Audit). */
  movesByVariant(variantId: string): Promise<Array<{ deltaQty: number; lager: StockLager }>>;
  /** Bestandsübersicht je Variante × Lager (für Lager-/Inventur-Ansicht). */
  listBalances(): Promise<StockBalanceRow[]>;
  /** Bewegungs-Journal (neueste zuerst), optional je Variante/Lager gefiltert. */
  listMoves(query: StockMoveQuery): Promise<StockMoveRow[]>;
}

export class StockService {
  constructor(
    private readonly repo: StockRepository,
    private readonly audit: AuditSink
  ) {}

  /** Bestandsübersicht je Variante × Lager. */
  listBalances(): Promise<StockBalanceRow[]> { return this.repo.listBalances(); }

  /** Bestandsbewegungs-Journal (F4): das append-only Ledger lesbar machen. */
  listMoves(opts: { variantId?: string; lager?: StockLager; limit?: number } = {}): Promise<StockMoveRow[]> {
    return this.repo.listMoves({ variantId: opts.variantId, lager: opts.lager, limit: opts.limit ?? 200 });
  }

  /** Bucht eine Bestandsbewegung und protokolliert sie im Audit-Trail. */
  async post(move: StockMoveInput): Promise<PostedMove> {
    if (!Number.isInteger(move.deltaQty) || move.deltaQty === 0) {
      throw new Error("deltaQty must be a non-zero integer");
    }
    const res = await this.repo.postMove(move);
    await this.audit.append(
      buildEntry({
        entity: "StockMove",
        entityId: res.id,
        action: "CREATE",
        after: {
          variantId: move.variantId,
          deltaQty: move.deltaQty,
          grund: move.grund,
          lager: move.lager ?? "HAUPT",
          belegRef: move.belegRef ?? null,
        },
      })
    );
    return res;
  }

  /** Aktueller Saldo je Lager (HAUPT/MUSTER) aus dem Ledger. */
  async balance(variantId: string): Promise<Record<StockLager, number>> {
    return balanceByLager(await this.repo.movesByVariant(variantId));
  }
}
