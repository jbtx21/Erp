// Bestandsführung als Bewegungs-Ledger (F4, Kap. 37.1) — Vorbild Odoo stock.move.
// Reine, IO-freie Saldo-Logik: der Bestand ist die Summe der Bewegungen; er wird
// nie direkt gesetzt. Korrekturen (Inventur) erzeugen wieder eine Bewegung.

export type StockLager = "HAUPT" | "MUSTER";

export type StockMoveReason =
  | "EROEFFNUNG"
  | "WARENEINGANG"
  | "VERBRAUCH"
  | "INVENTUR"
  | "KORREKTUR"
  | "MUSTER";

export interface StockMoveLike {
  deltaQty: number;
  lager?: StockLager;
}

/** Saldo = Summe aller Bewegungs-Deltas (über alle Lager). */
export function currentBalance(moves: ReadonlyArray<StockMoveLike>): number {
  return moves.reduce((sum, m) => sum + m.deltaQty, 0);
}

/** Saldo getrennt je Lager (HAUPT/MUSTER). */
export function balanceByLager(
  moves: ReadonlyArray<StockMoveLike>
): Record<StockLager, number> {
  const out: Record<StockLager, number> = { HAUPT: 0, MUSTER: 0 };
  for (const m of moves) out[m.lager ?? "HAUPT"] += m.deltaQty;
  return out;
}

/**
 * Delta einer Inventur-Korrektur: Ist (gezählt) − Soll (Buchbestand). Positiv =
 * Zugang, negativ = Abgang. Dieses Delta wird als INVENTUR-Bewegung gebucht (B16).
 */
export function inventoryCorrectionDelta(counted: number, book: number): number {
  return counted - book;
}
