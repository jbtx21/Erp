// Prisma-Implementierung der Lieferanten-Repositories (Produktionspfad, C3).
// Löst Varianten über ihre eindeutige sku auf und upsertet SupplierItem idempotent
// über (supplierId, variantId). EK-Preis, Lieferanten-SKU und Verfügbarkeit werden
// fortgeschrieben; priority/minStock bleiben unverändert (manuelle Pflege).

import { prisma } from "@texma/db";
import { buildEntry, type AuditSink } from "@texma/audit";
import type {
  SupplierRepository,
  UpsertSupplierItemInput,
} from "../modules/supplier-import/supplier-import.service.js";
import type { SupplierCatalogItem, SupplierItemListItem, SupplierListItem, SupplierOverview, SupplierQueryRepository, UpdateSupplierInput } from "./read.js";

export class PrismaSupplierRepository
  implements SupplierRepository, SupplierQueryRepository
{
  // GoBD-Audit der Stammdaten-Mutationen (optional injiziert; in Tests weglassbar).
  constructor(private readonly audit?: AuditSink) {}

  async findVariantIdBySku(sku: string): Promise<string | null> {
    const v = await prisma.variant.findUnique({ where: { sku }, select: { id: true } });
    return v?.id ?? null;
  }

  async findOrCreateArticle(sku: string, name: string): Promise<string> {
    const existing = await prisma.article.findUnique({ where: { sku }, select: { id: true } });
    if (existing) return existing.id;
    const created = await prisma.article.create({ data: { sku, name, description: name, ekCents: 0, vkCents: 0 }, select: { id: true } });
    return created.id;
  }

  async createVariantWithAttributes(articleId: string, sku: string, attributes: ReadonlyArray<{ name: string; value: string }>): Promise<string> {
    const v = await prisma.variant.create({
      data: { articleId, sku, attributes: { create: attributes.map((a) => ({ name: a.name, value: a.value })) } },
      select: { id: true },
    });
    return v.id;
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

  async catalogAll(supplierId: string): Promise<SupplierCatalogItem[]> {
    const rows = await prisma.supplierItem.findMany({
      where: { supplierId },
      orderBy: [{ priority: "asc" }, { id: "asc" }],
      select: {
        id: true, supplierSku: true, ekCents: true, availableQty: true,
        variant: { select: { sku: true, article: { select: { name: true } }, attributes: { select: { name: true, value: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      sku: r.variant.sku,
      articleName: r.variant.article.name,
      farbe: r.variant.attributes.find((a) => a.name === "Farbe")?.value ?? null,
      groesse: r.variant.attributes.find((a) => a.name === "Größe")?.value ?? null,
      supplierSku: r.supplierSku,
      ekCents: r.ekCents,
      availableQty: r.availableQty,
    }));
  }

  async listSuppliers(): Promise<SupplierListItem[]> {
    return prisma.supplier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, vatId: true, iban: true, kind: true, active: true },
    });
  }

  async createSupplier(input: { name: string; email?: string | null; vatId?: string | null; iban?: string | null; bic?: string | null }): Promise<{ id: string }> {
    const created = await prisma.supplier.create({
      data: { name: input.name, email: input.email ?? null, vatId: input.vatId ?? null, iban: input.iban ?? null, bic: input.bic ?? null, kind: "MANUAL" },
      select: { id: true },
    });
    await this.audit?.append(buildEntry({ entity: "Supplier", entityId: created.id, action: "CREATE", after: input }));
    return created;
  }

  /** Veredler-E-Mail einer Fremdvergabe-Stufe (für den Veredelungsauftrag-Versand). */
  async emailForSubProduction(subProductionId: string): Promise<string | null> {
    const s = await prisma.subProductionOrder.findUnique({
      where: { id: subProductionId },
      select: { supplier: { select: { email: true } } },
    });
    return s?.supplier?.email ?? null;
  }

  async updateSupplier(input: UpdateSupplierInput): Promise<void> {
    const pick = (k: keyof UpdateSupplierInput): object => (input[k] !== undefined ? { [k]: input[k] } : {});
    await prisma.supplier.update({
      where: { id: input.id },
      data: {
        ...pick("name"), ...pick("email"), ...pick("vatId"), ...pick("iban"), ...pick("bic"),
        ...pick("street"), ...pick("zip"), ...pick("city"), ...pick("country"),
        ...pick("zahlungszielTage"), ...pick("skontoPercent"), ...pick("skontoDays"), ...pick("lieferzeitTage"), ...pick("notiz"),
      },
    });
    await this.audit?.append(buildEntry({ entity: "Supplier", entityId: input.id, action: "UPDATE", after: input }));
  }

  async supplierOverview(supplierId: string): Promise<SupplierOverview | null> {
    const s = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: {
        id: true, name: true, email: true, vatId: true, iban: true, bic: true, kind: true, active: true,
        street: true, zip: true, city: true, country: true,
        zahlungszielTage: true, skontoPercent: true, skontoDays: true, lieferzeitTage: true, notiz: true,
        _count: { select: { supplierItems: true } },
        contacts: { orderBy: { createdAt: "asc" }, select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true } },
        purchaseOrders: { orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, status: true, createdAt: true } },
        incomingInvoices: { orderBy: { receivedAt: "desc" }, take: 50, select: { id: true, number: true, grossCents: true, status: true, receivedAt: true } },
      },
    });
    if (!s) return null;
    return {
      supplier: {
        id: s.id, name: s.name, email: s.email, vatId: s.vatId, iban: s.iban, bic: s.bic, kind: s.kind, active: s.active,
        street: s.street, zip: s.zip, city: s.city, country: s.country,
        zahlungszielTage: s.zahlungszielTage, skontoPercent: s.skontoPercent, skontoDays: s.skontoDays, lieferzeitTage: s.lieferzeitTage, notiz: s.notiz,
      },
      itemCount: s._count.supplierItems,
      contacts: s.contacts,
      purchaseOrders: s.purchaseOrders,
      incomingInvoices: s.incomingInvoices,
      purchaseVolumeCents: s.incomingInvoices.reduce((sum, i) => sum + i.grossCents, 0),
    };
  }

  async addSupplierContact(input: { supplierId: string; firstName: string; lastName: string; email?: string | null; phone?: string | null; role?: string | null }): Promise<{ id: string }> {
    const created = await prisma.supplierContact.create({
      data: { supplierId: input.supplierId, firstName: input.firstName, lastName: input.lastName, email: input.email ?? null, phone: input.phone ?? null, role: input.role ?? null },
      select: { id: true },
    });
    await this.audit?.append(buildEntry({ entity: "SupplierContact", entityId: created.id, action: "CREATE", after: input }));
    return created;
  }

  async updateSupplierContact(id: string, fields: { firstName?: string; lastName?: string; email?: string | null; phone?: string | null; role?: string | null }): Promise<void> {
    const pick = <K extends keyof typeof fields>(k: K): object => (fields[k] !== undefined ? { [k]: fields[k] } : {});
    await prisma.supplierContact.update({ where: { id }, data: { ...pick("firstName"), ...pick("lastName"), ...pick("email"), ...pick("phone"), ...pick("role") } });
    await this.audit?.append(buildEntry({ entity: "SupplierContact", entityId: id, action: "UPDATE", after: fields }));
  }

  async deleteSupplierContact(id: string): Promise<void> {
    await prisma.supplierContact.delete({ where: { id } });
    await this.audit?.append(buildEntry({ entity: "SupplierContact", entityId: id, action: "STORNO" }));
  }
}
