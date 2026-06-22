// In-Memory-Artikel/Varianten-Repository für Unit-Tests/Dev.

import type {
  ArticlePatch,
  ArticleRow,
  CreateVariantInput,
  ProductRepository,
  VariantRow,
} from "../modules/product/product.service.js";

type StoredArticle = { id: string; sku: string; name: string; description: string; brand: string; materialComposition: string; careInstructions: string; hsCode: string; originCountry: string };
const emptyPim = { description: "", brand: "", materialComposition: "", careInstructions: "", hsCode: "", originCountry: "" };

export class InMemoryProductRepository implements ProductRepository {
  private readonly articles = new Map<string, StoredArticle>();
  private readonly variants = new Map<string, { id: string; articleId: string; sku: string; attributes: Array<{ name: string; value: string }> }>();
  private seq = 0;

  async listArticles(): Promise<Omit<ArticleRow, "completeness">[]> {
    return [...this.articles.values()]
      .map((a) => ({ ...a, variantCount: [...this.variants.values()].filter((v) => v.articleId === a.id).length }))
      .sort((a, b) => a.sku.localeCompare(b.sku));
  }

  async createArticle(sku: string, name: string): Promise<{ id: string }> {
    const id = `art_${++this.seq}`;
    this.articles.set(id, { id, sku, name, ...emptyPim });
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
    this.variants.set(id, { id, articleId: input.articleId, sku: input.sku, attributes: input.attributes.map((a) => ({ ...a })) });
    return { id };
  }
}
