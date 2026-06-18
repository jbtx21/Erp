// Nachkalkulation Soll-Ist — Kap. 5.2/9.3. Testfall T-10.
// Bei Auftragsabschluss wird der geplante Deckungsbeitrag dem tatsächlichen
// gegenübergestellt (Material-EK + Lohn aus Zeiterfassung). Macht Abweichungen
// sichtbar (Basis für Reporting Kap. 29).

import { type Cents, roundCents } from "./money.js";

export interface CostSide {
  revenueCents: Cents;
  materialCents: Cents;
  laborMinutes: number;
  laborRateCentsPerMinute: Cents;
}

export interface CostSideResult {
  revenueCents: Cents;
  materialCents: Cents;
  laborCents: Cents;
  /** Deckungsbeitrag = Umsatz − Material − Lohn. */
  dbCents: Cents;
}

export interface PostCalcResult {
  plan: CostSideResult;
  ist: CostSideResult;
  /** Ist-DB − Plan-DB (negativ = schlechter als geplant). */
  dbVarianceCents: Cents;
  /** Abweichung in Prozent des Plan-DB (0..n), 0 wenn Plan-DB ≤ 0. */
  dbVariancePct: number;
}

function side(input: CostSide): CostSideResult {
  const laborCents = roundCents(input.laborMinutes * input.laborRateCentsPerMinute);
  return {
    revenueCents: input.revenueCents,
    materialCents: input.materialCents,
    laborCents,
    dbCents: input.revenueCents - input.materialCents - laborCents,
  };
}

/** Stellt Plan- und Ist-Kalkulation gegenüber (T-10). */
export function postCalc(plan: CostSide, ist: CostSide): PostCalcResult {
  const planR = side(plan);
  const istR = side(ist);
  const dbVarianceCents = istR.dbCents - planR.dbCents;
  return {
    plan: planR,
    ist: istR,
    dbVarianceCents,
    dbVariancePct: planR.dbCents > 0 ? dbVarianceCents / planR.dbCents : 0,
  };
}
