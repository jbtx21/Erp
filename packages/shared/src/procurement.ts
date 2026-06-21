// Beschaffung / Multi-Lieferant — Kap. 5.6, 6. Testfall T-05.
// Ein Produktionsauftrag kann Komponenten von mehreren Lieferanten benötigen
// (z. B. Textil von FHB + Stanley/Stella). Der Produktionsstart ist erst frei,
// wenn ALLE benötigten Komponenten vollständig im Wareneingang gebucht sind.

export interface RequiredComponent {
  /** Variante/Artikel, der beschafft werden muss. */
  variantId: string;
  supplierId: string;
  qty: number;
}

export interface GoodsReceiptLine {
  variantId: string;
  supplierId: string;
  receivedQty: number;
}

export interface ComponentStatus {
  variantId: string;
  supplierId: string;
  requiredQty: number;
  receivedQty: number;
  complete: boolean;
}

/** Aggregiert Wareneingänge je (Variante, Lieferant) gegen den Bedarf. */
export function componentReceiptStatus(
  required: ReadonlyArray<RequiredComponent>,
  receipts: ReadonlyArray<GoodsReceiptLine>
): ComponentStatus[] {
  return required.map((r) => {
    const receivedQty = receipts
      .filter((g) => g.variantId === r.variantId && g.supplierId === r.supplierId)
      .reduce((sum, g) => sum + g.receivedQty, 0);
    return {
      variantId: r.variantId,
      supplierId: r.supplierId,
      requiredQty: r.qty,
      receivedQty,
      complete: receivedQty >= r.qty,
    };
  });
}

/**
 * Produktionsstart-Gate (T-05): true nur, wenn jede benötigte Komponente
 * vollständig eingegangen ist. Bei leerem Bedarf gibt es nichts zu beschaffen
 * → Start frei.
 */
export function canStartProduction(
  required: ReadonlyArray<RequiredComponent>,
  receipts: ReadonlyArray<GoodsReceiptLine>
): boolean {
  return componentReceiptStatus(required, receipts).every((c) => c.complete);
}

/** Offene Komponenten (für Beschaffungs-/Wareneingangs-Cockpit). */
export function openComponents(
  required: ReadonlyArray<RequiredComponent>,
  receipts: ReadonlyArray<GoodsReceiptLine>
): ComponentStatus[] {
  return componentReceiptStatus(required, receipts).filter((c) => !c.complete);
}
