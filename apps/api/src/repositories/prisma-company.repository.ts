// Prisma-Implementierung der Firmen-Stammdaten (B3). Anlage löst die Preisgruppe
// über den Kind auf (legt sie bei Bedarf an), damit jede Preisgruppe wählbar ist.

import { prisma } from "@texma/db";
import type { PriceGroupKind } from "@texma/shared";
import type {
  CompanyRepository,
  CompanyRow,
  CreateCompanyInput,
  UpdateCompanyInput,
} from "../modules/company/company.service.js";

export class PrismaCompanyRepository implements CompanyRepository {
  async list(): Promise<CompanyRow[]> {
    const rows = await prisma.company.findMany({
      orderBy: { customerNumber: "asc" },
      select: { id: true, customerNumber: true, name: true, branche: true, zahlungszielTage: true, mahnsperre: true, gesperrtAm: true, priceGroup: { select: { kind: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      customerNumber: c.customerNumber,
      name: c.name,
      branche: c.branche,
      zahlungszielTage: c.zahlungszielTage,
      mahnsperre: c.mahnsperre,
      priceGroupKind: c.priceGroup.kind as PriceGroupKind,
      gesperrt: c.gesperrtAm !== null,
    }));
  }

  async create(input: CreateCompanyInput & { customerNumber: string }): Promise<{ id: string }> {
    const pg = await prisma.priceGroup.upsert({
      where: { kind: input.priceGroupKind },
      update: {},
      create: { kind: input.priceGroupKind, name: input.priceGroupKind },
      select: { id: true },
    });
    return prisma.company.create({
      data: {
        customerNumber: input.customerNumber,
        name: input.name,
        branche: input.branche ?? null,
        zahlungszielTage: input.zahlungszielTage ?? 14,
        priceGroupId: pg.id,
      },
      select: { id: true },
    });
  }

  async findByName(name: string): Promise<{ id: string } | null> {
    return prisma.company.findFirst({ where: { name: { equals: name.trim(), mode: "insensitive" } }, select: { id: true } });
  }

  async countDocuments(companyId: string): Promise<number> {
    // Operative Belege/Vorgänge, die eine Firma „in Benutzung" machen (Löschschutz, GoBD).
    const c = await prisma.company.findUnique({
      where: { id: companyId },
      select: { _count: { select: { orders: true, quotes: true, invoices: true, abschlaege: true, collectiveOrders: true, sampleLoans: true, opportunities: true, inquiries: true } } },
    });
    if (!c) return 0;
    const n = c._count;
    return n.orders + n.quotes + n.invoices + n.abschlaege + n.collectiveOrders + n.sampleLoans + n.opportunities + n.inquiries;
  }

  async deleteEmpty(companyId: string): Promise<void> {
    // Weiche Verweise lösen, dann löschen — in einer Transaktion. Nur für unbenutzte
    // Firmen (Beleg-Check liegt im Service). CrmLeads werden entkoppelt (companyId → null).
    await prisma.$transaction(async (tx) => {
      await tx.crmLead.updateMany({ where: { companyId }, data: { companyId: null } });
      await tx.contact.deleteMany({ where: { companyId } });
      await tx.deliveryAddress.deleteMany({ where: { companyId } });
      await tx.customerPriceTier.deleteMany({ where: { companyId } });
      await tx.company.delete({ where: { id: companyId } });
    });
  }

  async update(input: UpdateCompanyInput): Promise<void> {
    const pick = (k: keyof UpdateCompanyInput): object => (input[k] !== undefined ? { [k]: input[k] } : {});
    await prisma.company.update({
      where: { id: input.id },
      data: {
        ...pick("name"), ...pick("branche"), ...pick("zahlungszielTage"), ...pick("mahnsperre"),
        ...pick("street"), ...pick("zip"), ...pick("city"), ...pick("country"),
        ...pick("vatId"), ...pick("taxNumber"), ...pick("taxRule"),
        ...pick("iban"), ...pick("bic"), ...pick("bankName"), ...pick("sepaMandateRef"), ...pick("sepaMandateDate"),
        ...pick("skontoPercent"), ...pick("skontoDays"), ...pick("paymentMethod"),
        ...pick("lieferbedingung"), ...pick("notiz"), ...pick("kreditlimitCents"),
      },
    });
  }

  async overview(companyId: string): Promise<import("../modules/company/company.service.js").CompanyOverview | null> {
    const c = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true, customerNumber: true, name: true, branche: true, zahlungszielTage: true, mahnsperre: true, gesperrtAm: true,
        street: true, zip: true, city: true, country: true, vatId: true, taxNumber: true, taxRule: true,
        iban: true, bic: true, bankName: true, sepaMandateRef: true, sepaMandateDate: true,
        skontoPercent: true, skontoDays: true, paymentMethod: true, lieferbedingung: true, notiz: true, kreditlimitCents: true,
        priceGroup: { select: { kind: true } },
        lead: { select: { id: true } },
        _count: { select: { contacts: true } },
        orders: { orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, status: true, createdAt: true } },
        quotes: { orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, status: true, createdAt: true } },
        invoices: { orderBy: { issuedAt: "desc" }, take: 50, select: { id: true, number: true, grossCents: true, issuedAt: true, openItem: { select: { openCents: true } } } },
        sampleLoans: { orderBy: { ausgegebenAm: "desc" }, take: 50, select: { id: true, status: true, ausgegebenAm: true } },
      },
    });
    if (!c) return null;
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const [revAll, revYtd, orderCount] = await Promise.all([
      prisma.invoice.aggregate({ where: { companyId, finalized: true }, _sum: { grossCents: true, netCents: true }, _count: true }),
      prisma.invoice.aggregate({ where: { companyId, finalized: true, issuedAt: { gte: yearStart } }, _sum: { grossCents: true } }),
      prisma.order.count({ where: { companyId } }),
    ]);
    const revenueGrossCents = revAll._sum.grossCents ?? 0;
    const invoiceCount = revAll._count;
    return {
      company: {
        id: c.id, customerNumber: c.customerNumber, name: c.name, branche: c.branche, zahlungszielTage: c.zahlungszielTage, mahnsperre: c.mahnsperre,
        priceGroupKind: c.priceGroup.kind as PriceGroupKind, gesperrt: c.gesperrtAm !== null, fromLead: c.lead !== null,
        street: c.street, zip: c.zip, city: c.city, country: c.country, vatId: c.vatId, taxNumber: c.taxNumber, taxRule: c.taxRule,
        iban: c.iban, bic: c.bic, bankName: c.bankName, sepaMandateRef: c.sepaMandateRef, sepaMandateDate: c.sepaMandateDate,
        skontoPercent: c.skontoPercent, skontoDays: c.skontoDays, paymentMethod: c.paymentMethod,
        lieferbedingung: c.lieferbedingung, notiz: c.notiz, kreditlimitCents: c.kreditlimitCents,
      },
      contactsCount: c._count.contacts,
      orders: c.orders.map((o) => ({ id: o.id, number: o.number, status: o.status, createdAt: o.createdAt })),
      quotes: c.quotes.map((q) => ({ id: q.id, number: q.number, status: q.status, createdAt: q.createdAt })),
      invoices: c.invoices.map((i) => ({ id: i.id, number: i.number, grossCents: i.grossCents, issuedAt: i.issuedAt })),
      sampleLoans: c.sampleLoans.map((s) => ({ id: s.id, status: s.status, ausgegebenAm: s.ausgegebenAm })),
      openCents: c.invoices.reduce((sum, i) => sum + (i.openItem?.openCents ?? 0), 0),
      metrics: {
        revenueNetCents: revAll._sum.netCents ?? 0,
        revenueGrossCents,
        revenueYtdGrossCents: revYtd._sum.grossCents ?? 0,
        invoiceCount,
        orderCount,
        avgInvoiceGrossCents: invoiceCount > 0 ? Math.round(revenueGrossCents / invoiceCount) : 0,
      },
    };
  }
}
