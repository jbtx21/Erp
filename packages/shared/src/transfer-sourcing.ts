// Transferdruck-Bezug (Inhouse-Veredelung, Kap. 5.4/11): Transferdrucke werden für die
// Inhouse-Applikation entweder AUS DEM LAGER (TRANSFERDRUCK) entnommen oder — bei Fehlbestand —
// beim hinterlegten Material-Lieferanten NACHBESTELLT. Reine, IO-freie Entscheidungslogik:
//   ausLager  = min(Bedarf, verfügbar)
//   bestellen = max(0, Bedarf − verfügbar)
// Stammdaten steuern alles: bestandsgeführter Veredelungsartikel + Material-Lieferant (SupplierItem).

/** Bedarf eines bestandsgeführten Transferartikels für einen Auftrag. */
export interface TransferNeed {
  variantId: string;
  sku: string;
  bezeichnung: string;
  /** Benötigte Menge (= Menge der Inhouse-Veredelungsposition). */
  needed: number;
  /** Verfügbarer Bestand im Lager TRANSFERDRUCK (Ist − reserviert). */
  available: number;
  /** Material-Lieferant (aus den Stammdaten); null = kein Lieferant hinterlegt. */
  materialSupplierId: string | null;
  /** EK je Stück (Cent) aus den Lieferantenstammdaten; null = unbekannt. */
  ekCents: number | null;
}

/** Bezugsentscheidung je Transferartikel: aus Lager entnehmen und/oder nachbestellen. */
export interface TransferSourcingLine extends TransferNeed {
  /** Aus dem Lager TRANSFERDRUCK zu reservierende Menge. */
  fromStock: number;
  /** Beim Material-Lieferanten nachzubestellende Menge (Fehlbestand). */
  toOrder: number;
}

/** Wendet die Bezugsregel je Position an (Lager zuerst, Rest bestellen). */
export function planTransferSourcing(needs: ReadonlyArray<TransferNeed>): TransferSourcingLine[] {
  return needs.map((n) => {
    const fromStock = Math.max(0, Math.min(n.needed, n.available));
    const toOrder = Math.max(0, n.needed - n.available);
    return { ...n, fromStock, toOrder };
  });
}

/** Eine je Lieferant gebündelte Nachbestellung der Transfer-Fehlmengen. */
export interface TransferPurchaseGroup {
  supplierId: string;
  lines: Array<{ variantId: string; orderQty: number; ekCents: number | null }>;
}

/**
 * Bündelt die nachzubestellenden Fehlmengen (toOrder > 0) je Material-Lieferant zu
 * Bestell-Gruppen. Positionen ohne hinterlegten Lieferanten werden separat gemeldet.
 */
export function groupTransferPurchases(lines: ReadonlyArray<TransferSourcingLine>): {
  groups: TransferPurchaseGroup[];
  ohneLieferant: TransferSourcingLine[];
} {
  const bySupplier = new Map<string, TransferPurchaseGroup>();
  const ohneLieferant: TransferSourcingLine[] = [];
  for (const l of lines) {
    if (l.toOrder <= 0) continue;
    if (!l.materialSupplierId) { ohneLieferant.push(l); continue; }
    let g = bySupplier.get(l.materialSupplierId);
    if (!g) { g = { supplierId: l.materialSupplierId, lines: [] }; bySupplier.set(l.materialSupplierId, g); }
    g.lines.push({ variantId: l.variantId, orderQty: l.toOrder, ekCents: l.ekCents });
  }
  return { groups: [...bySupplier.values()], ohneLieferant };
}
