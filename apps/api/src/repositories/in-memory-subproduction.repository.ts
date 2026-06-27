// In-Memory-Implementierung des Fremdvergabe-Repositories — für Tests/lokale Durchstiche.

import type {
  StageUpdate,
  StoredStage,
  SubProductionRepository,
} from "../modules/subproduction/subproduction.service.js";

export class InMemorySubProductionRepository implements SubProductionRepository {
  constructor(private readonly stages: StoredStage[]) {}

  async getStage(subProductionId: string): Promise<StoredStage | null> {
    return this.stages.find((s) => s.id === subProductionId) ?? null;
  }

  async listStages(productionId: string): Promise<StoredStage[]> {
    return this.stages
      .filter((s) => s.productionId === productionId)
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => ({
        id: s.id,
        productionId: s.productionId,
        sequence: s.sequence,
        supplierId: s.supplierId,
        inhouse: s.inhouse ?? false,
        status: s.status,
        beistellungVersandtAm: s.beistellungVersandtAm ?? null,
        ruecklaufErhaltenAm: s.ruecklaufErhaltenAm ?? null,
        beistellMenge: s.beistellMenge ?? null,
        ruecklaufMenge: s.ruecklaufMenge ?? null,
        dueDate: s.dueDate ?? null,
        lohnCents: s.lohnCents ?? null,
        beistellPositionen: s.beistellPositionen ?? [],
        beistellInfo: s.beistellInfo ?? null,
      }));
  }

  async updateStage(subProductionId: string, data: StageUpdate): Promise<void> {
    const s = this.stages.find((x) => x.id === subProductionId);
    if (s) {
      s.status = data.status;
      s.beistellungVersandtAm = data.beistellungVersandtAm ?? null;
      s.ruecklaufErhaltenAm = data.ruecklaufErhaltenAm ?? null;
      s.beistellMenge = data.beistellMenge ?? null;
      s.ruecklaufMenge = data.ruecklaufMenge ?? null;
    }
  }
}
