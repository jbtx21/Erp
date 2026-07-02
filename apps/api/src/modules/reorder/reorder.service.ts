// Anwendungsfall: Mindestbestand-Nachbestellung (Kap. 6.3 / T-12). Bindet die reine
// `computeReorderProposals`/`groupReorderBySupplier`-Logik (@texma/shared) an die
// Lagerbestände + Hauptlieferanten. `proposals` liefert den Bestellvorschlag je
// Lieferant; `createPurchaseOrders` macht daraus mit einem Klick Bestellungen
// (Kap. 6.1). Repository als Interface → testbar ohne DB.

import {
  aggregateDemand,
  computeReorderProposals,
  groupDemandBySupplier,
  groupReorderBySupplier,
  type DemandItem,
  type DemandProposal,
  type DemandStock,
  type DemandSupplier,
  type ReorderCandidate,
  type SupplierReorder,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface CreatedReorderPo {
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string;
  number: string;
  lineCount: number;
}

/** Ergebnis der 1-Klick-Bestellung aus Auftragsbedarf (MTO, Kap. 6.1). */
export interface DemandPoResult {
  created: Array<{ poId: string; number: string; supplierId: string; supplierName: string; lines: number }>;
  /** Bedarf ohne Hauptlieferant — braucht Stammdaten-Klärung statt Bestellung. */
  uebersprungen: Array<DemandProposal & { grund: string }>;
}

export interface ReorderRepository {
  /** Varianten mit unterschrittenem Mindestbestand + Hauptlieferant (priority 1). */
  belowMinStock(): Promise<ReorderCandidate[]>;
  createPurchaseOrders(groups: SupplierReorder[]): Promise<CreatedReorderPo[]>;
  /** Offener Bedarf aus angelegten Aufträgen + aktiven Muster-Leihen (variantenbezogen). */
  openDemand(): Promise<DemandItem[]>;
  /** Aktueller Lagerbestand je Variante. */
  stockLevels(): Promise<DemandStock[]>;
  /** Hauptlieferant + EK je Variante. */
  variantSuppliers(): Promise<DemandSupplier[]>;
  /** Stammdaten je Variante (Marke/Artikel/Farbe/Größe) für die gruppierte Sortierung. */
  variantMeta(variantIds: string[]): Promise<Map<string, VariantMeta>>;
}

export interface VariantMeta {
  sku: string;
  articleName: string;
  brand: string | null;
  farbe: string | null;
  groesse: string | null;
}

export interface GroupedDemandRow extends VariantMeta {
  variantId: string;
  requiredQty: number;
  stockQty: number;
  orderQty: number;
  supplierId: string | null;
}

// Natürliche Größenordnung (Textil): XS < S < M < L < XL … ; numerische Größen numerisch.
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"];
function sizeRank(size: string | null): number {
  if (!size) return 999;
  const idx = SIZE_ORDER.indexOf(size.toUpperCase().replace(/\s/g, ""));
  if (idx >= 0) return idx;
  const num = Number(size.replace(",", "."));
  return Number.isFinite(num) ? 100 + num : 998; // numerische Größen hinter den Buchstaben, untereinander numerisch
}

export class ReorderService {
  constructor(
    private readonly repo: ReorderRepository,
    private readonly audit: AuditSink
  ) {}

  /** Bestellvorschlag je Lieferant aus allen unterschrittenen Beständen (T-12). */
  async proposals(): Promise<SupplierReorder[]> {
    const candidates = await this.repo.belowMinStock();
    return groupReorderBySupplier(computeReorderProposals(candidates));
  }

  /**
   * Auftragsübergreifender Warenbestellvorschlag: sammelt den Bedarf aus ALLEN
   * angelegten Aufträgen + aktiven Muster-Leihen, verrechnet den Bestand und schlägt
   * je Variante die Bestellmenge beim Hauptlieferanten vor (konsolidierte Sammelbestellung).
   */
  async demandProposals(): Promise<DemandProposal[]> {
    const [demand, stock, suppliers] = await Promise.all([
      this.repo.openDemand(), this.repo.stockLevels(), this.repo.variantSuppliers(),
    ]);
    return aggregateDemand(demand, stock, suppliers);
  }

  /**
   * Bestellvorschlag aller offenen Aufträge, angereichert um Stammdaten und sortiert
   * nach Marke → Artikel → Farbe → Größe (Größe in natürlicher Reihenfolge XS…XXL bzw.
   * numerisch). Grundlage für die gruppierte Beschaffungsansicht.
   */
  async demandGrouped(): Promise<GroupedDemandRow[]> {
    const props = await this.demandProposals();
    const meta = await this.repo.variantMeta(props.map((p) => p.variantId));
    const rows: GroupedDemandRow[] = props.map((p) => {
      const m = meta.get(p.variantId);
      return {
        variantId: p.variantId,
        sku: m?.sku ?? p.variantId,
        articleName: m?.articleName ?? p.variantId,
        brand: m?.brand ?? null,
        farbe: m?.farbe ?? null,
        groesse: m?.groesse ?? null,
        requiredQty: p.requiredQty,
        stockQty: p.stockQty,
        orderQty: p.orderQty,
        supplierId: p.supplierId,
      };
    });
    return rows.sort(
      (a, b) =>
        (a.brand ?? "~").localeCompare(b.brand ?? "~") ||
        a.articleName.localeCompare(b.articleName) ||
        (a.farbe ?? "").localeCompare(b.farbe ?? "") ||
        sizeRank(a.groesse) - sizeRank(b.groesse) ||
        (a.groesse ?? "").localeCompare(b.groesse ?? "")
    );
  }

  /** Erzeugt aus dem aktuellen Vorschlag je Lieferant eine Bestellung (Kap. 6.1). */
  async createPurchaseOrders(): Promise<CreatedReorderPo[]> {
    const groups = groupReorderBySupplier(computeReorderProposals(await this.repo.belowMinStock()));
    if (groups.length === 0) return [];

    const created = await this.repo.createPurchaseOrders(groups);
    await this.audit.append(
      buildEntry({
        entity: "PurchaseOrder",
        entityId: "reorder.run",
        action: "CREATE",
        after: { bestellungen: created.length, lieferanten: groups.map((g) => g.supplierId) },
      })
    );
    return created;
  }

  /**
   * 1-Klick-Bestellungen aus Auftragsbedarf (MTO, Kap. 6.1): der konsolidierte Bedarf
   * aller offenen Aufträge + Muster-Leihen wird je Hauptlieferant zu EINER Bestellung —
   * inkl. Bedarfsquellen je Position (PO ↔ Auftrag rückverfolgbar). Bedarf ohne
   * Hauptlieferant wird nicht bestellt, sondern zur Klärung zurückgemeldet.
   * Abgrenzung: `createPurchaseOrders()` bedient den Mindestbestand-Pfad (T-12).
   */
  async createDemandPurchaseOrders(): Promise<DemandPoResult> {
    const { bestellbar, ohneLieferant } = groupDemandBySupplier(await this.demandProposals());
    const uebersprungen = ohneLieferant.map((p) => ({ ...p, grund: "Kein Hauptlieferant" }));
    if (bestellbar.length === 0) return { created: [], uebersprungen };

    const created = await this.repo.createPurchaseOrders(bestellbar);
    // GoBD: je angelegter Bestellung ein Audit-Eintrag mit Positionen + Bedarfsquellen.
    for (const po of created) {
      const group = bestellbar.find((g) => g.supplierId === po.supplierId);
      await this.audit.append(
        buildEntry({
          entity: "PurchaseOrder",
          entityId: po.purchaseOrderId,
          action: "CREATE",
          after: {
            number: po.number,
            supplierId: po.supplierId,
            quelle: "auftragsbedarf",
            positionen: (group?.lines ?? []).map((l) => ({
              variantId: l.variantId,
              qty: l.orderQty,
              ekCents: l.ekCents,
              quellen: (l.sources ?? []).map((s) => `${s.source === "ORDER" ? "Auftrag" : "Leihe"} ${s.ref}: ${s.qty}`),
            })),
          },
        })
      );
    }
    return {
      created: created.map((po) => ({
        poId: po.purchaseOrderId,
        number: po.number,
        supplierId: po.supplierId,
        supplierName: po.supplierName,
        lines: po.lineCount,
      })),
      uebersprungen,
    };
  }
}
