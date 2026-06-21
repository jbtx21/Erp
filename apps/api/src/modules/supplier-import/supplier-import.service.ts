// Anwendungsfall: Lieferanten-Katalog (Kap. 6, 5.6 / C3) in SupplierItem importieren.
// Bindet die kanonischen Katalog-Items (Mapping in @texma/shared) an die Varianten
// und schreibt EK-Preis, Lieferanten-SKU und Verfügbarkeit fort. Idempotent über
// (supplierId, variantId); unbekannte SKUs werden übersprungen und gezählt.
// Repository als Interface → testbar ohne DB.

import type { SupplierCatalogItem } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface UpsertSupplierItemInput {
  supplierId: string;
  variantId: string;
  supplierSku: string;
  ekCents: number;
  availableQty: number | null;
}

export interface SupplierRepository {
  /** Löst die interne Variante über ihre sku auf (null = unbekannt). */
  findVariantIdBySku(sku: string): Promise<string | null>;
  /** Legt das SupplierItem an oder aktualisiert es (idempotent). */
  upsertSupplierItem(input: UpsertSupplierItemInput): Promise<"created" | "updated">;
}

export interface SupplierIngestResult {
  upserted: number;
  skipped: number;
  /** SKUs ohne passende Variante (zur Klärung). */
  skippedSkus: string[];
}

export class SupplierImportService {
  constructor(
    private readonly repo: SupplierRepository,
    private readonly audit: AuditSink
  ) {}

  /**
   * Importiert kanonische Katalog-Items für einen Lieferanten. Jede Variante wird
   * über ihre sku aufgelöst; ohne Treffer wird das Item übersprungen (kein Anlegen
   * von Phantom-Varianten). EK-Preise sind sensibel → Aufrufer muss berechtigt sein.
   */
  async ingestCatalog(
    supplierId: string,
    items: SupplierCatalogItem[]
  ): Promise<SupplierIngestResult> {
    let upserted = 0;
    const skippedSkus: string[] = [];

    for (const item of items) {
      const variantId = await this.repo.findVariantIdBySku(item.sku);
      if (!variantId) {
        skippedSkus.push(item.sku);
        continue;
      }
      await this.repo.upsertSupplierItem({
        supplierId,
        variantId,
        supplierSku: item.supplierSku,
        ekCents: item.ekCents,
        availableQty: item.availableQty,
      });
      upserted++;
    }

    await this.audit.append(
      buildEntry({
        entity: "Supplier",
        entityId: supplierId,
        action: "UPDATE",
        after: { source: "catalog.sync", upserted, skipped: skippedSkus.length },
      })
    );

    return { upserted, skipped: skippedSkus.length, skippedSkus };
  }
}
