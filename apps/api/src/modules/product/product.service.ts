// Artikel- & Varianten-Stammdaten (PIM-Kern, B16/Kap. 31). Anlegen/Auflisten von
// Artikeln und ihren Farbe×Größe-Varianten. Reine Stammdaten (keine Preise/Buchung).

import { buildEntry, type AuditSink } from "@texma/audit";

export interface ArticleRow {
  id: string;
  sku: string;
  name: string;
  variantCount: number;
}

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

export interface ProductRepository {
  listArticles(): Promise<ArticleRow[]>;
  createArticle(sku: string, name: string): Promise<{ id: string }>;
  listVariants(articleId: string): Promise<VariantRow[]>;
  createVariant(input: CreateVariantInput): Promise<{ id: string }>;
}

export class ProductError extends Error {}

export class ProductService {
  constructor(
    private readonly repo: ProductRepository,
    private readonly audit: AuditSink
  ) {}

  async listArticles(): Promise<ArticleRow[]> {
    return this.repo.listArticles();
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

  async createVariant(input: CreateVariantInput): Promise<{ id: string }> {
    if (!input.sku?.trim()) throw new ProductError("Varianten-SKU ist Pflicht.");
    const res = await this.repo.createVariant({ ...input, sku: input.sku.trim() });
    await this.audit.append(buildEntry({ entity: "Variant", entityId: res.id, action: "CREATE", after: { sku: input.sku, articleId: input.articleId } }));
    return res;
  }
}
