// In-Memory-Auftragserstellung für Tests.

import type { PositionKind } from "@texma/shared";
import type { ConversionPlan, SalesLine, SalesOrderRepository } from "../modules/sales/sales-order.service.js";

interface MemOrder { id: string; number: string; companyId: string; quoteId?: string; lines: SalesLine[] }
/** Angebotsposition im Testspeicher (mit optionaler Artikel-/Varianten-/Alternativ-Info). */
export interface MemQuoteLine {
  position?: number;
  description: string;
  qty: number;
  unitNetCents: number;
  kind?: PositionKind;
  articleId?: string | null;
  articleName?: string | null;
  variantId?: string | null;
  isAlternative?: boolean;
  dbCents?: number | null;
}
interface MemQuote { id: string; companyId: string; accepted: boolean; lines: MemQuoteLine[] }

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
  async conversionPlan(quoteId: string): Promise<ConversionPlan | null> {
    const q = this.quotes.find((x) => x.id === quoteId);
    if (!q) return null;
    const existing = this.orders.find((o) => o.quoteId === quoteId);
    return {
      companyId: q.companyId,
      existingOrderId: existing?.id ?? null,
      lines: q.lines.map((l, i) => ({
        position: l.position ?? i + 1,
        description: l.description,
        qty: l.qty,
        unitNetCents: l.unitNetCents,
        kind: l.kind ?? "TEXTIL",
        articleId: l.articleId ?? null,
        articleName: l.articleName ?? null,
        variantId: l.variantId ?? null,
        isAlternative: l.isAlternative ?? false,
        dbCents: l.dbCents ?? null,
        needsVariant: !!l.articleId && !l.variantId && !l.isAlternative,
      })),
    };
  }
  async markQuoteAccepted(quoteId: string): Promise<void> {
    const q = this.quotes.find((x) => x.id === quoteId);
    if (q) q.accepted = true;
  }
}
