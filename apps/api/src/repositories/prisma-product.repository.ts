// Prisma-Implementierung der Artikel/Varianten-Stammdaten (B16).

import { prisma } from "@texma/db";
import type {
  ArticleRow,
  CreateVariantInput,
  ProductRepository,
  VariantRow,
} from "../modules/product/product.service.js";

export class PrismaProductRepository implements ProductRepository {
  async listArticles(): Promise<ArticleRow[]> {
    const rows = await prisma.article.findMany({
      orderBy: { sku: "asc" },
      select: { id: true, sku: true, name: true, _count: { select: { variants: true } } },
    });
    return rows.map((a) => ({ id: a.id, sku: a.sku, name: a.name, variantCount: a._count.variants }));
  }

  async createArticle(sku: string, name: string): Promise<{ id: string }> {
    return prisma.article.create({ data: { sku, name }, select: { id: true } });
  }

  async listVariants(articleId: string): Promise<VariantRow[]> {
    const rows = await prisma.variant.findMany({
      where: { articleId },
      orderBy: { sku: "asc" },
      select: { id: true, sku: true, attributes: { select: { name: true, value: true } } },
    });
    return rows.map((v) => ({ id: v.id, sku: v.sku, attributes: v.attributes }));
  }

  async createVariant(input: CreateVariantInput): Promise<{ id: string }> {
    return prisma.variant.create({
      data: {
        articleId: input.articleId,
        sku: input.sku,
        attributes: { create: input.attributes.map((a) => ({ name: a.name, value: a.value })) },
      },
      select: { id: true },
    });
  }
}
