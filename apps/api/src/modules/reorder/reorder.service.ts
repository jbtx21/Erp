// Anwendungsfall: Mindestbestand-Nachbestellung (Kap. 6.3 / T-12). Bindet die reine
// `computeReorderProposals`/`groupReorderBySupplier`-Logik (@texma/shared) an die
// Lagerbestände + Hauptlieferanten. `proposals` liefert den Bestellvorschlag je
// Lieferant; `createPurchaseOrders` macht daraus mit einem Klick Bestellungen
// (Kap. 6.1). Repository als Interface → testbar ohne DB.

import {
  computeReorderProposals,
  groupReorderBySupplier,
  type ReorderCandidate,
  type SupplierReorder,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface CreatedReorderPo {
  supplierId: string;
  purchaseOrderId: string;
  number: string;
  lineCount: number;
}

export interface ReorderRepository {
  /** Varianten mit unterschrittenem Mindestbestand + Hauptlieferant (priority 1). */
  belowMinStock(): Promise<ReorderCandidate[]>;
  createPurchaseOrders(groups: SupplierReorder[]): Promise<CreatedReorderPo[]>;
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
}
