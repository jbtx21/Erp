// In-Memory-Repository für den Matrixprodukt-Import (Tests/Dev). Hält Artikel, Varianten
// (mit Farbe/Größe-Attributen) und SupplierItems; die Varianten-SKU folgt skuCode (wie der
// Matrix-Editor ohne Achswert-Stamm), damit Idempotenz/EK-Auflösung deterministisch sind.

import { ATTR_FARBE, ATTR_GROESSE, skuCode } from "@texma/shared";
import type { MatrixImportRepository } from "../modules/matrix-import/matrix-import.service.js";

interface MemVariant { id: string; articleId: string; sku: string; farbe: string; groesse: string }

export class InMemoryMatrixImportRepository implements MatrixImportRepository {
  private readonly articles = new Map<string, { id: string; sku: string; name: string }>();
  private readonly variants = new Map<string, MemVariant>();
  private readonly supplierItems = new Map<string, { supplierId: string; variantId: string; ekCents: number; supplierSku: string | null }>();
  readonly suppliers = new Set<string>();
  private seq = 0;

  addSupplier(id: string): void { this.suppliers.add(id); }
  /** Bestehenden Artikel + Variante vorbelegen (für „vorhanden"-Tests). */
  seedArticle(sku: string, name: string): string {
    const id = `art_${++this.seq}`;
    this.articles.set(id, { id, sku, name });
    return id;
  }
  seedVariant(articleId: string, farbe: string, groesse: string): string {
    const a = this.articles.get(articleId)!;
    const id = `var_${++this.seq}`;
    this.variants.set(id, { id, articleId, sku: `${a.sku}-${skuCode(farbe)}-${skuCode(groesse)}`, farbe, groesse });
    return id;
  }
  supplierItemsFor(supplierId: string): Array<{ variantId: string; ekCents: number; supplierSku: string | null }> {
    return [...this.supplierItems.values()].filter((s) => s.supplierId === supplierId);
  }

  async listArticleSkus(): Promise<string[]> { return [...this.articles.values()].map((a) => a.sku); }
  async listVariantCombos(): Promise<string[]> {
    return [...this.variants.values()].map((v) => {
      const a = this.articles.get(v.articleId)!;
      return `${a.sku}|${v.farbe}|${v.groesse}`;
    });
  }
  async findArticleBySku(sku: string): Promise<{ id: string } | null> {
    const a = [...this.articles.values()].find((x) => x.sku.toLowerCase() === sku.toLowerCase());
    return a ? { id: a.id } : null;
  }
  async createArticle(sku: string, name: string): Promise<{ id: string }> {
    const id = `art_${++this.seq}`;
    this.articles.set(id, { id, sku, name });
    return { id };
  }
  async generateMatrixVariants(articleId: string, combos: ReadonlyArray<{ farbe: string; groesse: string }>): Promise<{ created: number; skipped: number; createdSkus: string[] }> {
    const a = this.articles.get(articleId);
    if (!a) throw new Error("Artikel nicht gefunden.");
    const seen = new Set([...this.variants.values()].filter((v) => v.articleId === articleId).map((v) => `${v.farbe.toLowerCase()}|${v.groesse.toLowerCase()}`));
    const createdSkus: string[] = [];
    let skipped = 0;
    for (const c of combos) {
      const k = `${c.farbe.toLowerCase()}|${c.groesse.toLowerCase()}`;
      if (seen.has(k)) { skipped++; continue; }
      seen.add(k);
      const id = `var_${++this.seq}`;
      const sku = `${a.sku}-${skuCode(c.farbe)}-${skuCode(c.groesse)}`;
      this.variants.set(id, { id, articleId, sku, farbe: c.farbe, groesse: c.groesse });
      createdSkus.push(sku);
    }
    return { created: createdSkus.length, skipped, createdSkus };
  }
  async findVariantIdByCombo(articleId: string, farbe: string, groesse: string): Promise<string | null> {
    const v = [...this.variants.values()].find((x) => x.articleId === articleId && x.farbe.toLowerCase() === farbe.toLowerCase() && x.groesse.toLowerCase() === groesse.toLowerCase());
    return v ? v.id : null;
  }
  async upsertSupplierItem(supplierId: string, variantId: string, ekCents: number, supplierSku: string | null): Promise<void> {
    this.supplierItems.set(`${supplierId}|${variantId}`, { supplierId, variantId, ekCents, supplierSku });
  }
  async supplierExists(id: string): Promise<boolean> { return this.suppliers.has(id); }
}
