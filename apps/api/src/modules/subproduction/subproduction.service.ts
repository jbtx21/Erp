// Anwendungsfall: mehrstufige Fremdvergabe (Lohnveredelung, Kap. 5.3 / T-04). Bindet
// die reine Zustandsmaschine (@texma/shared: transitionStage/canStartStage) an die
// Unterproduktionsaufträge einer PA. Stufen laufen sequenziell: eine Stufe darf erst
// beigestellt werden, wenn alle vorherigen Stufen ihren Rücklauf erhalten haben.
// Repository als Interface → testbar ohne DB.

import {
  allStagesReturned,
  canStartStage,
  SubProductionTransitionError,
  transitionStage,
  type SubProductionStage,
  type SubProductionStatus,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface StoredStage extends SubProductionStage {
  id: string;
  productionId: string;
}

export interface SubProductionRepository {
  getStage(subProductionId: string): Promise<StoredStage | null>;
  /** Alle Stufen einer PA (für die sequenzielle Gate-Prüfung + Übersicht). */
  listStages(productionId: string): Promise<SubProductionStage[]>;
  updateStage(
    subProductionId: string,
    data: Pick<SubProductionStage, "status" | "beistellungVersandtAm" | "ruecklaufErhaltenAm">
  ): Promise<void>;
}

export interface ProductionSubStatus {
  productionId: string;
  stages: SubProductionStage[];
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
    at: Date = new Date()
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

    const next = transitionStage(stage, to, at);
    await this.repo.updateStage(subProductionId, {
      status: next.status,
      beistellungVersandtAm: next.beistellungVersandtAm ?? null,
      ruecklaufErhaltenAm: next.ruecklaufErhaltenAm ?? null,
    });

    await this.audit.append(
      buildEntry({
        entity: "SubProductionOrder",
        entityId: subProductionId,
        action: "UPDATE",
        after: { status: next.status, sequence: stage.sequence },
      })
    );

    return next;
  }

  async productionSubStatus(productionId: string): Promise<ProductionSubStatus> {
    const stages = await this.repo.listStages(productionId);
    return { productionId, stages, allReturned: allStagesReturned(stages) };
  }
}
