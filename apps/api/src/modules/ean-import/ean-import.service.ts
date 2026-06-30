// EAN-Listen-Import (B16/B18): Massenimport von Artikelstammdaten mit automatischem
// Abgleich gegen den Variantenbestand (EAN, sonst SKU). Zweistufig: erst `preview`
// (Abgleichplan, schreibt nichts), dann `apply` mit gewählten Optionen — PIM-Felder,
// EAN/Gewicht setzen, EK-Preis + Lieferantenzuordnung, VK-Preise je Preisgruppe über
// Aufschlag generieren (Preisgruppen werden bei Bedarf angelegt). Nicht-Treffer werden
// nur auf Wunsch als neuer Artikel + Variante angelegt (Vorschau + Wahl).

import {
  markupVk,
  parseEanList,
  planEanImport,
  type EanImportPlan,
  type PriceGroupKind,
  type RowError,
  type VariantIndexEntry,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface ArticlePimPatch {
  name?: string;
  brand?: string;
  materialComposition?: string;
  careInstructions?: string;
  hsCode?: string;
  originCountry?: string;
}

export interface EanImportRepository {
  /** Variantenbestand für den Abgleich (id/sku/gtin/articleId/articleName). */
  variantIndex(): Promise<VariantIndexEntry[]>;
  updateArticlePim(articleId: string, patch: ArticlePimPatch): Promise<void>;
  setVariantGtinWeight(variantId: string, gtin: string | null, weightGrams: number | null): Promise<void>;
  upsertSupplierItem(supplierId: string, variantId: string, ekCents: number, supplierSku: string | null): Promise<void>;
  /** Preisgruppe je `kind` sicherstellen (anlegen, falls fehlt) → priceGroupId. */
  ensurePriceGroup(kind: PriceGroupKind, name: string): Promise<string>;
  upsertPrice(variantId: string, priceGroupId: string, netCents: number): Promise<void>;
  /** Neuen Artikel + Basis-Variante für einen Nicht-Treffer anlegen. */
  createArticleWithVariant(input: { sku: string; name: string; gtin: string | null; weightGrams: number | null }): Promise<{ articleId: string; variantId: string }>;
}

export interface EanApplyOptions {
  /** Nicht-Treffer als neuen Artikel + Variante anlegen (benötigt Artikelnummer). */
  createUnmatched: boolean;
  /** PIM-Stammfelder (Bezeichnung, Marke, …) aus der Liste aktualisieren. */
  updatePim: boolean;
  /** EAN + Gewicht auf der getroffenen Variante setzen (ergänzt fehlende EAN). */
  updateGtinWeight: boolean;
  /** EK-Preis + Lieferantenzuordnung aus der Liste schreiben. */
  ek?: { supplierId: string };
  /** VK-Preise je Preisgruppe aus dem EK über Aufschlagsfaktor generieren. */
  vk?: { groups: Array<{ kind: PriceGroupKind; factor: number }> };
}

export interface EanApplySummary {
  matchedUpdated: number;
  created: number;
  skipped: number;
  pimUpdated: number;
  ekUpdated: number;
  pricesWritten: number;
  errors: RowError[];
}

const PRICE_GROUP_NAME: Record<PriceGroupKind, string> = {
  STANDARD: "Standard",
  TOP: "Top",
  PREMIUM: "Premium",
  SCHULE: "Schule",
  WIEDERVERKAEUFER: "Wiederverkäufer",
  AGENTUR: "Agentur",
};

export class EanImportService {
  constructor(private readonly repo: EanImportRepository, private readonly audit: AuditSink) {}

  /** Vorschau: parst die Liste und gleicht ab — schreibt nichts. */
  async preview(csv: string): Promise<EanImportPlan> {
    const { rows, errors } = parseEanList(csv);
    const plan = planEanImport(rows, await this.repo.variantIndex());
    return { ...plan, errors };
  }

  /** Wendet die Liste mit den gewählten Optionen an (idempotent über Upserts). */
  async apply(csv: string, options: EanApplyOptions): Promise<EanApplySummary> {
    const { rows, errors } = parseEanList(csv);
    const plan = planEanImport(rows, await this.repo.variantIndex());
    const summary: EanApplySummary = {
      matchedUpdated: 0, created: 0, skipped: 0, pimUpdated: 0, ekUpdated: 0, pricesWritten: 0, errors: [...errors],
    };

    // Preisgruppen einmalig sicherstellen (anlegen, falls gewählt + fehlend).
    const priceGroupIds = new Map<PriceGroupKind, string>();
    if (options.vk) {
      for (const g of options.vk.groups) {
        if (!priceGroupIds.has(g.kind)) {
          priceGroupIds.set(g.kind, await this.repo.ensurePriceGroup(g.kind, PRICE_GROUP_NAME[g.kind]));
        }
      }
    }

    for (const row of plan.rows) {
      let variantId = row.variantId;
      let articleId = row.articleId;

      // Nicht-Treffer: optional anlegen (braucht eine Artikelnummer).
      if (variantId === null) {
        if (options.createUnmatched && row.sku) {
          const created = await this.repo.createArticleWithVariant({
            sku: row.sku,
            name: row.fields.name || row.sku,
            gtin: row.gtinValid ? row.gtin : null,
            weightGrams: row.fields.weightGrams,
          });
          variantId = created.variantId;
          articleId = created.articleId;
          summary.created += 1;
        } else {
          summary.skipped += 1;
          continue;
        }
      } else {
        summary.matchedUpdated += 1;
      }

      if (options.updatePim && articleId) {
        const patch = nonEmptyPim(row.fields);
        if (Object.keys(patch).length > 0) {
          await this.repo.updateArticlePim(articleId, patch);
          summary.pimUpdated += 1;
        }
      }

      if (options.updateGtinWeight) {
        await this.repo.setVariantGtinWeight(variantId, row.gtinValid ? row.gtin : null, row.fields.weightGrams);
      }

      if (options.ek && row.fields.ekCents !== null) {
        await this.repo.upsertSupplierItem(options.ek.supplierId, variantId, row.fields.ekCents, row.sku || null);
        summary.ekUpdated += 1;
      }

      if (options.vk && row.fields.ekCents !== null) {
        for (const g of options.vk.groups) {
          const pgId = priceGroupIds.get(g.kind);
          if (!pgId) continue;
          await this.repo.upsertPrice(variantId, pgId, markupVk(row.fields.ekCents, g.factor));
          summary.pricesWritten += 1;
        }
      }
    }

    await this.audit.append(buildEntry({
      entity: "EanImport", entityId: "apply", action: "CREATE",
      after: {
        matchedUpdated: summary.matchedUpdated, created: summary.created, skipped: summary.skipped,
        pimUpdated: summary.pimUpdated, ekUpdated: summary.ekUpdated, pricesWritten: summary.pricesWritten,
        options: { createUnmatched: options.createUnmatched, updatePim: options.updatePim, ek: !!options.ek, vkGroups: options.vk?.groups.map((g) => g.kind) ?? [] },
      },
    }));
    return summary;
  }
}

/** Nur gesetzte (nicht-leere) PIM-Felder übernehmen — leere Listenzellen überschreiben nicht. */
function nonEmptyPim(f: { name: string; brand: string; materialComposition: string; careInstructions: string; hsCode: string; originCountry: string }): ArticlePimPatch {
  const patch: ArticlePimPatch = {};
  if (f.name) patch.name = f.name;
  if (f.brand) patch.brand = f.brand;
  if (f.materialComposition) patch.materialComposition = f.materialComposition;
  if (f.careInstructions) patch.careInstructions = f.careInstructions;
  if (f.hsCode) patch.hsCode = f.hsCode;
  if (f.originCountry) patch.originCountry = f.originCountry;
  return patch;
}
