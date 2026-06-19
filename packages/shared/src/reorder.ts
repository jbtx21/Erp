// Mindestbestand / Nachbestellung — Kap. 6.3. Testfall T-12.
// Für die vorgefertigten Transferdrucke (Kleinstlager) wird bei Unterschreitung des
// Mindestbestands ein Bestellvorschlag erzeugt: Nachbestellmenge = Mindestbestand −
// Bestand, beim Hauptlieferanten der Variante. Vorschläge werden je Lieferant gebündelt
// (tägliche Sammelbestellung, Kap. 6.1). Reine, IO-freie Logik.

import type { Cents } from "./money.js";

export interface ReorderCandidate {
  variantId: string;
  qty: number;
  minStock: number;
  /** Hauptlieferant der Variante (SupplierItem priority 1). */
  supplierId: string;
  ekCents: Cents;
}

export interface ReorderProposal {
  variantId: string;
  supplierId: string;
  /** Nachzubestellende Menge, um den Mindestbestand wieder zu erreichen. */
  orderQty: number;
  ekCents: Cents;
}

export interface SupplierReorder {
  supplierId: string;
  lines: ReorderProposal[];
  /** Bestellwert (Summe orderQty × ekCents). */
  totalEkCents: Cents;
}

/**
 * Erzeugt je Variante einen Bestellvorschlag, deren Bestand den Mindestbestand
 * unterschreitet (T-12). Nachbestellmenge = Mindestbestand − Bestand (> 0).
 */
export function computeReorderProposals(
  candidates: ReadonlyArray<ReorderCandidate>
): ReorderProposal[] {
  const proposals: ReorderProposal[] = [];
  for (const c of candidates) {
    const orderQty = c.minStock - c.qty;
    if (orderQty > 0) {
      proposals.push({ variantId: c.variantId, supplierId: c.supplierId, orderQty, ekCents: c.ekCents });
    }
  }
  return proposals;
}

/** Bündelt Bestellvorschläge je Lieferant (1 Klick = 1 Bestellung, Kap. 6.1). */
export function groupReorderBySupplier(
  proposals: ReadonlyArray<ReorderProposal>
): SupplierReorder[] {
  const bySupplier = new Map<string, ReorderProposal[]>();
  for (const p of proposals) {
    const list = bySupplier.get(p.supplierId) ?? [];
    list.push(p);
    bySupplier.set(p.supplierId, list);
  }
  return [...bySupplier.entries()].map(([supplierId, lines]) => ({
    supplierId,
    lines,
    totalEkCents: lines.reduce((sum, l) => sum + l.orderQty * l.ekCents, 0),
  }));
}
