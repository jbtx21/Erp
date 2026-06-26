// Anwendungsfall: Lieferanten-Katalog (Kap. 6, 5.6 / C3) in SupplierItem importieren.
// Bindet die kanonischen Katalog-Items (Mapping in @texma/shared) an die Varianten
// und schreibt EK-Preis, Lieferanten-SKU und Verfügbarkeit fort. Idempotent über
// (supplierId, variantId). Unbekannte SKUs werden standardmäßig übersprungen und gezählt;
// mit `createUnknown` (Säule C) als Artikel + Variante angelegt (Matrix-Parent über parentSku,
// Merkmale aus Farbe/Größe). Repository als Interface → testbar ohne DB.

import { ATTR_FARBE, ATTR_GROESSE, type SupplierCatalogItem } from "@texma/shared";
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
  /** Hauptartikel über SKU auflösen oder anlegen (Säule C, createUnknown). */
  findOrCreateArticle(sku: string, name: string): Promise<string>;
  /** Variante mit Merkmalen an einem Artikel anlegen → variantId (Säule C, createUnknown). */
  createVariantWithAttributes(articleId: string, sku: string, attributes: ReadonlyArray<{ name: string; value: string }>): Promise<string>;
}

export interface SupplierIngestOptions {
  /** Unbekannte SKUs als Artikel + Variante anlegen statt überspringen (Säule C).
   *  Parent über `parentSku` (sonst die SKU selbst); Merkmale aus Farbe/Größe. */
  createUnknown?: boolean;
}

export interface SupplierIngestResult {
  upserted: number;
  /** Neu angelegte Artikel-Varianten (createUnknown). */
  created: number;
  skipped: number;
  /** SKUs ohne passende Variante (zur Klärung) — bei createUnknown leer. */
  skippedSkus: string[];
}

export class SupplierImportService {
  constructor(
    private readonly repo: SupplierRepository,
    private readonly audit: AuditSink
  ) {}

  /**
   * Importiert kanonische Katalog-Items für einen Lieferanten. Jede Variante wird über
   * ihre sku aufgelöst. Ohne Treffer wird das Item übersprungen — oder, mit `createUnknown`,
   * als Artikel + Variante angelegt (kein stilles Phantom: nur auf ausdrücklichen Wunsch).
   * EK-Preise sind sensibel → Aufrufer muss berechtigt sein.
   */
  async ingestCatalog(
    supplierId: string,
    items: SupplierCatalogItem[],
    options: SupplierIngestOptions = {}
  ): Promise<SupplierIngestResult> {
    let upserted = 0;
    let created = 0;
    const skippedSkus: string[] = [];

    for (const item of items) {
      let variantId = await this.repo.findVariantIdBySku(item.sku);
      if (!variantId) {
        if (!options.createUnknown) {
          skippedSkus.push(item.sku);
          continue;
        }
        // Anlegen: Parent über parentSku (Matrix), sonst die Varianten-SKU selbst.
        const articleSku = item.parentSku?.trim() || item.sku;
        const articleName = item.articleName?.trim() || articleSku;
        const articleId = await this.repo.findOrCreateArticle(articleSku, articleName);
        const attrs: Array<{ name: string; value: string }> = [];
        if (item.farbe?.trim()) attrs.push({ name: ATTR_FARBE, value: item.farbe.trim() });
        if (item.groesse?.trim()) attrs.push({ name: ATTR_GROESSE, value: item.groesse.trim() });
        variantId = await this.repo.createVariantWithAttributes(articleId, item.sku, attrs);
        created++;
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
        after: { source: "catalog.sync", upserted, created, skipped: skippedSkus.length },
      })
    );

    return { upserted, created, skipped: skippedSkus.length, skippedSkus };
  }
}
