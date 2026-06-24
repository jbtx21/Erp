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
  /** Artikelname ohne Varianten-Merkmale (für den Hauptartikel-Picker). */
  articleName: string;
  /** Varianten-SKU. */
  sku: string;
  /** Artikelbeschreibung (für Suche/Anzeige; leer wenn nicht gepflegt). */
  description: string;
  /** Anzeigetext: Artikelname + Varianten-Merkmale. */
  label: string;
  /** Standardpreis (Preisgruppe STANDARD) in Cent, 0 wenn nicht hinterlegt. */
  unitNetCents: number;
  /** true, wenn die Variante eine Set-/Bundle-Stückliste hat (Kap. 5.1). */
  isBundle: boolean;
}

/** Eine Stücklisten-Komponente einer Set-/Bundle-Variante (Kap. 5.1). */
export interface ComponentRow {
  description: string;
  qty: number;
  componentVariantId: string | null;
  /** Anzeigetext der verknüpften Komponentenvariante (null = reine Freitext-Komponente). */
  componentLabel: string | null;
}

/** Eingabe für das Setzen einer Stückliste (ersetzt die bestehende komplett). */
export interface ComponentInput {
  description: string;
  qty: number;
  componentVariantId?: string | null;
}

/** Mengenstaffel-Stufe eines Veredelungs-/Logo-Artikels (ab minMenge gilt vkCents). */
export interface VeredelungTier {
  minMenge: number;
  vkCents: number;
}

/** Anlage eines Veredelungs-/Logo-Artikels mit Pflicht-Veredler + eigener Staffel. */
export interface CreateVeredelungInput {
  name: string;
  sku: string;
  method: "STICK" | "DRUCK" | "TRANSFER";
  placement?: string;
  /** Zugewiesener Veredler (Pflicht; analog Textil-„Hersteller"). */
  veredlerId: string;
  /** Einkaufspreis des Logos beim Veredler (Cent); je Logo abweichend. */
  ekCents?: number;
  /** Eigene Mengenstaffel (VK je Stück ab Menge) — pro Logo unterschiedlich. */
  tiers?: VeredelungTier[];
}

export interface ProductRepository {
  listArticles(): Promise<Omit<ArticleRow, "completeness">[]>;
  createArticle(sku: string, name: string, description?: string | null): Promise<{ id: string }>;
  listVariants(articleId: string): Promise<VariantRow[]>;
  /** Flacher Varianten-Katalog (Artikelname + Merkmale + Standardpreis) für Picker. */
  catalog(): Promise<CatalogEntry[]>;
  createVariant(input: CreateVariantInput): Promise<{ id: string }>;
  /** Aktualisiert die angegebenen Felder eines Artikels; @returns false wenn unbekannt. */
  updateArticle(id: string, patch: ArticlePatch): Promise<boolean>;
  /** Massenupdate über SKUs; @returns Anzahl aktualisierter Artikel. */
  updateArticlesBySku(skus: string[], patch: ArticlePatch): Promise<number>;
  /** Stückliste (Komponenten) einer Set-Variante. */
  listComponents(variantId: string): Promise<ComponentRow[]>;
  /** Setzt die Stückliste neu (ersetzt) und markiert die Variante als Set (isBundle). */
  setComponents(variantId: string, components: ComponentInput[]): Promise<void>;
  /** Prüft, ob ein Lieferant (Veredler) existiert. */
  supplierExists(id: string): Promise<boolean>;
  /** Legt einen Veredelungs-/Logo-Artikel mit Veredler, EK und Mengenstaffel an. */
  createVeredelungArticle(input: Required<Pick<CreateVeredelungInput, "name" | "sku" | "method" | "veredlerId">> & { placement: string | null; ekCents: number | null; tiers: VeredelungTier[] }): Promise<CatalogEntry>;
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

  async createArticle(sku: string, name: string, description?: string): Promise<{ id: string }> {
    if (!sku?.trim() || !name?.trim()) throw new ProductError("SKU und Name sind Pflicht.");
    const desc = description?.trim() || null;
    const res = await this.repo.createArticle(sku.trim(), name.trim(), desc);
    await this.audit.append(buildEntry({ entity: "Article", entityId: res.id, action: "CREATE", after: { sku, name, description: desc } }));
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

  /**
   * Schnellanlage aus dem Picker (Angebot/Auftrag/Leihgut): legt Artikel + eine
   * Basis-Variante an, damit der neue Artikel sofort wählbar ist, und liefert den
   * Katalog-Eintrag zurück. Ohne Merkmale = Varianten-SKU gleich Artikel-SKU.
   */
  async quickCreateCatalogEntry(input: {
    sku: string;
    name: string;
    description?: string;
    attributes?: Array<{ name: string; value: string }>;
  }): Promise<CatalogEntry> {
    const attributes = (input.attributes ?? []).filter((a) => a.name.trim() && a.value.trim());
    const description = input.description?.trim() ?? "";
    const art = await this.createArticle(input.sku, input.name, description);
    const baseSku = input.sku.trim();
    const variantSku = attributes.length ? `${baseSku}-${attributes.map((a) => a.value.trim()).join("-")}` : baseSku;
    const v = await this.createVariant({ articleId: art.id, sku: variantSku, attributes });
    const attrText = attributes.map((a) => a.value.trim()).join(" / ");
    const label = `${input.name.trim()}${attrText ? ` — ${attrText}` : ""} (${variantSku})`;
    return { variantId: v.id, articleId: art.id, articleName: input.name.trim(), sku: variantSku, description, label, unitNetCents: 0, isBundle: false };
  }

  /** Stückliste (Komponenten) einer Set-Variante (Kap. 5.1). */
  async listComponents(variantId: string): Promise<ComponentRow[]> {
    return this.repo.listComponents(variantId);
  }

  /** Setzt die Stückliste einer Variante neu (ersetzt) und markiert sie als Set. */
  async setComponents(variantId: string, components: ComponentInput[]): Promise<void> {
    if (!variantId.trim()) throw new ProductError("Variante ist Pflicht.");
    const clean = components
      .map((c) => ({ description: c.description.trim(), qty: c.qty, componentVariantId: c.componentVariantId ?? null }))
      .filter((c) => c.description);
    for (const c of clean) {
      if (c.qty <= 0) throw new ProductError("Komponentenmenge muss größer als 0 sein.");
      if (c.componentVariantId === variantId) throw new ProductError("Eine Variante kann sich nicht selbst enthalten.");
    }
    await this.repo.setComponents(variantId, clean);
    await this.audit.append(buildEntry({ entity: "Variant", entityId: variantId, action: "UPDATE", after: { stueckliste: clean.length, isBundle: clean.length > 0 } }));
  }

  /**
   * Legt ein Logo/eine Veredelung als wiederverwendbaren Artikel an (Kap. 5.4/11):
   * Pflicht-Veredler (analog Textil-„Hersteller"), eigener EK beim Veredler und eine
   * eigene Mengenstaffel (je Logo unterschiedlich). Sofort im Katalog wählbar.
   */
  async createVeredelungArticle(input: CreateVeredelungInput): Promise<CatalogEntry> {
    if (!input.name?.trim() || !input.sku?.trim()) throw new ProductError("SKU und Name sind Pflicht.");
    if (!input.veredlerId?.trim()) throw new ProductError("Veredler ist Pflicht (Logo/Veredelung).");
    if (!(await this.repo.supplierExists(input.veredlerId))) throw new ProductError("Unbekannter Veredler.");
    if (input.ekCents !== undefined && input.ekCents < 0) throw new ProductError("EK darf nicht negativ sein.");
    const tiers = (input.tiers ?? []).filter((t) => t.minMenge > 0 && t.vkCents >= 0).sort((a, b) => a.minMenge - b.minMenge);
    for (const t of tiers) if (t.vkCents < 0) throw new ProductError("Staffelpreis darf nicht negativ sein.");

    const entry = await this.repo.createVeredelungArticle({
      name: input.name.trim(), sku: input.sku.trim(), method: input.method,
      placement: input.placement?.trim() || null, veredlerId: input.veredlerId,
      ekCents: input.ekCents ?? null, tiers,
    });
    await this.audit.append(buildEntry({
      entity: "Article", entityId: entry.articleId, action: "CREATE",
      after: { veredelung: input.method, veredlerId: input.veredlerId, ekCents: input.ekCents ?? null, staffeln: tiers.length },
    }));
    return entry;
  }
}
