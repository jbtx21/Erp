// In-Memory-Implementierung des Beschaffungs-Repositories — für Tests/lokale Durchstiche.

import type { GoodsReceiptLine, RequiredComponent } from "@texma/shared";
import type { ProcurementRepository, ProductionRef } from "../modules/procurement/procurement.service.js";

export class InMemoryProcurementRepository implements ProcurementRepository {
  constructor(
    private readonly required: Record<string, RequiredComponent[]>,
    private readonly received: Record<string, GoodsReceiptLine[]>
  ) {}

  async listProductions(): Promise<ProductionRef[]> {
    return Object.keys(this.required).map((id) => ({ id, number: id, orderNumber: null }));
  }

  async productionForOrder(orderId: string): Promise<{ id: string } | null> {
    // In Tests entspricht die Production-ID dem Auftrags-Key, falls vorhanden.
    return this.required[orderId] ? { id: orderId } : null;
  }

  async requiredComponents(productionId: string): Promise<RequiredComponent[]> {
    return this.required[productionId] ?? [];
  }

  async receivedComponents(productionId: string): Promise<GoodsReceiptLine[]> {
    return this.received[productionId] ?? [];
  }
}
