// Prisma-Implementierung der Artikel/Varianten-Stammdaten (B16).

import { prisma } from "@texma/db";
import type {
  ArticlePatch,
  ArticleRow,
  CreateVariantInput,
  ProductRepository,
  VariantRow,
} from "../modules/product/product.service.js";

const PIM_SELECT = { description: true, brand: true, materialComposition: true, careInstructions: true, hsCode: true, originCountry: true } as const;
const s = (v: string | null | undefined): string => v ?? "";

export class PrismaProductRepository implements ProductRepository {
  async listArticles(): Promise<Omit<ArticleRow, "completeness">[]> {
    const rows = await prisma.article.findMany({
      orderBy: { sku: "asc" },
      select: { id: true, sku: true, name: true, ...PIM_SELECT, _count: { select: { variants: true } } },
    });
    return rows.map((a) => ({
      id: a.id, sku: a.sku, name: a.name, variantCount: a._count.variants,
      description: s(a.description), brand: s(a.brand), materialComposition: s(a.materialComposition),
      careInstructions: s(a.careInstructions), hsCode: s(a.hsCode), originCountry: s(a.originCountry),
    }));
  }

  async createArticle(sku: string, name: string): Promise<{ id: string }> {
    return prisma.article.create({ data: { sku, name }, select: { id: true } });
  }

  async updateArticle(id: string, patch: ArticlePatch): Promise<boolean> {
    const res = await prisma.article.updateMany({ where: { id }, data: patch });
    return res.count > 0;
  }

  async updateArticlesBySku(skus: string[], patch: ArticlePatch): Promise<number> {
    const res = await prisma.article.updateMany({ where: { sku: { in: skus } }, data: patch });
    return res.count;
  }

  async listVariants(articleId: string): Promise<VariantRow[]> {
    const rows = await prisma.variant.findMany({
      where: { articleId },
      orderBy: { sku: "asc" },
      select: { id: true, sku: true, attributes: { select: { name: true, value: true } } },
    });
    return rows.map((v) => ({ id: v.id, sku: v.sku, attributes: v.attributes }));
  }

  async catalog(): Promise<import("../modules/product/product.service.js").CatalogEntry[]> {
    const rows = await prisma.variant.findMany({
      orderBy: [{ article: { sku: "asc" } }, { sku: "asc" }],
      select: {
        id: true, sku: true, articleId: true,
        article: { select: { name: true } },
        attributes: { select: { name: true, value: true } },
        prices: { where: { priceGroup: { kind: "STANDARD" } }, select: { netCents: true }, take: 1 },
      },
    });
    return rows.map((v) => {
      const attrs = v.attributes.map((a) => a.value).join(" / ");
      const label = `${v.article.name}${attrs ? ` — ${attrs}` : ""} (${v.sku})`;
      return { variantId: v.id, articleId: v.articleId, articleName: v.article.name, sku: v.sku, label, unitNetCents: v.prices[0]?.netCents ?? 0 };
    });
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
