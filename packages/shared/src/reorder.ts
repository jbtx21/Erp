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
  /** Bedarfsquellen (Auftrag/Leihe) — nur beim MTO-Pfad aus Auftragsbedarf gefüllt. */
  sources?: Array<{ source: "ORDER" | "LOAN"; ref: string; qty: number }>;
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

// ── Auftragsübergreifender Bedarf (Sammeln aus mehreren Aufträgen + Leihgut) ──────

export interface DemandItem {
  variantId: string;
  qty: number;
  source: "ORDER" | "LOAN";
  ref: string;
}
export interface DemandStock { variantId: string; qty: number }
export interface DemandSupplier { variantId: string; supplierId: string; ekCents: Cents }
/** Bereits bestellte, noch nicht (voll) eingegangene Menge je Variante (offene POs). */
export interface DemandOpenOrder { variantId: string; qty: number }

export interface DemandProposal {
  variantId: string;
  supplierId: string | null;
  requiredQty: number;
  stockQty: number;
  /** Bereits bestellte, noch offene Menge (offene POs) — reduziert den Netto-Bedarf. */
  orderedQty: number;
  /** Zu bestellende Menge = max(0, Bedarf − Bestand − offene Bestellungen). */
  orderQty: number;
  ekCents: Cents;
  sources: Array<{ source: "ORDER" | "LOAN"; ref: string; qty: number }>;
}

/**
 * Aggregiert den Bedarf je Variante auftragsübergreifend (mehrere Aufträge + Leihgut),
 * verrechnet den Bestand und ordnet den Hauptlieferanten zu. Nur Varianten mit
 * Netto-Bedarf (> 0); Quellen je Variante werden mitgeführt (Nachvollziehbarkeit).
 *
 * Muster-Leihen (`LOAN`) REDUZIEREN den Auftragsbedarf: die Muster wurden vorab zur
 * Anprobe beschafft, kommen vom Kunden zurück und gehen in die Gesamtbestellung ein —
 * es müssen also nur die fehlenden Stück nachbeschafft werden (200 Auftrag − 5 Muster
 * → 195). `requiredQty` ist daher der Netto-Auftragsbedarf nach Abzug der Muster.
 *
 * Bereits bestellte, noch offene Mengen (`openOrders`, offene POs) senken den zu
 * bestellenden Rest — sonst würde erneutes Erzeugen doppelt bestellen (MTO-Loch,
 * Kap. 6.1): orderQty = max(0, Bedarf − Bestand − offene Bestellungen). Additiver
 * Parameter mit Default `[]` (bestehende Aufrufer/Tests bleiben grün).
 */
export function aggregateDemand(
  demand: ReadonlyArray<DemandItem>,
  stock: ReadonlyArray<DemandStock>,
  suppliers: ReadonlyArray<DemandSupplier>,
  openOrders: ReadonlyArray<DemandOpenOrder> = []
): DemandProposal[] {
  const stockBy = new Map(stock.map((s) => [s.variantId, s.qty]));
  const supBy = new Map(suppliers.map((s) => [s.variantId, s]));
  const openBy = new Map(openOrders.map((o) => [o.variantId, o.qty]));
  const byVariant = new Map<string, { required: number; sources: DemandProposal["sources"] }>();
  for (const d of demand) {
    if (d.qty <= 0) continue;
    const cur = byVariant.get(d.variantId) ?? { required: 0, sources: [] };
    // Auftrag erhöht den Bedarf; zurückkommende Muster senken ihn (sie gehen in die Bestellung ein).
    cur.required += d.source === "LOAN" ? -d.qty : d.qty;
    cur.sources.push({ source: d.source, ref: d.ref, qty: d.qty });
    byVariant.set(d.variantId, cur);
  }
  const out: DemandProposal[] = [];
  for (const [variantId, agg] of byVariant) {
    const stockQty = stockBy.get(variantId) ?? 0;
    const orderedQty = Math.max(0, openBy.get(variantId) ?? 0);
    const orderQty = Math.max(0, agg.required - stockQty - orderedQty);
    if (orderQty <= 0) continue;
    const sup = supBy.get(variantId);
    out.push({ variantId, supplierId: sup?.supplierId ?? null, requiredQty: Math.max(0, agg.required), stockQty, orderedQty, orderQty, ekCents: sup?.ekCents ?? 0, sources: agg.sources });
  }
  return out.sort((a, b) => b.orderQty - a.orderQty);
}

export interface GroupedDemand {
  /** Je Hauptlieferant gebündelter Bedarf — 1 Klick = 1 Bestellung je Lieferant. */
  bestellbar: SupplierReorder[];
  /** Bedarf ohne Hauptlieferant: nicht automatisch bestellbar, braucht Klärung. */
  ohneLieferant: DemandProposal[];
}

/**
 * Partitioniert den Auftragsbedarf (MTO, Kap. 6.1) in bestellbare Vorschläge je
 * Hauptlieferant und in Positionen ohne Lieferant. Nur Zeilen mit orderQty > 0;
 * die Bedarfsquellen (Auftrag/Leihe) werden je Position mitgeführt, damit die
 * Bestellposition auf ihre Aufträge rückverweisbar bleibt.
 */
export function groupDemandBySupplier(proposals: ReadonlyArray<DemandProposal>): GroupedDemand {
  const bestellbar: ReorderProposal[] = [];
  const ohneLieferant: DemandProposal[] = [];
  for (const p of proposals) {
    if (p.orderQty <= 0) continue;
    if (p.supplierId === null) {
      ohneLieferant.push(p);
      continue;
    }
    bestellbar.push({ variantId: p.variantId, supplierId: p.supplierId, orderQty: p.orderQty, ekCents: p.ekCents, sources: p.sources });
  }
  return { bestellbar: groupReorderBySupplier(bestellbar), ohneLieferant };
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
