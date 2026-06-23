// In-Memory-Quote-Repository für Unit-Tests/Dev.

import { isQuoteExpired, type QuoteStatus } from "@texma/shared";
import type { CreateQuoteInput, ExpiredQuote, QuoteRepository, QuoteRow } from "../modules/quote/quote.service.js";

interface Quote {
  id: string;
  number: string;
  companyId: string;
  status: QuoteStatus;
  orderType: string;
  quotationTo: string;
  gueltigBisAm: Date | null;
  createdAt: Date;
  verlustgrund: string | null;
  totalNetCents: number;
  totalDbCents: number | null;
  hasDueItem: boolean;
}

export class InMemoryQuoteRepository implements QuoteRepository {
  private readonly quotes = new Map<string, Quote>();
  private seq = 0;

  async list(): Promise<QuoteRow[]> {
    return [...this.quotes.values()].map((q) => ({
      id: q.id, number: q.number, companyId: q.companyId, companyName: q.companyId, status: q.status,
      orderType: q.orderType, quotationTo: q.quotationTo, gueltigBisAm: q.gueltigBisAm, createdAt: q.createdAt, totalNetCents: q.totalNetCents, totalDbCents: q.totalDbCents,
    }));
  }

  async create(input: CreateQuoteInput & { number: string }): Promise<{ id: string }> {
    const id = `quote_${++this.seq}`;
    const main = input.lines.filter((l) => !l.isAlternative);
    const dbLines = main.filter((l) => l.dbCents !== null && l.dbCents !== undefined);
    this.quotes.set(id, {
      id, number: input.number, companyId: input.companyId, status: "ENTWURF",
      orderType: input.orderType ?? "SALES", quotationTo: input.quotationTo ?? "CUSTOMER",
      gueltigBisAm: input.gueltigBisAm ?? null, createdAt: new Date(), verlustgrund: null,
      totalNetCents: main.reduce((s, l) => s + l.qty * l.unitNetCents, 0),
      totalDbCents: dbLines.length ? dbLines.reduce((s, l) => s + l.qty * (l.dbCents ?? 0), 0) : null,
      hasDueItem: false,
    });
    return { id };
  }

  async setStatus(quoteId: string, status: QuoteStatus): Promise<void> {
    const q = this.quotes.get(quoteId);
    if (q) q.status = status;
  }

  seed(id: string, status: QuoteStatus, gueltigBisAm: Date | null = null): void {
    this.quotes.set(id, { id, number: id, companyId: "co", status, orderType: "SALES", quotationTo: "CUSTOMER", gueltigBisAm, createdAt: new Date(), verlustgrund: null, totalNetCents: 0, totalDbCents: null, hasDueItem: false });
  }

  get(id: string): Quote | undefined {
    return this.quotes.get(id);
  }

  async getStatus(quoteId: string): Promise<QuoteStatus | null> {
    return this.quotes.get(quoteId)?.status ?? null;
  }

  async reject(quoteId: string, verlustgrund: string): Promise<void> {
    const q = this.quotes.get(quoteId);
    if (!q) return;
    q.status = "ABGELEHNT";
    q.verlustgrund = verlustgrund;
  }

  async listExpiredWithoutDueItem(now: Date): Promise<ExpiredQuote[]> {
    return [...this.quotes.values()]
      .filter((q) => !q.hasDueItem && isQuoteExpired({ status: q.status, gueltigBisAm: q.gueltigBisAm }, now))
      .map((q) => ({ id: q.id, gueltigBisAm: q.gueltigBisAm! }));
  }

  async createExpiryDueItem(quoteId: string): Promise<void> {
    const q = this.quotes.get(quoteId);
    if (q) q.hasDueItem = true;
  }
}
