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
      orderBy: { name: "asc" },
      select: { id: true, name: true, branche: true, zahlungszielTage: true, mahnsperre: true, gesperrtAm: true, priceGroup: { select: { kind: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      branche: c.branche,
      zahlungszielTage: c.zahlungszielTage,
      mahnsperre: c.mahnsperre,
      priceGroupKind: c.priceGroup.kind as PriceGroupKind,
      gesperrt: c.gesperrtAm !== null,
    }));
  }

  async create(input: CreateCompanyInput): Promise<{ id: string }> {
    const pg = await prisma.priceGroup.upsert({
      where: { kind: input.priceGroupKind },
      update: {},
      create: { kind: input.priceGroupKind, name: input.priceGroupKind },
      select: { id: true },
    });
    return prisma.company.create({
      data: {
        name: input.name,
        branche: input.branche ?? null,
        zahlungszielTage: input.zahlungszielTage ?? 14,
        priceGroupId: pg.id,
      },
      select: { id: true },
    });
  }

  async update(input: UpdateCompanyInput): Promise<void> {
    const pick = (k: keyof UpdateCompanyInput): object => (input[k] !== undefined ? { [k]: input[k] } : {});
    await prisma.company.update({
      where: { id: input.id },
      data: {
        ...pick("name"), ...pick("branche"), ...pick("zahlungszielTage"), ...pick("mahnsperre"),
        ...pick("street"), ...pick("zip"), ...pick("city"), ...pick("country"),
        ...pick("vatId"), ...pick("taxNumber"),
        ...pick("skontoPercent"), ...pick("skontoDays"), ...pick("paymentMethod"),
        ...pick("lieferbedingung"), ...pick("notiz"), ...pick("kreditlimitCents"),
      },
    });
  }

  async overview(companyId: string): Promise<import("../modules/company/company.service.js").CompanyOverview | null> {
    const c = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true, name: true, branche: true, zahlungszielTage: true, mahnsperre: true, gesperrtAm: true,
        street: true, zip: true, city: true, country: true, vatId: true, taxNumber: true,
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
    return {
      company: {
        id: c.id, name: c.name, branche: c.branche, zahlungszielTage: c.zahlungszielTage, mahnsperre: c.mahnsperre,
        priceGroupKind: c.priceGroup.kind as PriceGroupKind, gesperrt: c.gesperrtAm !== null, fromLead: c.lead !== null,
        street: c.street, zip: c.zip, city: c.city, country: c.country, vatId: c.vatId, taxNumber: c.taxNumber,
        skontoPercent: c.skontoPercent, skontoDays: c.skontoDays, paymentMethod: c.paymentMethod,
        lieferbedingung: c.lieferbedingung, notiz: c.notiz, kreditlimitCents: c.kreditlimitCents,
      },
      contactsCount: c._count.contacts,
      orders: c.orders.map((o) => ({ id: o.id, number: o.number, status: o.status, createdAt: o.createdAt })),
      quotes: c.quotes.map((q) => ({ id: q.id, number: q.number, status: q.status, createdAt: q.createdAt })),
      invoices: c.invoices.map((i) => ({ id: i.id, number: i.number, grossCents: i.grossCents, issuedAt: i.issuedAt })),
      sampleLoans: c.sampleLoans.map((s) => ({ id: s.id, status: s.status, ausgegebenAm: s.ausgegebenAm })),
      openCents: c.invoices.reduce((sum, i) => sum + (i.openItem?.openCents ?? 0), 0),
    };
  }
}
