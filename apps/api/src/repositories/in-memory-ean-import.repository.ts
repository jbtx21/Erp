// In-Memory-EAN-Import-Repository für Unit-Tests/Dev.

import type { PriceGroupKind, VariantIndexEntry } from "@texma/shared";
import type { ArticlePimPatch, EanImportRepository } from "../modules/ean-import/ean-import.service.js";

interface MemArticle { id: string; sku: string; name: string; pim: ArticlePimPatch }
interface MemVariant { id: string; articleId: string; sku: string; gtin: string | null; weightGrams: number | null }

export class InMemoryEanImportRepository implements EanImportRepository {
  readonly articles = new Map<string, MemArticle>();
  readonly variants = new Map<string, MemVariant>();
  readonly priceGroups = new Map<PriceGroupKind, string>();
  readonly prices: Array<{ variantId: string; priceGroupId: string; netCents: number }> = [];
  readonly supplierItems: Array<{ supplierId: string; variantId: string; ekCents: number; supplierSku: string | null }> = [];
  private seq = 0;

  constructor(seed: Array<{ articleId: string; articleName: string; sku: string; gtin: string | null }> = []) {
    for (const s of seed) {
      this.articles.set(s.articleId, { id: s.articleId, sku: s.sku, name: s.articleName, pim: {} });
      const vid = `v_${++this.seq}`;
      this.variants.set(vid, { id: vid, articleId: s.articleId, sku: s.sku, gtin: s.gtin, weightGrams: null });
    }
  }

  async variantIndex(): Promise<VariantIndexEntry[]> {
    return [...this.variants.values()].map((v) => ({
      variantId: v.id, articleId: v.articleId, sku: v.sku, gtin: v.gtin,
      articleName: this.articles.get(v.articleId)?.name ?? v.articleId,
    }));
  }

  async updateArticlePim(articleId: string, patch: ArticlePimPatch): Promise<void> {
    const a = this.articles.get(articleId);
    if (a) { if (patch.name) a.name = patch.name; a.pim = { ...a.pim, ...patch }; }
  }

  async setVariantGtinWeight(variantId: string, gtin: string | null, weightGrams: number | null): Promise<void> {
    const v = this.variants.get(variantId);
    if (v) { v.gtin = gtin ?? v.gtin; v.weightGrams = weightGrams ?? v.weightGrams; }
  }

  async upsertSupplierItem(supplierId: string, variantId: string, ekCents: number, supplierSku: string | null): Promise<void> {
    const ex = this.supplierItems.find((s) => s.supplierId === supplierId && s.variantId === variantId);
    if (ex) { ex.ekCents = ekCents; ex.supplierSku = supplierSku; }
    else this.supplierItems.push({ supplierId, variantId, ekCents, supplierSku });
  }

  async ensurePriceGroup(kind: PriceGroupKind): Promise<string> {
    const existing = this.priceGroups.get(kind);
    if (existing) return existing;
    const id = `pg_${kind}`;
    this.priceGroups.set(kind, id);
    return id;
  }

  async upsertPrice(variantId: string, priceGroupId: string, netCents: number): Promise<void> {
    const ex = this.prices.find((p) => p.variantId === variantId && p.priceGroupId === priceGroupId);
    if (ex) ex.netCents = netCents;
    else this.prices.push({ variantId, priceGroupId, netCents });
  }

  async createArticleWithVariant(input: { sku: string; name: string; gtin: string | null; weightGrams: number | null }): Promise<{ articleId: string; variantId: string }> {
    const articleId = `a_${++this.seq}`;
    const variantId = `v_${++this.seq}`;
    this.articles.set(articleId, { id: articleId, sku: input.sku, name: input.name, pim: {} });
    this.variants.set(variantId, { id: variantId, articleId, sku: input.sku, gtin: input.gtin, weightGrams: input.weightGrams });
    return { articleId, variantId };
  }
}
