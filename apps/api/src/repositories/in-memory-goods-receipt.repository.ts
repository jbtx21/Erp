// In-Memory-Wareneingang-Repository für Unit-Tests/Dev.

import type {
  GoodsReceiptRepository,
  OpenPurchaseOrder,
  PurchaseOrderStatus,
} from "../modules/goods-receipt/goods-receipt.service.js";

interface MemPo {
  id: string;
  number: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  productionId: string | null;
  lines: Array<{ variantId: string; label: string; orderedQty: number; ekCents: number }>;
}

export class InMemoryGoodsReceiptRepository implements GoodsReceiptRepository {
  /** receivedQty je (poId, variantId). */
  private readonly received = new Map<string, number>();
  private seq = 0;

  constructor(private readonly pos: MemPo[] = []) {}

  private key(poId: string, variantId: string): string { return `${poId}|${variantId}`; }
  private receivedFor(poId: string, variantId: string): number { return this.received.get(this.key(poId, variantId)) ?? 0; }

  async listOpenPurchaseOrders(): Promise<OpenPurchaseOrder[]> {
    return this.pos
      .filter((p) => p.status !== "ERHALTEN")
      .map((p) => ({
        id: p.id, number: p.number, supplierName: p.supplierName, status: p.status, productionId: p.productionId,
        lines: p.lines.map((l) => ({ variantId: l.variantId, label: l.label, orderedQty: l.orderedQty, receivedQty: this.receivedFor(p.id, l.variantId), ekCents: l.ekCents })),
      }));
  }

  async purchaseOrderLines(purchaseOrderId: string): Promise<Array<{ variantId: string; orderedQty: number; receivedQty: number; ekCents: number }>> {
    const po = this.pos.find((p) => p.id === purchaseOrderId);
    if (!po) return [];
    return po.lines.map((l) => ({ variantId: l.variantId, orderedQty: l.orderedQty, receivedQty: this.receivedFor(purchaseOrderId, l.variantId), ekCents: l.ekCents }));
  }

  async recordReceipt(purchaseOrderId: string, lines: Array<{ variantId: string; receivedQty: number; ekCents?: number | null }>, newStatus: PurchaseOrderStatus): Promise<{ goodsReceiptId: string }> {
    for (const l of lines) {
      this.received.set(this.key(purchaseOrderId, l.variantId), this.receivedFor(purchaseOrderId, l.variantId) + l.receivedQty);
    }
    const po = this.pos.find((p) => p.id === purchaseOrderId);
    if (po) po.status = newStatus;
    return { goodsReceiptId: `gr_${++this.seq}` };
  }
}
