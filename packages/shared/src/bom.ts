// Stücklisten / BOM — Kap. 5.1, 5.2. Testfall T-03 (kundenspezifische Stückliste).
// Ein Shop/Kunde hat ein BOM-Template; bei Auftragsanlage wird daraus die konkrete
// Stückliste des Produktionsauftrags expandiert (variable Stücklisten, Kap. 31 Extended).

export interface BomTemplateItem {
  description: string;
  defaultQty: number;
}

export interface BomItem {
  description: string;
  qty: number;
  /** Herkunft der Position: aus Template oder aus der Bestellzeile. */
  source: "template" | "order";
}

export interface OrderLineForBom {
  description: string;
  qty: number;
}

/**
 * Expandiert ein BOM-Template zur konkreten Stückliste eines Auftrags (T-03).
 * Basistextil/Veredelung kommen aus dem Template (×Auftragsmenge), zusätzlich
 * werden die Auftragszeilen als Positionen übernommen. Kein Template → reine
 * Auftragszeilen (manuell angelegte Aufträge, Kap. 5.2).
 */
export function expandBom(
  template: ReadonlyArray<BomTemplateItem> | null,
  orderLines: ReadonlyArray<OrderLineForBom>,
  orderQty: number
): BomItem[] {
  if (orderQty <= 0) throw new Error("orderQty must be > 0");
  const items: BomItem[] = [];
  if (template) {
    for (const t of template) {
      items.push({
        description: t.description,
        qty: t.defaultQty * orderQty,
        source: "template",
      });
    }
  }
  for (const l of orderLines) {
    items.push({ description: l.description, qty: l.qty, source: "order" });
  }
  return items;
}
