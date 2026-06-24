// In-Memory-Auftragserstellung für Tests.

import type { PositionKind } from "@texma/shared";
import type { ConversionPlan, OrderEditData, SalesLine, SalesOrderRepository } from "../modules/sales/sales-order.service.js";

interface MemOrder { id: string; number: string; companyId: string; quoteId?: string; lines: SalesLine[] }
/** Angebotsposition im Testspeicher (mit optionaler Artikel-/Varianten-/Alternativ-Info). */
export interface MemQuoteLine {
  position?: number;
  description: string;
  qty: number;
  unitNetCents: number;
  listNetCents?: number | null;
  rabattPct?: number | null;
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

  /** Sperrflags je Auftrag (für Edit-Gate-Tests setzbar). */
  readonly orderLocks = new Map<string, { invoiced?: boolean; inProduction?: boolean; delivered?: boolean }>();
  /** Bereits gelieferte Menge je Bestandsposition (Index), für Integritäts-Tests. */
  readonly deliveredByOrder = new Map<string, number[]>();
  setDelivered(orderId: string, deliveredByPosition: number[]): void { this.deliveredByOrder.set(orderId, deliveredByPosition); }

  async orderForEdit(orderId: string): Promise<OrderEditData | null> {
    const o = this.orders.find((x) => x.id === orderId);
    if (!o) return null;
    const lock = this.orderLocks.get(orderId) ?? {};
    const delivered = (this.deliveredByOrder.get(orderId) ?? []).some((q) => q > 0);
    return {
      id: o.id, number: o.number, companyId: o.companyId,
      invoiced: !!lock.invoiced, inProduction: !!lock.inProduction, delivered: !!lock.delivered || delivered,
      lines: o.lines.map((l) => ({ description: l.description, qty: l.qty, kind: l.kind ?? "TEXTIL", unitNetCents: l.unitNetCents, listNetCents: l.listNetCents ?? null, rabattPct: l.rabattPct ?? null, dbCents: l.dbCents ?? null, variantId: l.variantId ?? null })),
    };
  }
  async updateOrder(orderId: string, companyId: string, lines: SalesLine[]): Promise<void> {
    const o = this.orders.find((x) => x.id === orderId);
    if (!o) return;
    // Integrität: bereits gelieferte Positionen dürfen nicht entfallen/unter die Liefermenge fallen.
    const delivered = this.deliveredByOrder.get(orderId) ?? [];
    delivered.forEach((dq, i) => {
      if (dq <= 0) return;
      const nw = lines[i];
      if (!nw) throw new Error(`Position ${i + 1} ist bereits geliefert und kann nicht entfernt werden.`);
      if (dq > nw.qty) throw new Error(`Position ${i + 1}: Menge ${nw.qty} unter bereits gelieferter Menge ${dq}.`);
    });
    o.companyId = companyId; o.lines = lines;
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
        listNetCents: l.listNetCents ?? null,
        rabattPct: l.rabattPct ?? null,
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
