// In-Memory-Quote-Repository für Unit-Tests/Dev.

import { isQuoteExpired, type QuoteStatus } from "@texma/shared";
import type { ExpiredQuote, QuoteRepository } from "../modules/quote/quote.service.js";

interface Quote {
  id: string;
  status: QuoteStatus;
  gueltigBisAm: Date | null;
  verlustgrund: string | null;
  hasDueItem: boolean;
}

export class InMemoryQuoteRepository implements QuoteRepository {
  private readonly quotes = new Map<string, Quote>();

  seed(id: string, status: QuoteStatus, gueltigBisAm: Date | null = null): void {
    this.quotes.set(id, { id, status, gueltigBisAm, verlustgrund: null, hasDueItem: false });
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
