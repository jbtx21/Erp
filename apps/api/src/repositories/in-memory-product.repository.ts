// In-Memory-Artikel/Varianten-Repository für Unit-Tests/Dev.

import type {
  ArticlePatch,
  ArticleRow,
  CatalogEntry,
  ComponentInput,
  ComponentRow,
  CreateVariantInput,
  ProductRepository,
  VariantRow,
  VeredelungTier,
} from "../modules/product/product.service.js";

type StoredArticle = { id: string; sku: string; name: string; description: string; brand: string; materialComposition: string; careInstructions: string; hsCode: string; originCountry: string };
const emptyPim = { description: "", brand: "", materialComposition: "", careInstructions: "", hsCode: "", originCountry: "" };

export class InMemoryProductRepository implements ProductRepository {
  private readonly articles = new Map<string, StoredArticle>();
  private readonly variants = new Map<string, { id: string; articleId: string; sku: string; attributes: Array<{ name: string; value: string }>; isBundle: boolean }>();
  private readonly components = new Map<string, ComponentInput[]>();
  private seq = 0;

  async listArticles(): Promise<Omit<ArticleRow, "completeness">[]> {
    return [...this.articles.values()]
      .map((a) => ({ ...a, variantCount: [...this.variants.values()].filter((v) => v.articleId === a.id).length }))
      .sort((a, b) => a.sku.localeCompare(b.sku));
  }

  async createArticle(sku: string, name: string, description?: string | null): Promise<{ id: string }> {
    const id = `art_${++this.seq}`;
    this.articles.set(id, { id, sku, name, ...emptyPim, description: description ?? "" });
    return { id };
  }

  async updateArticle(id: string, patch: ArticlePatch): Promise<boolean> {
    const a = this.articles.get(id);
    if (!a) return false;
    Object.assign(a, patch);
    return true;
  }

  async updateArticlesBySku(skus: string[], patch: ArticlePatch): Promise<number> {
    let n = 0;
    for (const a of this.articles.values()) {
      if (skus.includes(a.sku)) { Object.assign(a, patch); n++; }
    }
    return n;
  }

  async listVariants(articleId: string): Promise<VariantRow[]> {
    return [...this.variants.values()]
      .filter((v) => v.articleId === articleId)
      .map((v) => ({ id: v.id, sku: v.sku, attributes: v.attributes.map((a) => ({ ...a })) }));
  }

  async createVariant(input: CreateVariantInput): Promise<{ id: string }> {
    const id = `var_${++this.seq}`;
    this.variants.set(id, { id, articleId: input.articleId, sku: input.sku, attributes: input.attributes.map((a) => ({ ...a })), isBundle: false });
    return { id };
  }

  async catalog(): Promise<import("../modules/product/product.service.js").CatalogEntry[]> {
    return [...this.variants.values()].map((v) => {
      const a = this.articles.get(v.articleId);
      const attrs = v.attributes.map((x) => x.value).join(" / ");
      const label = `${a?.name ?? v.articleId}${attrs ? ` — ${attrs}` : ""} (${v.sku})`;
      return { variantId: v.id, articleId: v.articleId, articleName: a?.name ?? v.articleId, sku: v.sku, description: a?.description ?? "", label, unitNetCents: 0, isBundle: v.isBundle };
    });
  }

  async listComponents(variantId: string): Promise<ComponentRow[]> {
    const comps = this.components.get(variantId) ?? [];
    return comps.map((c) => {
      const cv = c.componentVariantId ? this.variants.get(c.componentVariantId) : undefined;
      const a = cv ? this.articles.get(cv.articleId) : undefined;
      const attrs = cv ? cv.attributes.map((x) => x.value).join(" / ") : "";
      return {
        description: c.description, qty: c.qty, componentVariantId: c.componentVariantId ?? null,
        componentLabel: cv ? `${a?.name ?? cv.articleId}${attrs ? ` — ${attrs}` : ""} (${cv.sku})` : null,
      };
    });
  }

  async setComponents(variantId: string, components: ComponentInput[]): Promise<void> {
    this.components.set(variantId, components.map((c) => ({ ...c })));
    const v = this.variants.get(variantId);
    if (v) v.isBundle = components.length > 0;
  }

  // Veredler (Lieferanten) für Tests registrierbar.
  readonly suppliers = new Set<string>();
  readonly veredelungArticles = new Map<string, { veredlerId: string; ekCents: number | null; tiers: VeredelungTier[] }>();
  addSupplier(id: string): void { this.suppliers.add(id); }

  async supplierExists(id: string): Promise<boolean> { return this.suppliers.has(id); }

  async createVeredelungArticle(input: { name: string; sku: string; method: "STICK" | "DRUCK" | "TRANSFER"; placement: string | null; veredlerId: string; ekCents: number | null; tiers: VeredelungTier[] }): Promise<CatalogEntry> {
    const articleId = `art_${++this.seq}`;
    this.articles.set(articleId, { id: articleId, sku: input.sku, name: input.name, ...emptyPim });
    const variantId = `var_${++this.seq}`;
    this.variants.set(variantId, { id: variantId, articleId, sku: input.sku, attributes: [], isBundle: false });
    this.veredelungArticles.set(articleId, { veredlerId: input.veredlerId, ekCents: input.ekCents, tiers: input.tiers });
    return { variantId, articleId, articleName: input.name, sku: input.sku, description: "", label: `${input.name} (${input.sku})`, unitNetCents: input.tiers[0]?.vkCents ?? 0, isBundle: false };
  }
}
