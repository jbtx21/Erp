// Prisma-Implementierung des Quote-Repositories (Produktionspfad, B8). Verfall:
// offene Angebote mit überschrittener Gültigkeit und noch ohne Wiedervorlage.

import { prisma } from "@texma/db";
import type { QuoteStatus } from "@texma/shared";
import type { ExpiredQuote, QuoteRepository } from "../modules/quote/quote.service.js";

export class PrismaQuoteRepository implements QuoteRepository {
  async getStatus(quoteId: string): Promise<QuoteStatus | null> {
    const q = await prisma.quote.findUnique({ where: { id: quoteId }, select: { status: true } });
    return (q?.status ?? null) as QuoteStatus | null;
  }

  async reject(quoteId: string, verlustgrund: string): Promise<void> {
    await prisma.quote.update({ where: { id: quoteId }, data: { status: "ABGELEHNT", verlustgrund } });
  }

  async listExpiredWithoutDueItem(now: Date): Promise<ExpiredQuote[]> {
    const quotes = await prisma.quote.findMany({
      where: { status: { notIn: ["ANGENOMMEN", "ABGELEHNT"] }, gueltigBisAm: { lt: now } },
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
