// Artikel- & Varianten-Stammdaten (PIM-Kern, B16/Kap. 31). Anlegen/Auflisten von
// Artikeln und ihren Farbe×Größe-Varianten. Reine Stammdaten (keine Preise/Buchung).

import { buildEntry, type AuditSink } from "@texma/audit";
import { articleCompleteness, type ArticlePimFields, type PimCompleteness } from "@texma/shared";

export interface ArticleRow {
  id: string;
  sku: string;
  name: string;
  /** Artikeltyp-Diskriminator (STOCK/FINISHING/SERVICE/BOM) — steuert z. B. Einrichtungs-Felder. */
  type: string;
  variantCount: number;
  description: string;
  /** Pflicht-Basispreise je Artikel (Cent) — Standard, von Varianten-/Preisgruppenpreisen übersteuerbar. */
  ekCents: number;
  vkCents: number;
  /** Feste Einrichtungskosten der Veredelung (Cent), einmalig unter 10 Teilen — null bei Nicht-Veredelung. */
  einrichtungEkCents: number | null;
  einrichtungVkCents: number | null;
  brand: string;
  materialComposition: string;
  careInstructions: string;
  hsCode: string;
  originCountry: string;
  // ERPNext-Item-Angleichung (Textil-Subset).
  itemGroup: string;
  stockUom: string;
  isSalesItem: boolean;
  isPurchaseItem: boolean;
  minOrderQty: number | null;
  maxDiscountPct: number | null;
  leadTimeDays: number | null;
  gender: string;
  gm2: number | null;
  styleFit: string;
  /** Bestandsführung (Procure-to-Order): default false = kein Bestand. */
  bestandsgefuehrt: boolean;
  /** PIM-Vollständigkeit (abgeleitet, nicht persistiert). */
  completeness: PimCompleteness;
}

/** Editierbare Stammfelder (Name + PIM); leere Strings = Feld leeren. */
export type ArticlePatch = Partial<
  { name: string; ekCents: number; vkCents: number } & ArticlePimFields & {
    itemGroup: string;
    stockUom: string;
    isSalesItem: boolean;
    isPurchaseItem: boolean;
    minOrderQty: number | null;
    maxDiscountPct: number | null;
    leadTimeDays: number | null;
    gender: string;
    gm2: number | null;
    styleFit: string;
    bestandsgefuehrt: boolean;
    // Feste Einrichtungskosten der Veredelung (Cent), einmalig unter 10 Teilen — im Katalog editierbar.
    einrichtungEkCents: number | null;
    einrichtungVkCents: number | null;
  }
>;

export interface VariantRow {
  id: string;
  sku: string;
  attributes: Array<{ name: string; value: string }>;
  /** Bestandsführungs-Override (null = erbt vom Hauptartikel). */
  bestandsgefuehrtOverride: boolean | null;
}

export interface CreateVariantInput {
  articleId: string;
  sku: string;
  attributes: Array<{ name: string; value: string }>;
}

/** Anlage eines Artikels (Textil/Sonstiges). Alle 5 Stammfelder sind Pflicht (überall hart). */
export interface CreateArticleInput {
  sku: string;
  name: string;
  description: string;
  ekCents: number;
  vkCents: number;
  /** Pflicht (Kap. 4.4): jeder Artikel hat genau EINEN (Textil-)Lieferanten. */
  supplierId: string;
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
  /** Basis-Verkaufspreis des Artikels (Pflicht, Cent) — Fallback, wenn keine Preisgruppe greift. */
  vkCents: number;
  /** Basis-Einkaufspreis des Artikels (Pflicht, Cent) — für DB-Anzeige/Kalkulation im Picker. */
  ekCents: number;
  /** true, wenn die Variante eine Set-/Bundle-Stückliste hat (Kap. 5.1). */
  isBundle: boolean;
}

/** Veredelungs-/Logo-Artikel (type FINISHING) für die Inline-Auswahl in der Positionsmaske. */
export interface VeredelungCatalogEntry extends CatalogEntry {
  /** Im Artikelstamm hinterlegte Platzierungen (FinishingSpec) — Vorschläge für die Position. */
  placements: string[];
  /** Feste Einrichtungskosten (Cent), einmalig unter 10 Teilen — für den Beleg-Vorschlag. */
  einrichtungEkCents: number | null;
  einrichtungVkCents: number | null;
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

/** Mengenstaffel-Stufe eines Veredelungs-/Logo-Artikels (ab minMenge gilt vkCents).
 * `ekCents` optional je Stufe (Stick-EK gestaffelt nach Menge) → VariantEkTier. */
export interface VeredelungTier {
  minMenge: number;
  vkCents: number;
  ekCents?: number | null;
}

/** Anlage eines Veredelungs-/Logo-Artikels mit Pflicht-Veredler + eigener Staffel. */
export interface CreateVeredelungInput {
  name: string;
  sku: string;
  method: "STICK" | "DRUCK" | "DRUCK_DIGITAL" | "TRANSFER";
  /** Einzelne Platzierung (Rückwärtskompatibilität); für mehrere Platzierungen `placements`. */
  placement?: string;
  /** Mehrere Platzierungen je Logo (z. B. Brust + Rücken) → je eine Veredelungs-Spezifikation. */
  placements?: string[];
  /** Zugewiesener externer Veredler; null/leer = inhouse-Veredelung (keine Fremdvergabe). */
  veredlerId?: string | null;
  /**
   * Material-Dienstleister bei Inhouse-Veredelung (z. B. Transferdruck-Lieferant): liefert das
   * Material (Transfers), die Applikation läuft inhouse. Erzeugt einen Einkaufs-/Bestellbedarf
   * über die Beschaffung — getrennt vom (fehlenden) Veredler. Bei externem Veredler ungenutzt.
   */
  materialLieferantId?: string | null;
  /** Einkaufspreis (Cent) beim Veredler bzw. Material-Dienstleister; je Logo abweichend. */
  ekCents?: number;
  /** Eigene Mengenstaffel (VK je Stück ab Menge) — pro Logo unterschiedlich. */
  tiers?: VeredelungTier[];
  /** Feste Einrichtungskosten (Cent), einmalig unter 10 Teilen: EK = unser Einkauf. */
  einrichtungEkCents?: number | null;
  /** Feste Einrichtungskosten (Cent), einmalig unter 10 Teilen: VK = Kundenpreis. */
  einrichtungVkCents?: number | null;
}

export interface ProductRepository {
  listArticles(): Promise<Omit<ArticleRow, "completeness">[]>;
  createArticle(input: { sku: string; name: string; description: string; ekCents: number; vkCents: number; supplierId: string }): Promise<{ id: string }>;
  listVariants(articleId: string): Promise<VariantRow[]>;
  /** Flacher Varianten-Katalog (Artikelname + Merkmale + Standardpreis) für Picker. */
  catalog(): Promise<CatalogEntry[]>;
  /** Serverseitige, begrenzte Katalogsuche (SKU/Name/Beschreibung) für skalierbare Picker. */
  searchCatalog(query: string, limit: number): Promise<CatalogEntry[]>;
  /** Veredelungs-/Logo-Artikel (FINISHING) inkl. Stamm-Platzierungen für die Inline-Auswahl. */
  veredelungCatalog(): Promise<VeredelungCatalogEntry[]>;
  createVariant(input: CreateVariantInput): Promise<{ id: string }>;
  /** Erzeugt das Farbe×Größe-Raster eines Artikels; vorhandene Kombis werden übersprungen. */
  generateMatrixVariants(articleId: string, combos: ReadonlyArray<{ farbe: string; groesse: string }>): Promise<{ created: number; skipped: number; createdSkus: string[] }>;
  /** Aktualisiert die angegebenen Felder eines Artikels; @returns false wenn unbekannt. */
  updateArticle(id: string, patch: ArticlePatch): Promise<boolean>;
  /** Setzt das Bestandsführungs-Override einer Variante (null = erbt vom Artikel). */
  setVariantStockManaged(variantId: string, value: boolean | null): Promise<boolean>;
  /** Massenupdate über SKUs; @returns Anzahl aktualisierter Artikel. */
  updateArticlesBySku(skus: string[], patch: ArticlePatch): Promise<number>;
  /** Stückliste (Komponenten) einer Set-Variante. */
  listComponents(variantId: string): Promise<ComponentRow[]>;
  /** Setzt die Stückliste neu (ersetzt) und markiert die Variante als Set (isBundle). */
  setComponents(variantId: string, components: ComponentInput[]): Promise<void>;
  /** Prüft, ob ein Lieferant (Veredler) existiert. */
  supplierExists(id: string): Promise<boolean>;
  /** Hängt EK (SupplierItem beim Lieferant) und/oder VK (STANDARD-Preisgruppe) an eine frisch
   * angelegte Variante — für die Inline-Schnellanlage aus dem Positionseditor. */
  setVariantPricing(variantId: string, pricing: { supplierId?: string | null; ekCents?: number | null; vkCents?: number | null }): Promise<void>;
  /** Legt einen Veredelungs-/Logo-Artikel mit (optionalem) Veredler, EK und Mengenstaffel an. */
  createVeredelungArticle(input: Required<Pick<CreateVeredelungInput, "name" | "sku" | "method">> & { veredlerId: string | null; materialSupplierId: string | null; placements: string[]; ekCents: number | null; tiers: VeredelungTier[]; einrichtungEkCents: number | null; einrichtungVkCents: number | null }): Promise<CatalogEntry>;
}

export class ProductError extends Error {}

/** Entfernt undefinierte Felder und trimmt Strings (leerer String = Feld leeren). */
function normalizePatch(patch: ArticlePatch): ArticlePatch {
  const out: ArticlePatch = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    (out as Record<string, unknown>)[k] = typeof v === "string" ? v.trim() : v;
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

  /** Bestandsführung je Variante übersteuern (null = erbt vom Hauptartikel). */
  async setVariantStockManaged(variantId: string, value: boolean | null): Promise<void> {
    const ok = await this.repo.setVariantStockManaged(variantId, value);
    if (!ok) throw new ProductError(`Variante ${variantId} nicht gefunden.`);
    await this.audit.append(buildEntry({ entity: "Variant", entityId: variantId, action: "UPDATE", after: { bestandsgefuehrtOverride: value } }));
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

  async createArticle(input: CreateArticleInput): Promise<{ id: string }> {
    // Pflichtfelder hart erzwingen (überall, alle Typen): Nr., Name, Beschreibung, EK, VK, Lieferant.
    const sku = input.sku?.trim();
    const name = input.name?.trim();
    const description = input.description?.trim();
    const supplierId = input.supplierId?.trim();
    if (!sku || !name) throw new ProductError("Artikelnummer und Artikelname sind Pflicht.");
    if (!description) throw new ProductError("Artikelbeschreibung ist Pflicht.");
    if (!Number.isInteger(input.ekCents) || input.ekCents < 0) throw new ProductError("EK (Einkaufspreis) ist Pflicht (≥ 0).");
    if (!Number.isInteger(input.vkCents) || input.vkCents < 0) throw new ProductError("VK (Verkaufspreis) ist Pflicht (≥ 0).");
    // Jeder Artikel hat genau EINEN (Textil-)Lieferanten (Kap. 4.4) — Grundlage des VK-Aufschlags.
    if (!supplierId) throw new ProductError("Lieferant ist Pflicht (jeder Artikel hat genau einen Lieferanten).");
    if (!(await this.repo.supplierExists(supplierId))) throw new ProductError("Unbekannter Lieferant.");
    const res = await this.repo.createArticle({ sku, name, description, ekCents: input.ekCents, vkCents: input.vkCents, supplierId });
    await this.audit.append(buildEntry({ entity: "Article", entityId: res.id, action: "CREATE", after: { sku, name, description, ekCents: input.ekCents, vkCents: input.vkCents, supplierId } }));
    return res;
  }

  async listVariants(articleId: string): Promise<VariantRow[]> {
    return this.repo.listVariants(articleId);
  }

  /** Flacher Artikel-/Varianten-Katalog für die Positionserfassung (Picker). */
  catalog(): Promise<CatalogEntry[]> {
    return this.repo.catalog();
  }

  /** Veredelungs-/Logo-Artikel (FINISHING) inkl. Stamm-Platzierungen — für die Inline-Auswahl. */
  veredelungCatalog(): Promise<VeredelungCatalogEntry[]> {
    return this.repo.veredelungCatalog();
  }

  /**
   * Serverseitige Katalogsuche für skalierbare Picker (10–20 Lieferanten × ~250 Artikel ×
   * Farbe×Größe → sechsstellige Variantenzahl): liefert nur die ersten `limit` Treffer,
   * statt den ganzen Katalog in den Browser zu laden. Leere Anfrage → erste `limit` Einträge.
   */
  searchCatalog(query: string, limit = 50): Promise<CatalogEntry[]> {
    const n = Math.min(Math.max(limit, 1), 200);
    return this.repo.searchCatalog(query.trim(), n);
  }

  async createVariant(input: CreateVariantInput): Promise<{ id: string }> {
    if (!input.sku?.trim()) throw new ProductError("Varianten-SKU ist Pflicht.");
    const res = await this.repo.createVariant({ ...input, sku: input.sku.trim() });
    await this.audit.append(buildEntry({ entity: "Variant", entityId: res.id, action: "CREATE", after: { sku: input.sku, articleId: input.articleId } }));
    return res;
  }

  /** Matrixprodukt: erzeugt die ausgewählten Farbe×Größe-Kombinationen (idempotent). GoBD-auditiert. */
  async generateMatrix(articleId: string, combos: ReadonlyArray<{ farbe: string; groesse: string }>): Promise<{ created: number; skipped: number }> {
    const clean = combos
      .map((c) => ({ farbe: c.farbe.trim(), groesse: c.groesse.trim() }))
      .filter((c) => c.farbe && c.groesse);
    if (clean.length === 0) throw new ProductError("Keine Farbe×Größe-Kombination ausgewählt.");
    const res = await this.repo.generateMatrixVariants(articleId, clean);
    if (res.created > 0) {
      await this.audit.append(buildEntry({ entity: "Article", entityId: articleId, action: "UPDATE", after: { matrixVariantsCreated: res.created, skus: res.createdSkus } }));
    }
    return { created: res.created, skipped: res.skipped };
  }

  /**
   * Schnellanlage aus dem Picker (Angebot/Auftrag/Leihgut): legt Artikel + eine
   * Basis-Variante an, damit der neue Artikel sofort wählbar ist, und liefert den
   * Katalog-Eintrag zurück. Ohne Merkmale = Varianten-SKU gleich Artikel-SKU.
   */
  async quickCreateCatalogEntry(input: {
    sku: string;
    name: string;
    // Pflicht-Stammdaten (überall hart): Beschreibung + Basis-EK/-VK des Artikels.
    description: string;
    ekCents: number;
    vkCents: number;
    attributes?: Array<{ name: string; value: string }>;
    // Pflicht (Kap. 4.4): jeder Artikel hat genau EINEN (Textil-)Lieferanten.
    supplierId: string;
  }): Promise<CatalogEntry> {
    const attributes = (input.attributes ?? []).filter((a) => a.name.trim() && a.value.trim());
    const supplierId = input.supplierId?.trim() || "";
    // createArticle erzwingt alle 6 Pflichtfelder (Nr./Name/Beschreibung/EK/VK/Lieferant) inkl. Existenz.
    const art = await this.createArticle({ sku: input.sku, name: input.name, description: input.description, ekCents: input.ekCents, vkCents: input.vkCents, supplierId });
    const baseSku = input.sku.trim();
    const variantSku = attributes.length ? `${baseSku}-${attributes.map((a) => a.value.trim()).join("-")}` : baseSku;
    const v = await this.createVariant({ articleId: art.id, sku: variantSku, attributes });
    // Varianten-Pricing: Lieferanten-EK (SupplierItem) + STANDARD-VK setzen.
    await this.repo.setVariantPricing(v.id, { supplierId, ekCents: input.ekCents, vkCents: input.vkCents });
    const attrText = attributes.map((a) => a.value.trim()).join(" / ");
    const label = `${input.name.trim()}${attrText ? ` — ${attrText}` : ""} (${variantSku})`;
    return { variantId: v.id, articleId: art.id, articleName: input.name.trim(), sku: variantSku, description: input.description.trim(), label, unitNetCents: input.vkCents, vkCents: input.vkCents, ekCents: input.ekCents, isBundle: false };
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
    // Veredler ist optional: leer = inhouse-Veredelung (z. B. 2-farbiger Transferdruck im
    // Haus) → erzeugt KEINE Fremdvergabe-Stufe. Mit Veredler = externe Lohnveredelung.
    const veredlerId = input.veredlerId?.trim() || null;
    if (veredlerId && !(await this.repo.supplierExists(veredlerId))) throw new ProductError("Unbekannter Veredler.");
    // Material-Dienstleister (Inhouse, z. B. Transfer-Lieferant): liefert das Material, die
    // Applikation bleibt inhouse. Nur bei Inhouse relevant; bei externem Veredler ist der
    // Veredler selbst die EK-Quelle (kein separater Materiallieferant).
    const materialLieferantId = input.materialLieferantId?.trim() || null;
    if (materialLieferantId && !(await this.repo.supplierExists(materialLieferantId))) throw new ProductError("Unbekannter Material-Dienstleister.");
    // EK-/Bestell-Quelle der Beschaffung: externer Veredler, sonst der Material-Dienstleister.
    const materialSupplierId = veredlerId ?? materialLieferantId;
    if (input.ekCents !== undefined && input.ekCents < 0) throw new ProductError("EK darf nicht negativ sein.");
    const tiers = (input.tiers ?? []).filter((t) => t.minMenge > 0 && t.vkCents >= 0).sort((a, b) => a.minMenge - b.minMenge);
    for (const t of tiers) if (t.vkCents < 0) throw new ProductError("Staffelpreis darf nicht negativ sein.");
    // Feste Einrichtungskosten (EK+VK), einmalig unter 10 Teilen. Nicht negativ.
    const einrichtungEkCents = input.einrichtungEkCents ?? null;
    const einrichtungVkCents = input.einrichtungVkCents ?? null;
    if ((einrichtungEkCents !== null && einrichtungEkCents < 0) || (einrichtungVkCents !== null && einrichtungVkCents < 0)) {
      throw new ProductError("Einrichtungskosten dürfen nicht negativ sein.");
    }
    // Mehrere Platzierungen je Logo (z. B. Siebdruck vorne + hinten) → je eine FinishingSpec.
    // Rückwärtskompatibel: ohne `placements` zählt das Einzelfeld `placement`. Dedupliziert;
    // mindestens eine (ggf. leere) Spezifikation, damit die Veredelungsart erhalten bleibt.
    const rawPlacements = input.placements && input.placements.length > 0 ? input.placements : (input.placement ? [input.placement] : []);
    const placements = [...new Set(rawPlacements.map((p) => p.trim()).filter(Boolean))];
    const finalPlacements = placements.length > 0 ? placements : [""];

    const entry = await this.repo.createVeredelungArticle({
      name: input.name.trim(), sku: input.sku.trim(), method: input.method,
      placements: finalPlacements, veredlerId, materialSupplierId,
      ekCents: input.ekCents ?? null, tiers, einrichtungEkCents, einrichtungVkCents,
    });
    await this.audit.append(buildEntry({
      entity: "Article", entityId: entry.articleId, action: "CREATE",
      after: { veredelung: input.method, veredlerId, inhouse: veredlerId === null, materialLieferantId, ekCents: input.ekCents ?? null, staffeln: tiers.length, platzierungen: finalPlacements.filter(Boolean).length, einrichtungEkCents, einrichtungVkCents },
    }));
    return entry;
  }
}
