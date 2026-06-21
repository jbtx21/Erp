// 3-Way-Match Eingangsrechnung — Kap. 9.6.
// Bestellung (PO) = Wareneingang = Eingangsrechnung. Abweichungen in Menge oder
// Preis sperren die Rechnung zur Zahlung, bis sie geklärt sind.

import type { Cents } from "./money.js";

export interface ThreeWayInput {
  poQty: number;
  poUnitCents: Cents;
  receivedQty: number;
  invoicedQty: number;
  invoicedUnitCents: Cents;
}

export interface ThreeWayTolerance {
  /** Erlaubte Mengenabweichung (Stück). */
  qtyTolerance: number;
  /** Erlaubte Preisabweichung je Stück (Cent). */
  priceToleranceCents: Cents;
}

export const DEFAULT_TOLERANCE: ThreeWayTolerance = {
  qtyTolerance: 0,
  priceToleranceCents: 0,
};

export type MatchVariance =
  | "MENGE_RECHNUNG_UEBER_BESTELLUNG"
  | "MENGE_RECHNUNG_UEBER_WARENEINGANG"
  | "PREIS_ABWEICHUNG";

export interface ThreeWayResult {
  ok: boolean;
  variances: MatchVariance[];
}

/**
 * Prüft eine Eingangsrechnungsposition gegen Bestellung und Wareneingang (9.6).
 * Es darf nicht mehr berechnet werden als bestellt und nicht mehr als geliefert;
 * der Preis muss innerhalb der Toleranz zur Bestellung liegen.
 */
export function threeWayMatch(
  input: ThreeWayInput,
  tol: ThreeWayTolerance = DEFAULT_TOLERANCE
): ThreeWayResult {
  const variances: MatchVariance[] = [];

  if (input.invoicedQty > input.poQty + tol.qtyTolerance) {
    variances.push("MENGE_RECHNUNG_UEBER_BESTELLUNG");
  }
  if (input.invoicedQty > input.receivedQty + tol.qtyTolerance) {
    variances.push("MENGE_RECHNUNG_UEBER_WARENEINGANG");
  }
  if (Math.abs(input.invoicedUnitCents - input.poUnitCents) > tol.priceToleranceCents) {
    variances.push("PREIS_ABWEICHUNG");
  }

  return { ok: variances.length === 0, variances };
}
