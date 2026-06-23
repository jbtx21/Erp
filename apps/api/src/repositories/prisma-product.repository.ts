// Prisma-Implementierung der Artikel/Varianten-Stammdaten (B16).

import { prisma } from "@texma/db";
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

/** Anzeigetext einer Variante (Artikelname — Merkmale (SKU)) für Komponentenlisten. */
function variantLabel(v: { sku: string; article: { name: string }; attributes: { value: string }[] }): string {
  const attrs = v.attributes.map((a) => a.value).join(" / ");
  return `${v.article.name}${attrs ? ` — ${attrs}` : ""} (${v.sku})`;
}

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
        id: true, sku: true, articleId: true, isBundle: true,
        article: { select: { name: true } },
        attributes: { select: { name: true, value: true } },
        prices: { where: { priceGroup: { kind: "STANDARD" } }, select: { netCents: true }, take: 1 },
      },
    });
    return rows.map((v) => {
      const attrs = v.attributes.map((a) => a.value).join(" / ");
      const label = `${v.article.name}${attrs ? ` — ${attrs}` : ""} (${v.sku})`;
      return { variantId: v.id, articleId: v.articleId, articleName: v.article.name, sku: v.sku, label, unitNetCents: v.prices[0]?.netCents ?? 0, isBundle: v.isBundle };
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

  async listComponents(variantId: string): Promise<ComponentRow[]> {
    const rows = await prisma.variantComponent.findMany({
      where: { parentVariantId: variantId },
      orderBy: { position: "asc" },
      select: {
        description: true, qty: true, componentVariantId: true,
        component: { select: { sku: true, article: { select: { name: true } }, attributes: { select: { value: true } } } },
      },
    });
    return rows.map((c) => ({
      description: c.description, qty: c.qty, componentVariantId: c.componentVariantId,
      componentLabel: c.component ? variantLabel(c.component) : null,
    }));
  }

  async setComponents(variantId: string, components: ComponentInput[]): Promise<void> {
    await prisma.$transaction([
      prisma.variantComponent.deleteMany({ where: { parentVariantId: variantId } }),
      prisma.variantComponent.createMany({
        data: components.map((c, i) => ({ parentVariantId: variantId, description: c.description, qty: c.qty, componentVariantId: c.componentVariantId ?? null, position: i + 1 })),
      }),
      prisma.variant.update({ where: { id: variantId }, data: { isBundle: components.length > 0 } }),
    ]);
  }

  async supplierExists(id: string): Promise<boolean> {
    return (await prisma.supplier.count({ where: { id } })) > 0;
  }

  async createVeredelungArticle(input: { name: string; sku: string; method: "STICK" | "DRUCK" | "TRANSFER"; placement: string | null; veredlerId: string; ekCents: number | null; tiers: VeredelungTier[] }): Promise<CatalogEntry> {
    // VK-Staffel des Logos liegt unter der Basis-Preisgruppe STANDARD (Preisgruppe ≠ Mengenstaffel).
    const standard = input.tiers.length > 0 ? await prisma.priceGroup.findFirst({ where: { kind: "STANDARD" }, select: { id: true } }) : null;
    if (input.tiers.length > 0 && !standard) throw new Error("Keine Preisgruppe STANDARD vorhanden — Staffel kann nicht angelegt werden.");

    return prisma.$transaction(async (tx) => {
      const article = await tx.article.create({
        data: {
          sku: input.sku, name: input.name, isVeredelung: true, veredlerId: input.veredlerId,
          finishingSpecs: { create: { method: input.method as never, placement: input.placement ?? "" } },
          variants: { create: { sku: input.sku } },
        },
        select: { id: true, name: true, variants: { select: { id: true } } },
      });
      const variantId = article.variants[0]!.id;
      if (input.ekCents !== null) {
        await tx.supplierItem.create({ data: { supplierId: input.veredlerId, variantId, ekCents: input.ekCents, priority: 1 } });
      }
      if (standard && input.tiers.length > 0) {
        await tx.priceGroupPriceTier.createMany({
          data: input.tiers.map((t) => ({ variantId, priceGroupId: standard.id, minMenge: t.minMenge, netCents: t.vkCents })),
        });
      }
      const baseVk = input.tiers[0]?.vkCents ?? 0;
      return { variantId, articleId: article.id, articleName: article.name, sku: input.sku, label: `${article.name} (${input.sku})`, unitNetCents: baseVk, isBundle: false };
    });
  }
}
