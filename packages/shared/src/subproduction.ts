// Mehrstufige Fremdvergabe (Lohnveredelung) — Kap. 5.3. Testfall T-04 (Custom, Kap. 31).
// Ein Produktionsauftrag wird an externe Veredler vergeben (z. B. erst Siebdruck,
// dann Stickerei). Je Stufe wird Material beigestellt (Beistellung versandt) und
// der Rücklauf gebucht. Stufen laufen sequenziell: Stufe n+1 startet erst, wenn der
// Rücklauf von Stufe n da ist.

import { defineMachine } from "./statemachine.js";

export type SubProductionStatus =
  | "OFFEN"
  | "BEISTELLUNG_VERSANDT"
  | "RUECKLAUF_ERHALTEN"
  | "ABGESCHLOSSEN";

export interface SubProductionStage {
  /** Reihenfolge der Stufe (1, 2, …). */
  sequence: number;
  supplierId: string;
  status: SubProductionStatus;
  beistellungVersandtAm?: Date | null;
  ruecklaufErhaltenAm?: Date | null;
  /** Beigestellte Menge (an den Veredler geschickt). */
  beistellMenge?: number | null;
  /** Zurückerhaltene Menge (Rücklauf) — ≤ Beistellmenge (Schwund/Ausschuss). */
  ruecklaufMenge?: number | null;
  /** Zugesagter Rücklauftermin der Stufe (für Überfälligkeit/Ampel). */
  dueDate?: Date | null;
  /** Lohnkosten dieser Veredelungsstufe in Cent (Nachkalkulation). */
  lohnCents?: number | null;
}

export class SubProductionTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubProductionTransitionError";
  }
}

// Zustandsmaschine der Stufe — nutzt den gemeinsamen Helfer (F2). Übergänge
// unverändert: sequenziell OFFEN → BEISTELLUNG_VERSANDT → RUECKLAUF_ERHALTEN →
// ABGESCHLOSSEN.
const subProductionMachine = defineMachine<SubProductionStatus>("SubProduction", {
  OFFEN: ["BEISTELLUNG_VERSANDT"],
  BEISTELLUNG_VERSANDT: ["RUECKLAUF_ERHALTEN"],
  RUECKLAUF_ERHALTEN: ["ABGESCHLOSSEN"],
  ABGESCHLOSSEN: [],
});

/** Prüft, ob ein Statuswechsel fachlich erlaubt ist. */
export function canTransition(
  from: SubProductionStatus,
  to: SubProductionStatus
): boolean {
  return subProductionMachine.can(from, to);
}

/**
 * Führt einen Statuswechsel einer Stufe durch und setzt die zugehörigen
 * Zeitstempel (Beistellung/Rücklauf). Wirft bei unerlaubtem Übergang.
 */
export function transitionStage(
  stage: SubProductionStage,
  to: SubProductionStatus,
  at: Date
): SubProductionStage {
  if (!canTransition(stage.status, to)) {
    throw new SubProductionTransitionError(
      `Übergang ${stage.status} → ${to} nicht erlaubt (T-04).`
    );
  }
  return {
    ...stage,
    status: to,
    beistellungVersandtAm:
      to === "BEISTELLUNG_VERSANDT" ? at : stage.beistellungVersandtAm ?? null,
    ruecklaufErhaltenAm:
      to === "RUECKLAUF_ERHALTEN" ? at : stage.ruecklaufErhaltenAm ?? null,
  };
}

/**
 * Darf eine Stufe starten (Beistellung versenden)? Nur, wenn alle vorherigen
 * Stufen ihren Rücklauf erhalten haben (sequenzielle Fremdvergabe, T-04).
 */
export function canStartStage(
  stages: ReadonlyArray<SubProductionStage>,
  sequence: number
): boolean {
  return stages
    .filter((s) => s.sequence < sequence)
    .every(
      (s) => s.status === "RUECKLAUF_ERHALTEN" || s.status === "ABGESCHLOSSEN"
    );
}

/** Der gesamte Auftrag ist fremdvergabeseitig fertig, wenn jede Stufe zurück ist. */
export function allStagesReturned(
  stages: ReadonlyArray<SubProductionStage>
): boolean {
  if (stages.length === 0) return true;
  return stages.every(
    (s) => s.status === "RUECKLAUF_ERHALTEN" || s.status === "ABGESCHLOSSEN"
  );
}

const RETURNED: ReadonlySet<SubProductionStatus> = new Set<SubProductionStatus>([
  "RUECKLAUF_ERHALTEN",
  "ABGESCHLOSSEN",
]);

/** Prüft die Rücklaufmenge gegen die Beistellmenge (kein Mehr-Rücklauf, kein Negativ). */
export function validateReturnQty(beistellMenge: number | null | undefined, ruecklaufMenge: number): void {
  if (ruecklaufMenge < 0) {
    throw new SubProductionTransitionError("Rücklaufmenge darf nicht negativ sein.");
  }
  if (beistellMenge != null && ruecklaufMenge > beistellMenge) {
    throw new SubProductionTransitionError(
      `Rücklaufmenge ${ruecklaufMenge} > Beistellmenge ${beistellMenge} (T-04).`
    );
  }
}

/** Schwund/Ausschuss einer Stufe (Beistell − Rücklauf); null, wenn Mengen fehlen. */
export function stageScrap(stage: SubProductionStage): number | null {
  if (stage.beistellMenge == null || stage.ruecklaufMenge == null) return null;
  return stage.beistellMenge - stage.ruecklaufMenge;
}

/**
 * Kettenausbeute (Yield) der Fremdvergabe in Prozent: Rücklauf der letzten zurück­
 * gemeldeten Stufe geteilt durch die Beistellmenge der ersten Stufe. null, wenn nicht
 * bestimmbar (kaufmännisch gerundet, 0..100).
 */
export function chainYieldPercent(stages: ReadonlyArray<SubProductionStage>): number | null {
  const ordered = [...stages].sort((a, b) => a.sequence - b.sequence);
  const first = ordered[0];
  const lastReturned = [...ordered].reverse().find((s) => RETURNED.has(s.status) && s.ruecklaufMenge != null);
  if (!first || first.beistellMenge == null || first.beistellMenge === 0 || !lastReturned || lastReturned.ruecklaufMenge == null) {
    return null;
  }
  return Math.round((lastReturned.ruecklaufMenge / first.beistellMenge) * 100);
}

/** Ist eine Stufe überfällig? (Termin gesetzt, noch nicht zurück, Termin überschritten.) */
export function isStageOverdue(stage: SubProductionStage, now: Date): boolean {
  return stage.dueDate != null && !RETURNED.has(stage.status) && stage.dueDate.getTime() < now.getTime();
}

export interface SubProductionPlan {
  /** Nächste handlungsfähige Stufe (niedrigste offene Sequenz, deren Vorstufen zurück sind). */
  nextActionable: SubProductionStage | null;
  /** Offene Stufen, die noch auf frühere Stufen warten. */
  blocked: SubProductionStage[];
  /** Überfällige, noch nicht zurückgemeldete Stufen (Termin überschritten). */
  overdue: SubProductionStage[];
  /** Summe des Schwunds über alle Stufen mit Mengen. */
  totalScrap: number;
  /** Summe der Lohnkosten über alle Stufen (Cent). */
  totalLohnCents: number;
  /** Fortschritt: Anteil zurückgemeldeter Stufen in Prozent (0..100). */
  progressPercent: number;
  /** Kettenausbeute in Prozent (s. chainYieldPercent) oder null. */
  yieldPercent: number | null;
  allReturned: boolean;
}

/**
 * Verdichtet die Stufen einer PA zu einem Fremdvergabe-Plan: nächste/blockierte/
 * überfällige Stufe, Gesamt-Schwund, Lohnkosten, Fortschritt und Ausbeute (T-04, Kap. 5.3).
 */
export function planSubProduction(
  stages: ReadonlyArray<SubProductionStage>,
  now: Date
): SubProductionPlan {
  const ordered = [...stages].sort((a, b) => a.sequence - b.sequence);
  const open = ordered.filter((s) => !RETURNED.has(s.status));

  let nextActionable: SubProductionStage | null = null;
  const blocked: SubProductionStage[] = [];
  for (const s of open) {
    if (s.status === "OFFEN" && !canStartStage(ordered, s.sequence)) {
      blocked.push(s);
    } else if (nextActionable === null) {
      nextActionable = s;
    }
  }

  const totalScrap = ordered.reduce((sum, s) => sum + (stageScrap(s) ?? 0), 0);
  const totalLohnCents = ordered.reduce((sum, s) => sum + (s.lohnCents ?? 0), 0);
  const returnedCount = ordered.filter((s) => RETURNED.has(s.status)).length;
  const progressPercent = ordered.length === 0 ? 100 : Math.round((returnedCount / ordered.length) * 100);

  return {
    nextActionable,
    blocked,
    overdue: ordered.filter((s) => isStageOverdue(s, now)),
    totalScrap,
    totalLohnCents,
    progressPercent,
    yieldPercent: chainYieldPercent(ordered),
    allReturned: allStagesReturned(ordered),
  };
}
