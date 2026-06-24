// Prisma-Implementierung des Quote-Repositories (Produktionspfad, B8). Verfall:
// offene Angebote mit überschrittener Gültigkeit und noch ohne Wiedervorlage.

import { prisma } from "@texma/db";
import type { QuoteStatus } from "@texma/shared";
import type { CreateQuoteInput, ExpiredQuote, QuoteRepository, QuoteRow } from "../modules/quote/quote.service.js";

export class PrismaQuoteRepository implements QuoteRepository {
  async getStatus(quoteId: string): Promise<QuoteStatus | null> {
    const q = await prisma.quote.findUnique({ where: { id: quoteId }, select: { status: true } });
    return (q?.status ?? null) as QuoteStatus | null;
  }

  async list(): Promise<QuoteRow[]> {
    const rows = await prisma.quote.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true, companyId: true, status: true, orderType: true, quotationTo: true, gueltigBisAm: true, createdAt: true, company: { select: { name: true } }, lines: { select: { qty: true, unitNetCents: true, dbCents: true, isAlternative: true } } },
    });
    return rows.map((q) => {
      const main = q.lines.filter((l) => !l.isAlternative);
      const dbLines = main.filter((l) => l.dbCents !== null);
      return {
        id: q.id, number: q.number, companyId: q.companyId, companyName: q.company.name, status: q.status as QuoteStatus,
        orderType: q.orderType, quotationTo: q.quotationTo, gueltigBisAm: q.gueltigBisAm, createdAt: q.createdAt,
        totalNetCents: main.reduce((s, l) => s + l.qty * l.unitNetCents, 0),
        totalDbCents: dbLines.length ? dbLines.reduce((s, l) => s + l.qty * (l.dbCents ?? 0), 0) : null,
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
        lines: { create: input.lines.map((l, i) => ({ position: i + 1, description: l.description, qty: l.qty, unitNetCents: l.unitNetCents, listNetCents: l.listNetCents ?? null, rabattPct: l.rabattPct ?? null, dbCents: l.dbCents ?? null, kind: (l.kind ?? "TEXTIL") as never, articleId: l.articleId ?? null, variantId: l.variantId ?? null, isAlternative: l.isAlternative ?? false })) },
      },
      select: { id: true },
    });
  }

  async setStatus(quoteId: string, status: QuoteStatus): Promise<void> {
    await prisma.quote.update({ where: { id: quoteId }, data: { status: status as never } });
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
