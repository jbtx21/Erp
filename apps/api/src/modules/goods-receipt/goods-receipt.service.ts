// Anwendungsfall: Wareneingang gegen Bestellung (Kap. 6.3 / T-05). Erfasst eingegangene
// Mengen je Bestellposition als Wareneingangsbeleg (GoodsReceipt) und schreibt den
// Bestellstatus fort (BESTELLT → TEILWEISE_ERHALTEN → ERHALTEN). Überlieferung wird
// gebucht (Bestand stimmt physisch) und je Position gemeldet; Unterlieferungen können
// per closeShort abgeschlossen werden (Position zählt nicht mehr als offen).
// Voraussetzung für das Multi-Lieferant-Produktionsstart-Gate
// (procurement.productionStartStatus). GoBD-Audit. Repository als Interface → testbar ohne DB.

import { reconcileEk, type EkInvoiceLine, type EkLineResult, type EkOverall } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export type PurchaseOrderStatus = "ENTWURF" | "BESTELLT" | "TEILWEISE_ERHALTEN" | "ERHALTEN";

/** Bedarfsquelle einer Bestellposition (MTO, Kap. 6.1): Auftrag/Leihe hinter der Menge. */
export interface PurchaseOrderLineSourceView {
  orderId: string | null;
  ref: string;
  qty: number;
}

export interface PurchaseOrderLineView {
  /** Positions-Id (PurchaseOrderLine) — Ziel für closeShort. */
  id: string;
  variantId: string;
  /** Anzeige: Artikelname + Varianten-SKU. */
  label: string;
  /** Artikelname separat (Größenlauf-Gruppierung im UI). */
  articleName: string;
  /** Varianten-Attribute (Farbe/Größe …) für die Größenlauf-Gruppierung. */
  attributes: Array<{ name: string; value: string }>;
  orderedQty: number;
  receivedQty: number;
  /** Bestell-EK je Stück (für den EK-Abgleich beim Wareneingang). */
  ekCents: number;
  /** Trotz Fehlmenge geschlossen (Unterlieferung) — zählt nicht mehr als offen. */
  closedShort: boolean;
  /** Quell-Aufträge/Leihen der Position (PO ↔ Auftrag-Verdrahtung). */
  sources: PurchaseOrderLineSourceView[];
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

export interface CloseShortInput {
  purchaseOrderId: string;
  /** Ohne lineIds: alle noch offenen Positionen werden geschlossen. */
  lineIds?: string[];
}

export interface GoodsReceiptRepository {
  /** Offene Bestellungen (Status ≠ ERHALTEN) mit Positionen + bisher gebuchter Menge. */
  listOpenPurchaseOrders(): Promise<OpenPurchaseOrder[]>;
  /** Bestellpositionen mit Bestell-EK, Bestell- und bisheriger Eingangsmenge. */
  purchaseOrderLines(purchaseOrderId: string): Promise<Array<{ id: string; variantId: string; orderedQty: number; receivedQty: number; ekCents: number; closedShort: boolean }>>;
  /** Legt den Wareneingangsbeleg + Positionen (inkl. EK) an und setzt den Bestellstatus. */
  recordReceipt(purchaseOrderId: string, lines: Array<{ variantId: string; receivedQty: number; ekCents?: number | null }>, newStatus: PurchaseOrderStatus): Promise<{ goodsReceiptId: string }>;
  /** Markiert Positionen als closedShort; bei allClosed zusätzlich Status ERHALTEN + closedShortAt. */
  closeLinesShort(purchaseOrderId: string, lineIds: string[], allClosed: boolean): Promise<void>;
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
  /** Je erfasster Position: kumulierte Menge ÜBER der Bestellmenge (0 = keine Überlieferung). */
  lines: Array<{ variantId: string; ueberliefert: number }>;
  /** null = kein Eingangs-EK erfasst (kein Abgleich). */
  ekCheck: ReceiptEkCheck | null;
}

export interface CloseShortResult {
  status: PurchaseOrderStatus;
  /** Geschlossene Positionen mit Fehlmenge (bestellt − erhalten). */
  closedLines: Array<{ lineId: string; variantId: string; orderedQty: number; receivedQty: number; fehlmenge: number }>;
}

export class GoodsReceiptService {
  constructor(private readonly repo: GoodsReceiptRepository, private readonly audit: AuditSink) {}

  listOpen(): Promise<OpenPurchaseOrder[]> {
    return this.repo.listOpenPurchaseOrders();
  }

  /**
   * Bucht einen Wareneingang gegen eine Bestellung und schreibt den Status fort.
   * Überlieferung ist erlaubt (Kap. 6.3): die echte Empfangsmenge wird gebucht — der
   * Bestand stimmt physisch —, der Überschuss wird je Position gemeldet (ueberliefert).
   */
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

    // Offen = weder voll erhalten noch closedShort (Unterlieferung bereits abgeschlossen).
    const fully = poLines.every((l) => l.closedShort || (received.get(l.variantId) ?? 0) >= l.orderedQty);
    const any = poLines.some((l) => (received.get(l.variantId) ?? 0) > 0);
    const newStatus: PurchaseOrderStatus = fully ? "ERHALTEN" : any ? "TEILWEISE_ERHALTEN" : "BESTELLT";

    // Überlieferung je erfasster Position: kumulierte Menge über der Bestellmenge.
    const orderedByVariant = new Map<string, number>();
    for (const l of poLines) orderedByVariant.set(l.variantId, (orderedByVariant.get(l.variantId) ?? 0) + l.orderedQty);
    const resultLines = lines.map((l) => ({
      variantId: l.variantId,
      ueberliefert: Math.max(0, (received.get(l.variantId) ?? 0) - (orderedByVariant.get(l.variantId) ?? 0)),
    }));

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
      after: {
        purchaseOrderId: input.purchaseOrderId, lines, status: newStatus,
        ueberlieferungen: resultLines.filter((l) => l.ueberliefert > 0),
        ekCheck: ekCheck ? { overall: ekCheck.overall, maxAbsDiffPercent: ekCheck.maxAbsDiffPercent } : null,
      },
    }));
    return { goodsReceiptId: res.goodsReceiptId, status: newStatus, lines: resultLines, ekCheck };
  }

  /**
   * Unterlieferung abschließen (Kap. 6.3): markiert offene Positionen als closedShort —
   * sie zählen nicht mehr als offen (Status + Bedarfsrechnung). Ohne lineIds werden alle
   * offenen Positionen geschlossen. Ist danach keine Position mehr offen (voll ODER
   * closedShort), wird die Bestellung ERHALTEN + closedShortAt gesetzt.
   */
  async closeShort(input: CloseShortInput): Promise<CloseShortResult> {
    const poLines = await this.repo.purchaseOrderLines(input.purchaseOrderId);
    if (poLines.length === 0) throw new GoodsReceiptError(`Bestellung ${input.purchaseOrderId} nicht gefunden.`);

    const isOpen = (l: (typeof poLines)[number]): boolean => !l.closedShort && l.receivedQty < l.orderedQty;
    const openLines = poLines.filter(isOpen);
    if (openLines.length === 0) throw new GoodsReceiptError("Keine offene Position — die Bestellung ist bereits vollständig oder abgeschlossen.");

    let targets: typeof openLines;
    if (input.lineIds && input.lineIds.length > 0) {
      const openById = new Map(openLines.map((l) => [l.id, l]));
      targets = input.lineIds.map((id) => {
        const line = openById.get(id);
        if (!line) throw new GoodsReceiptError(`Position ${id} ist nicht offen oder nicht Teil der Bestellung.`);
        return line;
      });
    } else {
      targets = openLines;
    }

    // Ist nach dem Schließen noch etwas offen? Wenn nein → ERHALTEN + closedShortAt.
    // Bleibt etwas offen, ändert sich der DB-Status nicht (record pflegt ihn bereits);
    // gemeldet wird der konsistente Ist-Stand (teilweise erhalten bzw. noch bestellt).
    const targetIds = new Set(targets.map((l) => l.id));
    const stillOpen = poLines.some((l) => isOpen(l) && !targetIds.has(l.id));
    const anyReceived = poLines.some((l) => l.receivedQty > 0);
    const newStatus: PurchaseOrderStatus = !stillOpen ? "ERHALTEN" : anyReceived ? "TEILWEISE_ERHALTEN" : "BESTELLT";

    await this.repo.closeLinesShort(input.purchaseOrderId, [...targetIds], !stillOpen);

    const closedLines = targets.map((l) => ({
      lineId: l.id, variantId: l.variantId, orderedQty: l.orderedQty, receivedQty: l.receivedQty,
      fehlmenge: l.orderedQty - l.receivedQty,
    }));
    await this.audit.append(buildEntry({
      entity: "PurchaseOrder", entityId: input.purchaseOrderId, action: "UPDATE",
      after: { closedShort: closedLines, status: newStatus },
    }));
    return { status: newStatus, closedLines };
  }
}
