// Anwendungsfall: Wareneingang gegen Bestellung (Kap. 6.3 / T-05). Erfasst eingegangene
// Mengen je Bestellposition als Wareneingangsbeleg (GoodsReceipt) und schreibt den
// Bestellstatus fort (BESTELLT → TEILWEISE_ERHALTEN → ERHALTEN). Voraussetzung für das
// Multi-Lieferant-Produktionsstart-Gate (procurement.productionStartStatus). GoBD-Audit.
// Repository als Interface → testbar ohne DB.

import { reconcileEk, type EkInvoiceLine, type EkLineResult, type EkOverall } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export type PurchaseOrderStatus = "ENTWURF" | "BESTELLT" | "TEILWEISE_ERHALTEN" | "ERHALTEN";

export interface PurchaseOrderLineView {
  variantId: string;
  /** Anzeige: Artikelname + Varianten-SKU. */
  label: string;
  orderedQty: number;
  receivedQty: number;
  /** Bestell-EK je Stück (für den EK-Abgleich beim Wareneingang). */
  ekCents: number;
}

export interface OpenPurchaseOrder {
  id: string;
  number: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  productionId: string | null;
  lines: PurchaseOrderLineView[];
}

export interface RecordReceiptInput {
  purchaseOrderId: string;
  /** ekCents = EK je Stück laut Lieferschein (optional → EK-Abgleich gegen den Bestell-EK). */
  lines: Array<{ variantId: string; receivedQty: number; ekCents?: number | null }>;
}

export interface GoodsReceiptRepository {
  /** Offene Bestellungen (Status ≠ ERHALTEN) mit Positionen + bisher gebuchter Menge. */
  listOpenPurchaseOrders(): Promise<OpenPurchaseOrder[]>;
  /** Bestellpositionen mit Bestell-EK, Bestell- und bisheriger Eingangsmenge. */
  purchaseOrderLines(purchaseOrderId: string): Promise<Array<{ variantId: string; orderedQty: number; receivedQty: number; ekCents: number }>>;
  /** Legt den Wareneingangsbeleg + Positionen (inkl. EK) an und setzt den Bestellstatus. */
  recordReceipt(purchaseOrderId: string, lines: Array<{ variantId: string; receivedQty: number; ekCents?: number | null }>, newStatus: PurchaseOrderStatus): Promise<{ goodsReceiptId: string }>;
}

export class GoodsReceiptError extends Error {}

/** EK-Abgleich Wareneingang ↔ Bestellung (nur Positionen mit erfasstem Eingangs-EK). */
export interface ReceiptEkCheck {
  overall: EkOverall;
  maxAbsDiffPercent: number;
  lines: EkLineResult[];
}

export interface RecordReceiptResult {
  goodsReceiptId: string;
  status: PurchaseOrderStatus;
  /** null = kein Eingangs-EK erfasst (kein Abgleich). */
  ekCheck: ReceiptEkCheck | null;
}

export class GoodsReceiptService {
  constructor(private readonly repo: GoodsReceiptRepository, private readonly audit: AuditSink) {}

  listOpen(): Promise<OpenPurchaseOrder[]> {
    return this.repo.listOpenPurchaseOrders();
  }

  /** Bucht einen Wareneingang gegen eine Bestellung und schreibt den Status fort. */
  async record(input: RecordReceiptInput): Promise<RecordReceiptResult> {
    const lines = input.lines.filter((l) => l.receivedQty > 0);
    if (lines.length === 0) throw new GoodsReceiptError("Keine Eingangsmenge erfasst.");

    const poLines = await this.repo.purchaseOrderLines(input.purchaseOrderId);
    if (poLines.length === 0) throw new GoodsReceiptError(`Bestellung ${input.purchaseOrderId} nicht gefunden.`);

    const known = new Set(poLines.map((l) => l.variantId));
    for (const l of lines) {
      if (!known.has(l.variantId)) throw new GoodsReceiptError(`Variante ${l.variantId} ist nicht Teil der Bestellung.`);
    }

    // Neue kumulierte Eingangsmenge je Variante nach diesem Wareneingang.
    const received = new Map(poLines.map((l) => [l.variantId, l.receivedQty]));
    for (const l of lines) received.set(l.variantId, (received.get(l.variantId) ?? 0) + l.receivedQty);

    const fully = poLines.every((l) => (received.get(l.variantId) ?? 0) >= l.orderedQty);
    const any = poLines.some((l) => (received.get(l.variantId) ?? 0) > 0);
    const newStatus: PurchaseOrderStatus = fully ? "ERHALTEN" : any ? "TEILWEISE_ERHALTEN" : "BESTELLT";

    // EK-Abgleich (Kap. 9.6): erfasster Eingangs-EK je Stück ↔ Bestell-EK (PurchaseOrderLine).
    // Reuse derselben Abgleich-Logik wie die Eingangsrechnung (reconcileEk, Toleranz 2 %/2 ct).
    // Der Wareneingang wird NICHT blockiert (Ware ist physisch da); Abweichungen werden geflaggt.
    const ekMaster = new Map(poLines.map((l) => [l.variantId, l.ekCents]));
    const ekLines: EkInvoiceLine[] = lines
      .filter((l) => l.ekCents != null)
      .map((l) => ({ ref: l.variantId, variantId: l.variantId, qty: l.receivedQty, invoiceUnitEkCents: l.ekCents! }));
    const ekCheck: ReceiptEkCheck | null = ekLines.length > 0
      ? (() => { const r = reconcileEk(ekLines, ekMaster); return { overall: r.overall, maxAbsDiffPercent: r.maxAbsDiffPercent, lines: r.lines }; })()
      : null;

    const res = await this.repo.recordReceipt(input.purchaseOrderId, lines, newStatus);
    await this.audit.append(buildEntry({
      entity: "GoodsReceipt", entityId: res.goodsReceiptId, action: "CREATE",
      after: { purchaseOrderId: input.purchaseOrderId, lines, status: newStatus, ekCheck: ekCheck ? { overall: ekCheck.overall, maxAbsDiffPercent: ekCheck.maxAbsDiffPercent } : null },
    }));
    return { goodsReceiptId: res.goodsReceiptId, status: newStatus, ekCheck };
  }
}
