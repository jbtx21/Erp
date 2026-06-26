// In-Memory-Implementierung der Lieferanten-Repositories — für Tests und lokale
// Durchstiche ohne DB. Bildet die Variantenauflösung per sku und das idempotente
// Upsert über (supplierId, variantId) ab (C3).

import type {
  SupplierRepository,
  UpsertSupplierItemInput,
} from "../modules/supplier-import/supplier-import.service.js";
import type { SupplierContactRow, SupplierItemListItem, SupplierListItem, SupplierOverview, SupplierQueryRepository, UpdateSupplierInput } from "./read.js";

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
  private readonly stamm = new Map<string, Partial<SupplierOverview["supplier"]>>();
  private readonly contacts: Array<SupplierContactRow & { supplierId: string }> = [];

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

  async updateSupplier(input: UpdateSupplierInput): Promise<void> {
    const s = this.suppliers.find((x) => x.id === input.id);
    if (s) {
      if (input.name !== undefined) s.name = input.name;
      if (input.vatId !== undefined) s.vatId = input.vatId;
      if (input.iban !== undefined) s.iban = input.iban;
    }
    const cur = this.stamm.get(input.id) ?? {};
    this.stamm.set(input.id, { ...cur, ...input });
  }

  async supplierOverview(supplierId: string): Promise<SupplierOverview | null> {
    const s = this.suppliers.find((x) => x.id === supplierId);
    if (!s) return null;
    const sd = this.stamm.get(supplierId) ?? {};
    return {
      supplier: {
        ...s, bic: (sd.bic as string | null) ?? null,
        street: sd.street ?? null, zip: sd.zip ?? null, city: sd.city ?? null, country: sd.country ?? "DE",
        zahlungszielTage: sd.zahlungszielTage ?? 14, skontoPercent: sd.skontoPercent ?? null, skontoDays: sd.skontoDays ?? null,
        lieferzeitTage: sd.lieferzeitTage ?? null, notiz: sd.notiz ?? null,
      },
      itemCount: this.items.filter((i) => i.supplierId === supplierId).length,
      contacts: this.contacts.filter((c) => c.supplierId === supplierId).map(({ supplierId: _s, ...c }) => c),
      purchaseOrders: [], incomingInvoices: [], purchaseVolumeCents: 0,
    };
  }

  async addSupplierContact(input: { supplierId: string; firstName: string; lastName: string; email?: string | null; phone?: string | null; role?: string | null }): Promise<{ id: string }> {
    const id = `sc_${++this.seq}`;
    this.contacts.push({ id, supplierId: input.supplierId, firstName: input.firstName, lastName: input.lastName, email: input.email ?? null, phone: input.phone ?? null, role: input.role ?? null });
    return { id };
  }

  async deleteSupplierContact(id: string): Promise<void> {
    const i = this.contacts.findIndex((c) => c.id === id);
    if (i >= 0) this.contacts.splice(i, 1);
  }

  async findVariantIdBySku(sku: string): Promise<string | null> {
    return this.skuToVariant.get(sku) ?? null;
  }

  /** Hier wachsen Artikel/Varianten durch createUnknown (Säule C). */
  private readonly articles = new Map<string, { id: string; sku: string; name: string }>();
  readonly createdVariants = new Map<string, { id: string; articleId: string; sku: string; attributes: Array<{ name: string; value: string }> }>();

  async findOrCreateArticle(sku: string, name: string): Promise<string> {
    const existing = [...this.articles.values()].find((a) => a.sku === sku);
    if (existing) return existing.id;
    const id = `art_${++this.seq}`;
    this.articles.set(id, { id, sku, name });
    return id;
  }

  async createVariantWithAttributes(articleId: string, sku: string, attributes: ReadonlyArray<{ name: string; value: string }>): Promise<string> {
    const id = `var_${++this.seq}`;
    this.createdVariants.set(id, { id, articleId, sku, attributes: attributes.map((a) => ({ ...a })) });
    // Damit ein erneuter Import dieselbe SKU als „vorhanden" auflöst (Idempotenz).
    this.skuToVariant.set(sku, id);
    return id;
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
