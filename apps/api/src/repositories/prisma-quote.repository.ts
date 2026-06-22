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
      select: { id: true, number: true, companyId: true, status: true, gueltigBisAm: true, lines: { select: { qty: true, unitNetCents: true } } },
    });
    return rows.map((q) => ({
      id: q.id, number: q.number, companyId: q.companyId, status: q.status as QuoteStatus,
      gueltigBisAm: q.gueltigBisAm,
      totalNetCents: q.lines.reduce((s, l) => s + l.qty * l.unitNetCents, 0),
    }));
  }

  async create(input: CreateQuoteInput & { number: string }): Promise<{ id: string }> {
    return prisma.quote.create({
      data: {
        number: input.number,
        companyId: input.companyId,
        gueltigBisAm: input.gueltigBisAm ?? null,
        lines: { create: input.lines.map((l, i) => ({ position: i + 1, description: l.description, qty: l.qty, unitNetCents: l.unitNetCents, kind: (l.kind ?? "TEXTIL") as never })) },
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
