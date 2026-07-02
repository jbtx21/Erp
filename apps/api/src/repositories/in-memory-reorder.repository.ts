// In-Memory-Implementierung des Reorder-Repositories — für Tests/Durchstiche.

import type { DemandItem, DemandStock, DemandSupplier, ReorderCandidate, SupplierReorder } from "@texma/shared";
import type {
  CreatedReorderPo,
  ReorderRepository,
  VariantMeta,
} from "../modules/reorder/reorder.service.js";

export class InMemoryReorderRepository implements ReorderRepository {
  readonly createdOrders: Array<{ supplierId: string; lines: number }> = [];
  /** Persistierte Bedarfsquellen je Bestellposition (Parität zu PurchaseOrderLineSource). */
  readonly createdLineSources: Array<{ number: string; variantId: string; source: "ORDER" | "LOAN"; ref: string; qty: number }> = [];
  private seq = 0;
  demand: DemandItem[] = [];
  stock: DemandStock[] = [];
  suppliers: DemandSupplier[] = [];
  meta = new Map<string, VariantMeta>();
  /** Anzeigename je Lieferant (Fallback: supplierId). */
  supplierNames = new Map<string, string>();
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
      const number = `BV-${n}`;
      // Bedarfsquellen je Position mitschreiben (MTO-Pfad; T-12 hat keine Quellen).
      for (const l of g.lines) {
        for (const s of l.sources ?? []) {
          this.createdLineSources.push({ number, variantId: l.variantId, source: s.source, ref: s.ref, qty: s.qty });
        }
      }
      return {
        supplierId: g.supplierId,
        supplierName: this.supplierNames.get(g.supplierId) ?? g.supplierId,
        purchaseOrderId: `po_${n}`,
        number,
        lineCount: g.lines.length,
      };
    });
  }
}
