// In-Memory-Implementierung der Lieferanten-Repositories — für Tests und lokale
// Durchstiche ohne DB. Bildet die Variantenauflösung per sku und das idempotente
// Upsert über (supplierId, variantId) ab (C3).

import type {
  SupplierRepository,
  UpsertSupplierItemInput,
} from "../modules/supplier-import/supplier-import.service.js";
import type { SupplierItemListItem, SupplierListItem, SupplierQueryRepository } from "./read.js";

interface StoredItem extends UpsertSupplierItemInput {
  id: string;
  priority: number;
}

export class InMemorySupplierRepository
  implements SupplierRepository, SupplierQueryRepository
{
  private readonly items: StoredItem[] = [];
  private seq = 0;

  private readonly suppliers: SupplierListItem[] = [];

  /** skuToVariant = vorhandene Varianten (Stammdaten). Wächst durch Import NICHT. */
  constructor(private readonly skuToVariant: Map<string, string>) {}

  async listSuppliers(): Promise<SupplierListItem[]> {
    return this.suppliers.map((s) => ({ ...s })).sort((a, b) => a.name.localeCompare(b.name));
  }

  async createSupplier(input: { name: string; vatId?: string | null; iban?: string | null; bic?: string | null }): Promise<{ id: string }> {
    const id = `sup_${++this.seq}`;
    this.suppliers.push({ id, name: input.name, vatId: input.vatId ?? null, iban: input.iban ?? null, kind: "MANUAL", active: true });
    return { id };
  }

  async findVariantIdBySku(sku: string): Promise<string | null> {
    return this.skuToVariant.get(sku) ?? null;
  }

  async upsertSupplierItem(input: UpsertSupplierItemInput): Promise<"created" | "updated"> {
    const existing = this.items.find(
      (i) => i.supplierId === input.supplierId && i.variantId === input.variantId
    );
    if (existing) {
      existing.supplierSku = input.supplierSku;
      existing.ekCents = input.ekCents;
      existing.availableQty = input.availableQty;
      return "updated";
    }
    this.items.push({ id: `si_${++this.seq}`, priority: 1, ...input });
    return "created";
  }

  async listItems(supplierId: string, limit: number): Promise<SupplierItemListItem[]> {
    return this.items
      .filter((i) => i.supplierId === supplierId)
      .slice(0, limit)
      .map((i) => ({
        id: i.id,
        supplierId: i.supplierId,
        variantId: i.variantId,
        supplierSku: i.supplierSku,
        ekCents: i.ekCents,
        availableQty: i.availableQty,
        priority: i.priority,
      }));
  }
}
