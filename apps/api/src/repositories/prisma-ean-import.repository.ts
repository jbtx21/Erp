// Prisma-EAN-Import-Repository (B16/B18): Variantenindex für den Abgleich + Upserts
// für PIM, EAN/Gewicht, EK/Lieferant, Preisgruppen-VK und Anlage neuer Artikel/Varianten.

import { prisma } from "@texma/db";
import type { PriceGroupKind, VariantIndexEntry } from "@texma/shared";
import type { ArticlePimPatch, EanImportRepository } from "../modules/ean-import/ean-import.service.js";

export class PrismaEanImportRepository implements EanImportRepository {
  async variantIndex(): Promise<VariantIndexEntry[]> {
    const rows = await prisma.variant.findMany({
      select: { id: true, sku: true, gtin: true, articleId: true, article: { select: { name: true } } },
    });
    return rows.map((v) => ({ variantId: v.id, articleId: v.articleId, sku: v.sku, gtin: v.gtin, articleName: v.article.name }));
  }

  async updateArticlePim(articleId: string, patch: ArticlePimPatch): Promise<void> {
    await prisma.article.update({ where: { id: articleId }, data: patch });
  }

  async setVariantGtinWeight(variantId: string, gtin: string | null, weightGrams: number | null): Promise<void> {
    await prisma.variant.update({
      where: { id: variantId },
      data: { ...(gtin !== null ? { gtin } : {}), ...(weightGrams !== null ? { weightGrams } : {}) },
    });
  }

  async upsertSupplierItem(supplierId: string, variantId: string, ekCents: number, supplierSku: string | null): Promise<void> {
    await prisma.supplierItem.upsert({
      where: { supplierId_variantId: { supplierId, variantId } },
      update: { ekCents, supplierSku },
      create: { supplierId, variantId, ekCents, supplierSku },
    });
  }

  async ensurePriceGroup(kind: PriceGroupKind, name: string): Promise<string> {
    const pg = await prisma.priceGroup.upsert({
      where: { kind },
      update: {},
      create: { kind, name },
      select: { id: true },
    });
    return pg.id;
  }

  async upsertPrice(variantId: string, priceGroupId: string, netCents: number): Promise<void> {
    await prisma.priceGroupPrice.upsert({
      where: { variantId_priceGroupId: { variantId, priceGroupId } },
      update: { netCents },
      create: { variantId, priceGroupId, netCents },
    });
  }

  async createArticleWithVariant(input: { sku: string; name: string; gtin: string | null; weightGrams: number | null }): Promise<{ articleId: string; variantId: string }> {
    // EAN-Feed liefert keine Preise/Beschreibung → Pflichtfelder als Default-Skeleton (zu vervollständigen).
    const article = await prisma.article.create({ data: { sku: input.sku, name: input.name, description: input.name, ekCents: 0, vkCents: 0 }, select: { id: true } });
    const variant = await prisma.variant.create({
      data: { articleId: article.id, sku: input.sku, gtin: input.gtin, weightGrams: input.weightGrams },
      select: { id: true },
    });
    return { articleId: article.id, variantId: variant.id };
  }
}
