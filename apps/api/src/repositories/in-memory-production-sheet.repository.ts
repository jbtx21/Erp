// In-Memory-Implementierung des Produktionszettel-Repositories — für Tests/Durchstiche.

import type { ProductionSheetInput } from "@texma/shared";
import type { ProductionSheetRepository } from "../modules/production-sheet/production-sheet.service.js";

export class InMemoryProductionSheetRepository implements ProductionSheetRepository {
  constructor(private readonly byProduction: Record<string, Partial<ProductionSheetInput>>) {}

  async gatherBase(productionId: string): Promise<Partial<ProductionSheetInput> | null> {
    return this.byProduction[productionId] ?? null;
  }
}
