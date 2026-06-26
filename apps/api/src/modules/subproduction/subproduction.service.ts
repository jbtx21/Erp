// Anwendungsfall: mehrstufige Fremdvergabe (Lohnveredelung, Kap. 5.3 / T-04). Bindet
// die reine Zustandsmaschine (@texma/shared: transitionStage/canStartStage) an die
// Unterproduktionsaufträge einer PA. Stufen laufen sequenziell: eine Stufe darf erst
// beigestellt werden, wenn alle vorherigen Stufen ihren Rücklauf erhalten haben.
// Repository als Interface → testbar ohne DB.

import {
  allStagesReturned,
  canStartStage,
  planSubProduction,
  SubProductionTransitionError,
  transitionStage,
  validateReturnQty,
  type SubProductionPlan,
  type SubProductionStage,
  type SubProductionStatus,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface StoredStage extends SubProductionStage {
  id: string;
  productionId: string;
}

/** Felder, die der Statuswechsel persistiert (inkl. Mengenfluss). */
export type StageUpdate = Pick<
  SubProductionStage,
  "status" | "beistellungVersandtAm" | "ruecklaufErhaltenAm" | "beistellMenge" | "ruecklaufMenge"
>;

export interface SubProductionRepository {
  getStage(subProductionId: string): Promise<StoredStage | null>;
  /** Alle Stufen einer PA (mit id, für Aktionen + sequenzielle Gate-Prüfung + Übersicht). */
  listStages(productionId: string): Promise<StoredStage[]>;
  updateStage(subProductionId: string, data: StageUpdate): Promise<void>;
}

/** Optionale Angaben beim Statuswechsel: Mengenfluss (Beistellung/Rücklauf). */
export interface AdvanceOptions {
  /** Beistellmenge (bei BEISTELLUNG_VERSANDT) bzw. Rücklaufmenge (bei RUECKLAUF_ERHALTEN). */
  menge?: number;
}

export interface ProductionSubStatus {
  productionId: string;
  stages: StoredStage[];
  /** Fremdvergabe komplett (jede Stufe zurück) → interne Weiterverarbeitung frei. */
  allReturned: boolean;
}

export class SubProductionService {
  constructor(
    private readonly repo: SubProductionRepository,
    private readonly audit: AuditSink
  ) {}

  /** Schaltet eine Stufe weiter (Beistellung/Rücklauf/Abschluss) mit Reihenfolge-Gate. */
  async advanceStage(
    subProductionId: string,
    to: SubProductionStatus,
    at: Date = new Date(),
    opts: AdvanceOptions = {}
  ): Promise<SubProductionStage> {
    const stage = await this.repo.getStage(subProductionId);
    if (!stage) {
      throw new SubProductionTransitionError(`Unterauftrag ${subProductionId} nicht gefunden.`);
    }

    // Sequenzielles Gate: eine Stufe darf erst starten, wenn alle früheren zurück sind.
    if (to === "BEISTELLUNG_VERSANDT") {
      const stages = await this.repo.listStages(stage.productionId);
      if (!canStartStage(stages, stage.sequence)) {
        throw new SubProductionTransitionError(
          `Stufe ${stage.sequence} darf erst starten, wenn alle vorherigen Stufen zurück sind (T-04).`
        );
      }
    }

    // Übergangslegalität zuerst (wirft mit klarer Meldung bei unerlaubtem Wechsel),
    // bevor wir die Mengen-Pflichtregeln prüfen — so meldet ein illegaler Sprung den
    // Übergangsfehler, nicht „Menge fehlt".
    const next = transitionStage(stage, to, at);

    // Mengenfluss: Beistellmenge beim Versand, Rücklaufmenge (gegen Beistellung geprüft) beim Rücklauf.
    let beistellMenge = stage.beistellMenge ?? null;
    let ruecklaufMenge = stage.ruecklaufMenge ?? null;
    if (to === "BEISTELLUNG_VERSANDT" && opts.menge != null) {
      beistellMenge = opts.menge;
    }
    // Rücklauf ohne Menge wäre ein stiller Mengenbruch (Schwund/Ausbeute nicht bestimmbar,
    // T-04). Die zurückerhaltene Menge ist daher Pflicht beim Rücklauf.
    if (to === "RUECKLAUF_ERHALTEN") {
      if (opts.menge == null) {
        throw new SubProductionTransitionError("Rücklaufmenge ist beim Rücklauf Pflicht (Schwund/Ausbeute, T-04).");
      }
      validateReturnQty(beistellMenge, opts.menge);
      ruecklaufMenge = opts.menge;
    }
    // Abschluss setzt eine erfasste Rücklaufmenge voraus (Mengenkette lückenlos).
    if (to === "ABGESCHLOSSEN" && ruecklaufMenge == null) {
      throw new SubProductionTransitionError("Abschluss erst möglich, wenn die Rücklaufmenge erfasst ist (T-04).");
    }

    await this.repo.updateStage(subProductionId, {
      status: next.status,
      beistellungVersandtAm: next.beistellungVersandtAm ?? null,
      ruecklaufErhaltenAm: next.ruecklaufErhaltenAm ?? null,
      beistellMenge,
      ruecklaufMenge,
    });

    await this.audit.append(
      buildEntry({
        entity: "SubProductionOrder",
        entityId: subProductionId,
        action: "UPDATE",
        after: { status: next.status, sequence: stage.sequence, beistellMenge, ruecklaufMenge },
      })
    );

    return { ...next, beistellMenge, ruecklaufMenge };
  }

  async productionSubStatus(productionId: string): Promise<ProductionSubStatus> {
    const stages = await this.repo.listStages(productionId);
    return { productionId, stages, allReturned: allStagesReturned(stages) };
  }

  /** Verdichteter Fremdvergabe-Plan (nächste/blockierte/überfällige Stufe, Schwund, Yield). */
  async productionSubPlan(productionId: string, now: Date = new Date()): Promise<SubProductionPlan> {
    return planSubProduction(await this.repo.listStages(productionId), now);
  }
}
