// In-Memory-Implementierung des Beschaffungs-Repositories — für Tests/lokale Durchstiche.

import type { GoodsReceiptLine, RequiredComponent } from "@texma/shared";
import type { ProcurementRepository } from "../modules/procurement/procurement.service.js";

export class InMemoryProcurementRepository implements ProcurementRepository {
  constructor(
    private readonly required: Record<string, RequiredComponent[]>,
    private readonly received: Record<string, GoodsReceiptLine[]>
  ) {}

  async requiredComponents(productionId: string): Promise<RequiredComponent[]> {
    return this.required[productionId] ?? [];
  }

  async receivedComponents(productionId: string): Promise<GoodsReceiptLine[]> {
    return this.received[productionId] ?? [];
  }
}
