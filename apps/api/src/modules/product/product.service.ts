// Artikel- & Varianten-Stammdaten (PIM-Kern, B16/Kap. 31). Anlegen/Auflisten von
// Artikeln und ihren Farbe×Größe-Varianten. Reine Stammdaten (keine Preise/Buchung).

import { buildEntry, type AuditSink } from "@texma/audit";
import { articleCompleteness, type ArticlePimFields, type PimCompleteness } from "@texma/shared";

export interface ArticleRow {
  id: string;
  sku: string;
  name: string;
  variantCount: number;
  description: string;
  brand: string;
  materialComposition: string;
  careInstructions: string;
  hsCode: string;
  originCountry: string;
  /** PIM-Vollständigkeit (abgeleitet, nicht persistiert). */
  completeness: PimCompleteness;
}

/** Editierbare Stammfelder (Name + PIM); leere Strings = Feld leeren. */
export type ArticlePatch = Partial<{ name: string } & ArticlePimFields>;

export interface VariantRow {
  id: string;
  sku: string;
  attributes: Array<{ name: string; value: string }>;
}

export interface CreateVariantInput {
  articleId: string;
  sku: string;
  attributes: Array<{ name: string; value: string }>;
}

/** Flacher Katalog-Eintrag je Variante — für den Artikel-Picker in Angebot/Auftrag/Leihgut. */
export interface CatalogEntry {
  variantId: string;
  articleId: string;
  /** Varianten-SKU. */
  sku: string;
  /** Anzeigetext: Artikelname + Varianten-Merkmale. */
  label: string;
  /** Standardpreis (Preisgruppe STANDARD) in Cent, 0 wenn nicht hinterlegt. */
  unitNetCents: number;
}

export interface ProductRepository {
  listArticles(): Promise<Omit<ArticleRow, "completeness">[]>;
  createArticle(sku: string, name: string): Promise<{ id: string }>;
  listVariants(articleId: string): Promise<VariantRow[]>;
  /** Flacher Varianten-Katalog (Artikelname + Merkmale + Standardpreis) für Picker. */
  catalog(): Promise<CatalogEntry[]>;
  createVariant(input: CreateVariantInput): Promise<{ id: string }>;
  /** Aktualisiert die angegebenen Felder eines Artikels; @returns false wenn unbekannt. */
  updateArticle(id: string, patch: ArticlePatch): Promise<boolean>;
  /** Massenupdate über SKUs; @returns Anzahl aktualisierter Artikel. */
  updateArticlesBySku(skus: string[], patch: ArticlePatch): Promise<number>;
}

export class ProductError extends Error {}

/** Entfernt undefinierte Felder und trimmt Strings (leerer String = Feld leeren). */
function normalizePatch(patch: ArticlePatch): ArticlePatch {
  const out: ArticlePatch = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    (out as Record<string, string>)[k] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}

export class ProductService {
  constructor(
    private readonly repo: ProductRepository,
    private readonly audit: AuditSink
  ) {}

  async listArticles(): Promise<ArticleRow[]> {
    const rows = await this.repo.listArticles();
    return rows.map((r) => ({ ...r, completeness: articleCompleteness(r) }));
  }

  /** Schnellbearbeitung: ein Artikel, beliebige Stammfelder. */
  async updateArticle(id: string, patch: ArticlePatch): Promise<void> {
    if (patch.name !== undefined && !patch.name.trim()) throw new ProductError("Name darf nicht leer sein.");
    const ok = await this.repo.updateArticle(id, normalizePatch(patch));
    if (!ok) throw new ProductError(`Artikel ${id} nicht gefunden.`);
    await this.audit.append(buildEntry({ entity: "Article", entityId: id, action: "UPDATE", after: patch }));
  }

  /** Massenbearbeitung: ein Feld-Patch auf viele Artikel (per SKU). */
  async bulkUpdateArticles(skus: string[], patch: ArticlePatch): Promise<{ updated: number }> {
    const cleaned = skus.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length === 0) throw new ProductError("Keine Artikel ausgewählt.");
    if (Object.keys(normalizePatch(patch)).length === 0) throw new ProductError("Kein Feld zum Ändern angegeben.");
    const updated = await this.repo.updateArticlesBySku(cleaned, normalizePatch(patch));
    await this.audit.append(buildEntry({ entity: "Article", entityId: "BULK", action: "UPDATE", after: { skus: cleaned, patch, updated } }));
    return { updated };
  }

  async createArticle(sku: string, name: string): Promise<{ id: string }> {
    if (!sku?.trim() || !name?.trim()) throw new ProductError("SKU und Name sind Pflicht.");
    const res = await this.repo.createArticle(sku.trim(), name.trim());
    await this.audit.append(buildEntry({ entity: "Article", entityId: res.id, action: "CREATE", after: { sku, name } }));
    return res;
  }

  async listVariants(articleId: string): Promise<VariantRow[]> {
    return this.repo.listVariants(articleId);
  }

  /** Flacher Artikel-/Varianten-Katalog für die Positionserfassung (Picker). */
  catalog(): Promise<CatalogEntry[]> {
    return this.repo.catalog();
  }

  async createVariant(input: CreateVariantInput): Promise<{ id: string }> {
    if (!input.sku?.trim()) throw new ProductError("Varianten-SKU ist Pflicht.");
    const res = await this.repo.createVariant({ ...input, sku: input.sku.trim() });
    await this.audit.append(buildEntry({ entity: "Variant", entityId: res.id, action: "CREATE", after: { sku: input.sku, articleId: input.articleId } }));
    return res;
  }
}
