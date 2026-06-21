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

/** Abweichungszerlegung des DB (positiv = günstig für den Deckungsbeitrag). */
export interface VarianceBreakdown {
  /** Mehr-/Mindererlös: Ist − Plan. */
  revenueVarianceCents: Cents;
  /** Materialabweichung: Plan − Ist (weniger Material = günstig). */
  materialVarianceCents: Cents;
  /** Lohn-Mengenabweichung (Zeit): (PlanMin − IstMin) × Plan-Satz. */
  laborQtyVarianceCents: Cents;
  /** Lohn-Preisabweichung (Satz): (Plan-Satz − Ist-Satz) × Ist-Minuten. */
  laborRateVarianceCents: Cents;
}

/** Ampel der Nachkalkulation: GRÜN ≥ Plan, GELB knapp darunter, ROT deutlich darunter. */
export type PostCalcStatus = "GRUEN" | "GELB" | "ROT";

export interface PostCalcConfig {
  /** Toleranz: bis zu dieser relativen DB-Unterschreitung noch GELB (z. B. 0.1 = 10 %). */
  warnPct: number;
}

export const DEFAULT_POSTCALC: PostCalcConfig = { warnPct: 0.1 };

export interface PostCalcResult {
  plan: CostSideResult;
  ist: CostSideResult;
  /** Ist-DB − Plan-DB (negativ = schlechter als geplant). */
  dbVarianceCents: Cents;
  /** Abweichung in Prozent des Plan-DB (0..n), 0 wenn Plan-DB ≤ 0. */
  dbVariancePct: number;
  /** DB-Marge in Prozent (DB/Umsatz), kaufmännisch gerundet. */
  planMarginPct: number;
  istMarginPct: number;
  /** Aufgliederung der DB-Abweichung (Material, Lohn-Menge/-Satz, Umsatz). */
  variance: VarianceBreakdown;
  /** Bewertung der Ist-Nachkalkulation gegenüber dem Plan. */
  status: PostCalcStatus;
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

/** DB-Marge in Prozent (DB/Umsatz), gerundet; 0 wenn kein Umsatz. */
export function marginPct(s: CostSideResult): number {
  return s.revenueCents > 0 ? Math.round((s.dbCents / s.revenueCents) * 100) : 0;
}

/**
 * Zerlegt die DB-Abweichung in Umsatz-, Material- und Lohnabweichung (Menge/Satz).
 * Die Summe der vier Komponenten ergibt exakt die DB-Gesamtabweichung (Kontrolle).
 */
export function decomposeVariance(plan: CostSide, ist: CostSide): VarianceBreakdown {
  return {
    revenueVarianceCents: ist.revenueCents - plan.revenueCents,
    materialVarianceCents: plan.materialCents - ist.materialCents,
    laborQtyVarianceCents: roundCents((plan.laborMinutes - ist.laborMinutes) * plan.laborRateCentsPerMinute),
    laborRateVarianceCents: roundCents(
      (plan.laborRateCentsPerMinute - ist.laborRateCentsPerMinute) * ist.laborMinutes
    ),
  };
}

/** Stellt Plan- und Ist-Kalkulation gegenüber (T-10), inkl. Abweichungszerlegung + Ampel. */
export function postCalc(plan: CostSide, ist: CostSide, cfg: PostCalcConfig = DEFAULT_POSTCALC): PostCalcResult {
  const planR = side(plan);
  const istR = side(ist);
  const dbVarianceCents = istR.dbCents - planR.dbCents;
  const dbVariancePct = planR.dbCents > 0 ? dbVarianceCents / planR.dbCents : 0;
  const status: PostCalcStatus =
    dbVarianceCents >= 0 ? "GRUEN" : dbVariancePct >= -cfg.warnPct ? "GELB" : "ROT";
  return {
    plan: planR,
    ist: istR,
    dbVarianceCents,
    dbVariancePct,
    planMarginPct: marginPct(planR),
    istMarginPct: marginPct(istR),
    variance: decomposeVariance(plan, ist),
    status,
  };
}
