// In-Memory-Auftragserstellung für Tests.

import type { SalesLine, SalesOrderRepository } from "../modules/sales/sales-order.service.js";

interface MemOrder { id: string; number: string; companyId: string; quoteId?: string; lines: SalesLine[] }
interface MemQuote { id: string; companyId: string; accepted: boolean; lines: SalesLine[] }

export class InMemorySalesOrderRepository implements SalesOrderRepository {
  orders: MemOrder[] = [];
  quotes: MemQuote[] = [];
  private companies = new Set<string>();
  private seq = 0;

  constructor(companyIds: string[] = []) { for (const c of companyIds) this.companies.add(c); }
  addQuote(q: MemQuote): void { this.quotes.push(q); }

  async companyExists(companyId: string): Promise<boolean> { return this.companies.has(companyId); }
  async createOrder(input: { number: string; companyId: string; quoteId?: string; lines: SalesLine[] }): Promise<{ id: string }> {
    const id = `order_${String(++this.seq)}`;
    this.orders.push({ id, ...input });
    return { id };
  }
  async quoteForConversion(quoteId: string): Promise<{ companyId: string; existingOrderId: string | null; lines: SalesLine[] } | null> {
    const q = this.quotes.find((x) => x.id === quoteId);
    if (!q) return null;
    const existing = this.orders.find((o) => o.quoteId === quoteId);
    return { companyId: q.companyId, existingOrderId: existing?.id ?? null, lines: q.lines };
  }
  async markQuoteAccepted(quoteId: string): Promise<void> {
    const q = this.quotes.find((x) => x.id === quoteId);
    if (q) q.accepted = true;
  }
}
