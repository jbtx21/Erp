// In-Memory-Implementierung des Fremdvergabe-Repositories — für Tests/lokale Durchstiche.

import type { SubProductionStage } from "@texma/shared";
import type {
  StoredStage,
  SubProductionRepository,
} from "../modules/subproduction/subproduction.service.js";

export class InMemorySubProductionRepository implements SubProductionRepository {
  constructor(private readonly stages: StoredStage[]) {}

  async getStage(subProductionId: string): Promise<StoredStage | null> {
    return this.stages.find((s) => s.id === subProductionId) ?? null;
  }

  async listStages(productionId: string): Promise<SubProductionStage[]> {
    return this.stages
      .filter((s) => s.productionId === productionId)
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => ({
        sequence: s.sequence,
        supplierId: s.supplierId,
        status: s.status,
        beistellungVersandtAm: s.beistellungVersandtAm ?? null,
        ruecklaufErhaltenAm: s.ruecklaufErhaltenAm ?? null,
      }));
  }

  async updateStage(
    subProductionId: string,
    data: Pick<SubProductionStage, "status" | "beistellungVersandtAm" | "ruecklaufErhaltenAm">
  ): Promise<void> {
    const s = this.stages.find((x) => x.id === subProductionId);
    if (s) {
      s.status = data.status;
      s.beistellungVersandtAm = data.beistellungVersandtAm ?? null;
      s.ruecklaufErhaltenAm = data.ruecklaufErhaltenAm ?? null;
    }
  }
}
