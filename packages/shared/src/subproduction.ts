// Mehrstufige Fremdvergabe (Lohnveredelung) — Kap. 5.3. Testfall T-04 (Custom, Kap. 31).
// Ein Produktionsauftrag wird an externe Veredler vergeben (z. B. erst Siebdruck,
// dann Stickerei). Je Stufe wird Material beigestellt (Beistellung versandt) und
// der Rücklauf gebucht. Stufen laufen sequenziell: Stufe n+1 startet erst, wenn der
// Rücklauf von Stufe n da ist.

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
}

export class SubProductionTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubProductionTransitionError";
  }
}

const ALLOWED: Record<SubProductionStatus, SubProductionStatus[]> = {
  OFFEN: ["BEISTELLUNG_VERSANDT"],
  BEISTELLUNG_VERSANDT: ["RUECKLAUF_ERHALTEN"],
  RUECKLAUF_ERHALTEN: ["ABGESCHLOSSEN"],
  ABGESCHLOSSEN: [],
};

/** Prüft, ob ein Statuswechsel fachlich erlaubt ist. */
export function canTransition(
  from: SubProductionStatus,
  to: SubProductionStatus
): boolean {
  return ALLOWED[from].includes(to);
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
