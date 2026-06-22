// In-Memory-Quote-Repository für Unit-Tests/Dev.

import { isQuoteExpired, type QuoteStatus } from "@texma/shared";
import type { CreateQuoteInput, ExpiredQuote, QuoteRepository, QuoteRow } from "../modules/quote/quote.service.js";

interface Quote {
  id: string;
  number: string;
  companyId: string;
  status: QuoteStatus;
  gueltigBisAm: Date | null;
  verlustgrund: string | null;
  totalNetCents: number;
  hasDueItem: boolean;
}

export class InMemoryQuoteRepository implements QuoteRepository {
  private readonly quotes = new Map<string, Quote>();
  private seq = 0;

  async list(): Promise<QuoteRow[]> {
    return [...this.quotes.values()].map((q) => ({
      id: q.id, number: q.number, companyId: q.companyId, status: q.status, gueltigBisAm: q.gueltigBisAm, totalNetCents: q.totalNetCents,
    }));
  }

  async create(input: CreateQuoteInput & { number: string }): Promise<{ id: string }> {
    const id = `quote_${++this.seq}`;
    this.quotes.set(id, {
      id, number: input.number, companyId: input.companyId, status: "ENTWURF",
      gueltigBisAm: input.gueltigBisAm ?? null, verlustgrund: null,
      totalNetCents: input.lines.reduce((s, l) => s + l.qty * l.unitNetCents, 0), hasDueItem: false,
    });
    return { id };
  }

  async setStatus(quoteId: string, status: QuoteStatus): Promise<void> {
    const q = this.quotes.get(quoteId);
    if (q) q.status = status;
  }

  seed(id: string, status: QuoteStatus, gueltigBisAm: Date | null = null): void {
    this.quotes.set(id, { id, number: id, companyId: "co", status, gueltigBisAm, verlustgrund: null, totalNetCents: 0, hasDueItem: false });
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
