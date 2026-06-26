// Prisma-Implementierung der Artikel/Varianten-Stammdaten (B16).

import { prisma } from "@texma/db";
import { ATTR_FARBE, ATTR_GROESSE, skuCode } from "@texma/shared";
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

const PIM_SELECT = {
  description: true, brand: true, materialComposition: true, careInstructions: true, hsCode: true, originCountry: true,
  itemGroup: true, stockUom: true, isSalesItem: true, isPurchaseItem: true, minOrderQty: true, maxDiscountPct: true,
  leadTimeDays: true, gender: true, gm2: true, styleFit: true, bestandsgefuehrt: true,
} as const;
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
      itemGroup: s(a.itemGroup), stockUom: a.stockUom, isSalesItem: a.isSalesItem, isPurchaseItem: a.isPurchaseItem,
      minOrderQty: a.minOrderQty, maxDiscountPct: a.maxDiscountPct, leadTimeDays: a.leadTimeDays,
      gender: s(a.gender), gm2: a.gm2, styleFit: s(a.styleFit), bestandsgefuehrt: a.bestandsgefuehrt,
    }));
  }

  async createArticle(sku: string, name: string, description?: string | null): Promise<{ id: string }> {
    return prisma.article.create({ data: { sku, name, description: description ?? null }, select: { id: true } });
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
      select: { id: true, sku: true, bestandsgefuehrtOverride: true, attributes: { select: { name: true, value: true } } },
    });
    return rows.map((v) => ({ id: v.id, sku: v.sku, bestandsgefuehrtOverride: v.bestandsgefuehrtOverride, attributes: v.attributes }));
  }

  async setVariantStockManaged(variantId: string, value: boolean | null): Promise<boolean> {
    const res = await prisma.variant.updateMany({ where: { id: variantId }, data: { bestandsgefuehrtOverride: value } });
    return res.count > 0;
  }

  async catalog(): Promise<import("../modules/product/product.service.js").CatalogEntry[]> {
    const rows = await prisma.variant.findMany({
      // Nur echte Lagerartikel im Auftrags-/Angebots-Picker — Veredelung/Logo (FINISHING)
      // und Dienstleistungen werden über eigene Pfade geführt, nicht als Katalogartikel.
      where: { article: { type: "STOCK" } },
      orderBy: [{ article: { sku: "asc" } }, { sku: "asc" }],
      select: {
        id: true, sku: true, articleId: true, isBundle: true,
        article: { select: { name: true, description: true } },
        attributes: { select: { name: true, value: true } },
        prices: { where: { priceGroup: { kind: "STANDARD" } }, select: { netCents: true }, take: 1 },
      },
    });
    return rows.map((v) => {
      const attrs = v.attributes.map((a) => a.value).join(" / ");
      const label = `${v.article.name}${attrs ? ` — ${attrs}` : ""} (${v.sku})`;
      return { variantId: v.id, articleId: v.articleId, articleName: v.article.name, sku: v.sku, description: v.article.description ?? "", label, unitNetCents: v.prices[0]?.netCents ?? 0, isBundle: v.isBundle };
    });
  }

  async searchCatalog(query: string, limit: number): Promise<CatalogEntry[]> {
    // Treffer über Varianten-SKU, Artikelname/-SKU/-Beschreibung (case-insensitive); nur
    // echte Lagerartikel (STOCK), wie catalog(). Begrenzt auf `limit` für skalierbare Picker.
    const where = {
      article: { type: "STOCK" as const },
      ...(query
        ? {
            OR: [
              { sku: { contains: query, mode: "insensitive" as const } },
              { article: { is: { name: { contains: query, mode: "insensitive" as const } } } },
              { article: { is: { sku: { contains: query, mode: "insensitive" as const } } } },
              { article: { is: { description: { contains: query, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    };
    const rows = await prisma.variant.findMany({
      where,
      orderBy: [{ article: { sku: "asc" } }, { sku: "asc" }],
      take: limit,
      select: {
        id: true, sku: true, articleId: true, isBundle: true,
        article: { select: { name: true, description: true } },
        attributes: { select: { name: true, value: true } },
        prices: { where: { priceGroup: { kind: "STANDARD" } }, select: { netCents: true }, take: 1 },
      },
    });
    return rows.map((v) => {
      const attrs = v.attributes.map((a) => a.value).join(" / ");
      const label = `${v.article.name}${attrs ? ` — ${attrs}` : ""} (${v.sku})`;
      return { variantId: v.id, articleId: v.articleId, articleName: v.article.name, sku: v.sku, description: v.article.description ?? "", label, unitNetCents: v.prices[0]?.netCents ?? 0, isBundle: v.isBundle };
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

  async generateMatrixVariants(
    articleId: string,
    combos: ReadonlyArray<{ farbe: string; groesse: string }>
  ): Promise<{ created: number; skipped: number; createdSkus: string[] }> {
    const article = await prisma.article.findUnique({ where: { id: articleId }, select: { sku: true } });
    if (!article) throw new Error("Artikel nicht gefunden.");
    // Vorhandene Farbe×Größe-Kombinationen des Artikels (Idempotenz).
    const existing = await prisma.variant.findMany({
      where: { articleId },
      select: { attributes: { select: { name: true, value: true } } },
    });
    const comboKey = (farbe: string, groesse: string) => `${farbe}|${groesse}`;
    const seen = new Set(
      existing.map((v) => {
        const f = v.attributes.find((a) => a.name === ATTR_FARBE)?.value ?? "";
        const g = v.attributes.find((a) => a.name === ATTR_GROESSE)?.value ?? "";
        return comboKey(f, g);
      })
    );
    // SKU-Anhang je Achswert aus der Grundtabelle; Fallback: aus dem Wert abgeleitet.
    const axisVals = await prisma.axisValue.findMany({ select: { axis: true, value: true, skuSuffix: true } });
    const suffix = (axis: "FARBE" | "GROESSE", value: string): string => {
      const m = axisVals.find((a) => a.axis === axis && a.value === value);
      return (m?.skuSuffix?.trim() || skuCode(value));
    };

    const toCreate = combos.filter((c) => !seen.has(comboKey(c.farbe, c.groesse)));
    const createdSkus: string[] = [];
    await prisma.$transaction(async (tx) => {
      for (const c of toCreate) {
        const sku = `${article.sku}-${suffix("FARBE", c.farbe)}-${suffix("GROESSE", c.groesse)}`;
        await tx.variant.create({
          data: {
            articleId, sku,
            attributes: { create: [{ name: ATTR_FARBE, value: c.farbe }, { name: ATTR_GROESSE, value: c.groesse }] },
          },
        });
        createdSkus.push(sku);
      }
    });
    return { created: createdSkus.length, skipped: combos.length - toCreate.length, createdSkus };
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
          sku: input.sku, name: input.name, type: "FINISHING", isVeredelung: true, veredlerId: input.veredlerId,
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
      return { variantId, articleId: article.id, articleName: article.name, sku: input.sku, description: "", label: `${article.name} (${input.sku})`, unitNetCents: baseVk, isBundle: false };
    });
  }
}
