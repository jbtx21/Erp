// Prisma-Implementierung des Matrixprodukt-Imports. Die Varianten-Erzeugung delegiert an
// PrismaProductRepository.generateMatrixVariants — exakt dieselbe SKU-/Idempotenz-Logik wie
// der Matrix-Editor am Artikel (inkl. Achswert-Suffix aus dem Stamm).

import { prisma } from "@texma/db";
import { ATTR_FARBE, ATTR_GROESSE } from "@texma/shared";
import type { MatrixImportRepository } from "../modules/matrix-import/matrix-import.service.js";
import { PrismaProductRepository } from "./prisma-product.repository.js";

export class PrismaMatrixImportRepository implements MatrixImportRepository {
  private readonly products = new PrismaProductRepository();

  async listArticleSkus(): Promise<string[]> {
    const rows = await prisma.article.findMany({ select: { sku: true } });
    return rows.map((r) => r.sku);
  }

  async listVariantCombos(): Promise<string[]> {
    const rows = await prisma.variant.findMany({
      select: { article: { select: { sku: true } }, attributes: { select: { name: true, value: true } } },
    });
    return rows.map((v) => {
      const f = v.attributes.find((a) => a.name === ATTR_FARBE)?.value ?? "";
      const g = v.attributes.find((a) => a.name === ATTR_GROESSE)?.value ?? "";
      return `${v.article.sku}|${f}|${g}`;
    });
  }

  async findArticleBySku(sku: string): Promise<{ id: string } | null> {
    return prisma.article.findFirst({ where: { sku: { equals: sku, mode: "insensitive" } }, select: { id: true } });
  }

  async createArticle(sku: string, name: string): Promise<{ id: string }> {
    // Matrix-Import legt das Artikel-Skelett an; EK je Variante folgt, Basis-Preise als Default (zu vervollständigen).
    return prisma.article.create({ data: { sku, name, description: name, ekCents: 0, vkCents: 0 }, select: { id: true } });
  }

  generateMatrixVariants(articleId: string, combos: ReadonlyArray<{ farbe: string; groesse: string }>): Promise<{ created: number; skipped: number; createdSkus: string[] }> {
    return this.products.generateMatrixVariants(articleId, combos);
  }

  async findVariantIdByCombo(articleId: string, farbe: string, groesse: string): Promise<string | null> {
    const v = await prisma.variant.findFirst({
      where: {
        articleId,
        AND: [
          { attributes: { some: { name: ATTR_FARBE, value: { equals: farbe, mode: "insensitive" } } } },
          { attributes: { some: { name: ATTR_GROESSE, value: { equals: groesse, mode: "insensitive" } } } },
        ],
      },
      select: { id: true },
    });
    return v?.id ?? null;
  }

  async upsertSupplierItem(supplierId: string, variantId: string, ekCents: number, supplierSku: string | null): Promise<void> {
    await prisma.supplierItem.upsert({
      where: { supplierId_variantId: { supplierId, variantId } },
      update: { ekCents, supplierSku },
      create: { supplierId, variantId, ekCents, supplierSku },
    });
  }

  async supplierExists(id: string): Promise<boolean> {
    return (await prisma.supplier.count({ where: { id } })) > 0;
  }
}
