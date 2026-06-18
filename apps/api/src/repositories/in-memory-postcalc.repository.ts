// In-Memory-Implementierung des Nachkalkulations-Repositories — für Tests/Durchstiche.

import type { CostSide } from "@texma/shared";
import type { PostCalcRepository } from "../modules/postcalc/postcalc.service.js";

export interface SeedActuals {
  revenueCents: number;
  materialCents: number;
  laborMinutes: number;
}

export class InMemoryPostCalcRepository implements PostCalcRepository {
  constructor(private readonly byProduction: Record<string, SeedActuals>) {}

  async actuals(productionId: string, laborRateCentsPerMinute: number): Promise<CostSide | null> {
    const a = this.byProduction[productionId];
    if (!a) return null;
    return {
      revenueCents: a.revenueCents,
      materialCents: a.materialCents,
      laborMinutes: a.laborMinutes,
      laborRateCentsPerMinute,
    };
  }
}
