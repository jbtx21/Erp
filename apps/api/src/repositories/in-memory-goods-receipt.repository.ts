// In-Memory-Wareneingang-Repository für Unit-Tests/Dev. Parität zur Prisma-Implementierung:
// Positions-Ids, Varianten-Attribute (Größenlauf), Quell-Aufträge (sources) und
// Unterlieferung (closedShort/closedShortAt).

import type {
  GoodsReceiptRepository,
  OpenPurchaseOrder,
  PurchaseOrderLineSourceView,
  PurchaseOrderStatus,
} from "../modules/goods-receipt/goods-receipt.service.js";

interface MemPoLine {
  /** Optional im Test-Setup; Default: `${poId}-${variantId}`. */
  id?: string;
  variantId: string;
  label: string;
  articleName?: string;
  attributes?: Array<{ name: string; value: string }>;
  orderedQty: number;
  ekCents: number;
  closedShort?: boolean;
  sources?: PurchaseOrderLineSourceView[];
}

interface MemPo {
  id: string;
  number: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  productionId: string | null;
  closedShortAt?: Date | null;
  lines: MemPoLine[];
}

export class InMemoryGoodsReceiptRepository implements GoodsReceiptRepository {
  /** receivedQty je (poId, variantId). */
  private readonly received = new Map<string, number>();
  private seq = 0;

  constructor(private readonly pos: MemPo[] = []) {}

  private key(poId: string, variantId: string): string { return `${poId}|${variantId}`; }
  private receivedFor(poId: string, variantId: string): number { return this.received.get(this.key(poId, variantId)) ?? 0; }
  private lineId(po: MemPo, l: MemPoLine): string { return l.id ?? `${po.id}-${l.variantId}`; }

  async listOpenPurchaseOrders(): Promise<OpenPurchaseOrder[]> {
    return this.pos
      .filter((p) => p.status !== "ERHALTEN")
      .map((p) => ({
        id: p.id, number: p.number, supplierName: p.supplierName, status: p.status, productionId: p.productionId,
        lines: p.lines.map((l) => ({
          id: this.lineId(p, l),
          variantId: l.variantId,
          label: l.label,
          articleName: l.articleName ?? l.label,
          attributes: l.attributes ?? [],
          orderedQty: l.orderedQty,
          receivedQty: this.receivedFor(p.id, l.variantId),
          ekCents: l.ekCents,
          closedShort: l.closedShort ?? false,
          sources: l.sources ?? [],
        })),
      }));
  }

  async purchaseOrderLines(purchaseOrderId: string): Promise<Array<{ id: string; variantId: string; orderedQty: number; receivedQty: number; ekCents: number; closedShort: boolean }>> {
    const po = this.pos.find((p) => p.id === purchaseOrderId);
    if (!po) return [];
    return po.lines.map((l) => ({
      id: this.lineId(po, l),
      variantId: l.variantId,
      orderedQty: l.orderedQty,
      receivedQty: this.receivedFor(purchaseOrderId, l.variantId),
      ekCents: l.ekCents,
      closedShort: l.closedShort ?? false,
    }));
  }

  async recordReceipt(purchaseOrderId: string, lines: Array<{ variantId: string; receivedQty: number; ekCents?: number | null }>, newStatus: PurchaseOrderStatus): Promise<{ goodsReceiptId: string }> {
    for (const l of lines) {
      this.received.set(this.key(purchaseOrderId, l.variantId), this.receivedFor(purchaseOrderId, l.variantId) + l.receivedQty);
    }
    const po = this.pos.find((p) => p.id === purchaseOrderId);
    if (po) po.status = newStatus;
    return { goodsReceiptId: `gr_${++this.seq}` };
  }

  async closeLinesShort(purchaseOrderId: string, lineIds: string[], allClosed: boolean): Promise<void> {
    const po = this.pos.find((p) => p.id === purchaseOrderId);
    if (!po) return;
    const ids = new Set(lineIds);
    for (const l of po.lines) {
      if (ids.has(this.lineId(po, l))) l.closedShort = true;
    }
    if (allClosed) {
      po.status = "ERHALTEN";
      po.closedShortAt = new Date();
    }
  }

  /** Test-Sicht auf den PO-Zustand (Status/closedShortAt/closedShort je Position). */
  poState(purchaseOrderId: string): MemPo | undefined {
    return this.pos.find((p) => p.id === purchaseOrderId);
  }
}
