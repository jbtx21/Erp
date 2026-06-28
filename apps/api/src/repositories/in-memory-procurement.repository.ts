// In-Memory-Implementierung des Beschaffungs-Repositories — für Tests/lokale Durchstiche.

import type { GoodsReceiptLine, RequiredComponent } from "@texma/shared";
import type { ProcurementRepository, ProductionRef } from "../modules/procurement/procurement.service.js";

export class InMemoryProcurementRepository implements ProcurementRepository {
  constructor(
    private readonly required: Record<string, RequiredComponent[]>,
    private readonly received: Record<string, GoodsReceiptLine[]>,
    /** Optionale lesbare Bezeichnungen je Komponente (sonst Fallback auf IDs im Service). */
    private readonly refs: Record<string, Array<{ variantId: string; label: string; supplierName: string }>> = {}
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

  async componentRefs(productionId: string): Promise<Array<{ variantId: string; label: string; supplierName: string }>> {
    return this.refs[productionId] ?? [];
  }
}
