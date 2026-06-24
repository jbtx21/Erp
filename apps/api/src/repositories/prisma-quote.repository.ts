// Prisma-Implementierung des Quote-Repositories (Produktionspfad, B8). Verfall:
// offene Angebote mit überschrittener Gültigkeit und noch ohne Wiedervorlage.

import { prisma } from "@texma/db";
import { buildQuoteTotals, type QuoteStatus } from "@texma/shared";
import type { CreateQuoteInput, ExpiredQuote, QuoteEditData, QuoteRepository, QuoteRow } from "../modules/quote/quote.service.js";

export class PrismaQuoteRepository implements QuoteRepository {
  async getStatus(quoteId: string): Promise<QuoteStatus | null> {
    const q = await prisma.quote.findUnique({ where: { id: quoteId }, select: { status: true } });
    return (q?.status ?? null) as QuoteStatus | null;
  }

  async list(): Promise<QuoteRow[]> {
    const rows = await prisma.quote.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true, companyId: true, status: true, orderType: true, quotationTo: true, gueltigBisAm: true, createdAt: true, company: { select: { name: true } }, lines: { select: { qty: true, unitNetCents: true, taxRatePct: true, dbCents: true, isAlternative: true } } },
    });
    return rows.map((q) => {
      const t = buildQuoteTotals(q.lines.map((l) => ({ qty: l.qty, unitNetCents: l.unitNetCents, taxRatePct: l.taxRatePct, dbCents: l.dbCents, isAlternative: l.isAlternative })));
      return {
        id: q.id, number: q.number, companyId: q.companyId, companyName: q.company.name, status: q.status as QuoteStatus,
        orderType: q.orderType, quotationTo: q.quotationTo, gueltigBisAm: q.gueltigBisAm, createdAt: q.createdAt,
        totalNetCents: t.netCents, totalTaxCents: t.taxCents, totalGrossCents: t.grossCents, totalDbCents: t.totalDbCents,
      };
    });
  }

  async create(input: CreateQuoteInput & { number: string }): Promise<{ id: string }> {
    return prisma.quote.create({
      data: {
        number: input.number,
        companyId: input.companyId,
        gueltigBisAm: input.gueltigBisAm ?? null,
        orderType: input.orderType ?? "SALES",
        quotationTo: input.quotationTo ?? "CUSTOMER",
        terms: input.terms ?? null,
        zahlungszielTage: input.zahlungszielTage ?? null,
        incoterm: input.incoterm ?? null,
        versandregel: input.versandregel ?? null,
        lines: { create: input.lines.map((l, i) => ({ position: i + 1, description: l.description, qty: l.qty, unitNetCents: l.unitNetCents, listNetCents: l.listNetCents ?? null, rabattPct: l.rabattPct ?? null, taxRatePct: l.taxRatePct ?? 19, dbCents: l.dbCents ?? null, kind: (l.kind ?? "TEXTIL") as never, articleId: l.articleId ?? null, variantId: l.variantId ?? null, isAlternative: l.isAlternative ?? false })) },
      },
      select: { id: true },
    });
  }

  async setStatus(quoteId: string, status: QuoteStatus): Promise<void> {
    await prisma.quote.update({ where: { id: quoteId }, data: { status: status as never } });
  }

  async forEdit(quoteId: string): Promise<QuoteEditData | null> {
    const q = await prisma.quote.findUnique({
      where: { id: quoteId },
      select: {
        id: true, companyId: true, status: true, gueltigBisAm: true, terms: true, orderType: true, quotationTo: true, zahlungszielTage: true, incoterm: true, versandregel: true,
        lines: { orderBy: { position: "asc" }, select: { description: true, qty: true, kind: true, unitNetCents: true, listNetCents: true, rabattPct: true, taxRatePct: true, dbCents: true, articleId: true, variantId: true, isAlternative: true } },
      },
    });
    if (!q) return null;
    return {
      id: q.id, companyId: q.companyId, status: q.status as QuoteStatus, gueltigBisAm: q.gueltigBisAm, terms: q.terms, orderType: q.orderType, quotationTo: q.quotationTo, zahlungszielTage: q.zahlungszielTage, incoterm: q.incoterm, versandregel: q.versandregel,
      lines: q.lines.map((l) => ({ description: l.description, qty: l.qty, kind: l.kind as never, unitNetCents: l.unitNetCents, listNetCents: l.listNetCents, rabattPct: l.rabattPct, taxRatePct: l.taxRatePct, dbCents: l.dbCents, articleId: l.articleId, variantId: l.variantId, isAlternative: l.isAlternative })),
    };
  }

  async update(quoteId: string, input: CreateQuoteInput): Promise<void> {
    await prisma.$transaction([
      prisma.quoteLine.deleteMany({ where: { quoteId } }),
      prisma.quote.update({
        where: { id: quoteId },
        data: {
          companyId: input.companyId,
          gueltigBisAm: input.gueltigBisAm ?? null,
          orderType: input.orderType ?? "SALES",
          quotationTo: input.quotationTo ?? "CUSTOMER",
          terms: input.terms ?? null,
          zahlungszielTage: input.zahlungszielTage ?? null,
          incoterm: input.incoterm ?? null,
          versandregel: input.versandregel ?? null,
          lines: { create: input.lines.map((l, i) => ({ position: i + 1, description: l.description, qty: l.qty, unitNetCents: l.unitNetCents, listNetCents: l.listNetCents ?? null, rabattPct: l.rabattPct ?? null, taxRatePct: l.taxRatePct ?? 19, dbCents: l.dbCents ?? null, kind: (l.kind ?? "TEXTIL") as never, articleId: l.articleId ?? null, variantId: l.variantId ?? null, isAlternative: l.isAlternative ?? false })) },
        },
      }),
    ]);
  }

  async reject(quoteId: string, verlustgrund: string): Promise<void> {
    await prisma.quote.update({ where: { id: quoteId }, data: { status: "ABGELEHNT", verlustgrund } });
  }

  async listExpiredWithoutDueItem(now: Date): Promise<ExpiredQuote[]> {
    const quotes = await prisma.quote.findMany({
      // Nur gesendete Angebote verfallen — Entwürfe nicht (Kap. 35.1).
      where: { status: { in: ["VERSENDET", "NACHFASSEN"] }, gueltigBisAm: { lt: now } },
      select: { id: true, gueltigBisAm: true },
    });
    if (quotes.length === 0) return [];

    const existing = await prisma.dueItem.findMany({
      where: { entity: "Quote", entityId: { in: quotes.map((q) => q.id) } },
      select: { entityId: true },
    });
    const has = new Set(existing.map((e) => e.entityId));

    return quotes
      .filter((q) => !has.has(q.id))
      .map((q) => ({ id: q.id, gueltigBisAm: q.gueltigBisAm! }));
  }

  async createExpiryDueItem(quoteId: string, now: Date): Promise<void> {
    await prisma.dueItem.create({
      data: { entity: "Quote", entityId: quoteId, dueDate: now, note: "Angebot abgelaufen — nachfassen (Kap. 35.1)" },
    });
  }
}
