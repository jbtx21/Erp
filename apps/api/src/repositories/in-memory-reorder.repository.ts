// In-Memory-Implementierung des Reorder-Repositories — für Tests/Durchstiche.

import type { DemandItem, DemandStock, DemandSupplier, ReorderCandidate, SupplierReorder } from "@texma/shared";
import type {
  CreatedReorderPo,
  ReorderRepository,
  VariantMeta,
} from "../modules/reorder/reorder.service.js";

export class InMemoryReorderRepository implements ReorderRepository {
  readonly createdOrders: Array<{ supplierId: string; lines: number }> = [];
  private seq = 0;
  demand: DemandItem[] = [];
  stock: DemandStock[] = [];
  suppliers: DemandSupplier[] = [];
  meta = new Map<string, VariantMeta>();
  async variantMeta(variantIds: string[]): Promise<Map<string, VariantMeta>> {
    return new Map(variantIds.filter((id) => this.meta.has(id)).map((id) => [id, this.meta.get(id)!]));
  }

  constructor(private readonly candidates: ReorderCandidate[]) {}

  async belowMinStock(): Promise<ReorderCandidate[]> {
    return this.candidates;
  }
  async openDemand(): Promise<DemandItem[]> { return this.demand; }
  async stockLevels(): Promise<DemandStock[]> { return this.stock; }
  async variantSuppliers(): Promise<DemandSupplier[]> { return this.suppliers; }

  async createPurchaseOrders(groups: SupplierReorder[]): Promise<CreatedReorderPo[]> {
    return groups.map((g) => {
      this.createdOrders.push({ supplierId: g.supplierId, lines: g.lines.length });
      const n = ++this.seq;
      return { supplierId: g.supplierId, purchaseOrderId: `po_${n}`, number: `BV-${n}`, lineCount: g.lines.length };
    });
  }
}
