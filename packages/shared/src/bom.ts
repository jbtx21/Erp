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

// ─────────────────────────────────────────────────────────────────────────────
// Set/Bundle-Stückliste (Kap. 5.1). Eine Set-Variante löst sich in Komponenten auf;
// jede Komponente hat eine Menge je Set-Stück. Auf Beleg-Ebene (Angebot/Auftrag)
// wird mit der Positionsmenge multipliziert.
// ─────────────────────────────────────────────────────────────────────────────

export interface VariantComponentDef {
  description: string;
  /** Menge je Set-Stück. */
  qty: number;
  /** optionale Verknüpfung auf eine reale Lagervariante (Bedarf/EK). */
  componentVariantId?: string | null;
}

export interface ExplodedComponent {
  description: string;
  /** Gesamtmenge = qty je Set × Positionsmenge. */
  qty: number;
  componentVariantId: string | null;
}

/**
 * Multipliziert die Komponenten-Stückliste einer Set-Variante mit der Positionsmenge
 * (Angebot/Auftrag). Leere Beschreibung oder Menge ≤ 0 wird übersprungen.
 */
export function explodeComponents(
  components: ReadonlyArray<VariantComponentDef>,
  positionQty: number
): ExplodedComponent[] {
  if (positionQty <= 0) throw new Error("positionQty must be > 0");
  return components
    .filter((c) => c.description.trim() && c.qty > 0)
    .map((c) => ({
      description: c.description.trim(),
      qty: c.qty * positionQty,
      componentVariantId: c.componentVariantId ?? null,
    }));
}
