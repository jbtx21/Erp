// Prisma-Implementierung der Lieferanten-Repositories (Produktionspfad, C3).
// Löst Varianten über ihre eindeutige sku auf und upsertet SupplierItem idempotent
// über (supplierId, variantId). EK-Preis, Lieferanten-SKU und Verfügbarkeit werden
// fortgeschrieben; priority/minStock bleiben unverändert (manuelle Pflege).

import { prisma } from "@texma/db";
import type {
  SupplierRepository,
  UpsertSupplierItemInput,
} from "../modules/supplier-import/supplier-import.service.js";
import type { SupplierItemListItem, SupplierListItem, SupplierQueryRepository } from "./read.js";

export class PrismaSupplierRepository
  implements SupplierRepository, SupplierQueryRepository
{
  async findVariantIdBySku(sku: string): Promise<string | null> {
    const v = await prisma.variant.findUnique({ where: { sku }, select: { id: true } });
    return v?.id ?? null;
  }

  async upsertSupplierItem(input: UpsertSupplierItemInput): Promise<"created" | "updated"> {
    const existing = await prisma.supplierItem.findUnique({
      where: { supplierId_variantId: { supplierId: input.supplierId, variantId: input.variantId } },
      select: { id: true },
    });
    await prisma.supplierItem.upsert({
      where: { supplierId_variantId: { supplierId: input.supplierId, variantId: input.variantId } },
      create: {
        supplierId: input.supplierId,
        variantId: input.variantId,
        supplierSku: input.supplierSku,
        ekCents: input.ekCents,
        availableQty: input.availableQty,
      },
      update: {
        supplierSku: input.supplierSku,
        ekCents: input.ekCents,
        availableQty: input.availableQty,
      },
    });
    return existing ? "updated" : "created";
  }

  async listItems(supplierId: string, limit: number): Promise<SupplierItemListItem[]> {
    const rows = await prisma.supplierItem.findMany({
      where: { supplierId },
      orderBy: { priority: "asc" },
      take: limit,
      select: {
        id: true,
        supplierId: true,
        variantId: true,
        supplierSku: true,
        ekCents: true,
        availableQty: true,
        priority: true,
      },
    });
    return rows;
  }

  async listSuppliers(): Promise<SupplierListItem[]> {
    return prisma.supplier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, vatId: true, iban: true, kind: true, active: true },
    });
  }

  async createSupplier(input: { name: string; vatId?: string | null; iban?: string | null; bic?: string | null }): Promise<{ id: string }> {
    return prisma.supplier.create({
      data: { name: input.name, vatId: input.vatId ?? null, iban: input.iban ?? null, bic: input.bic ?? null, kind: "MANUAL" },
      select: { id: true },
    });
  }
}
