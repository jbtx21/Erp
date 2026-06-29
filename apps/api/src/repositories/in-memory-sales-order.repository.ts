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
  taxRatePct?: number | null;
  kind?: PositionKind;
  articleId?: string | null;
  articleName?: string | null;
  variantId?: string | null;
  isAlternative?: boolean;
  bezugPositionen?: number[];
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
  readonly orderLocks = new Map<string, { invoiced?: boolean; inProduction?: boolean; delivered?: boolean; status?: string }>();
  /** Bereits gelieferte Menge je Bestandsposition (Index), für Integritäts-Tests. */
  readonly deliveredByOrder = new Map<string, number[]>();
  setDelivered(orderId: string, deliveredByPosition: number[]): void { this.deliveredByOrder.set(orderId, deliveredByPosition); }

  async orderForEdit(orderId: string): Promise<OrderEditData | null> {
    const o = this.orders.find((x) => x.id === orderId);
    if (!o) return null;
    const lock = this.orderLocks.get(orderId) ?? {};
    const delivered = (this.deliveredByOrder.get(orderId) ?? []).some((q) => q > 0);
    return {
      id: o.id, number: o.number, companyId: o.companyId, status: lock.status ?? "ANGELEGT",
      invoiced: !!lock.invoiced, inProduction: !!lock.inProduction, delivered: !!lock.delivered || delivered,
      lines: o.lines.map((l) => ({ description: l.description, qty: l.qty, kind: l.kind ?? "TEXTIL", unitNetCents: l.unitNetCents, listNetCents: l.listNetCents ?? null, rabattPct: l.rabattPct ?? null, taxRatePct: l.taxRatePct ?? 19, dbCents: l.dbCents ?? null, variantId: l.variantId ?? null, bezugPositionen: l.bezugPositionen ?? [], lineType: l.lineType ?? "ARTIKEL", placement: l.placement ?? null, positionType: l.positionType ?? null, positionSide: l.positionSide ?? null, positionId: l.positionId ?? null, motiv: l.motiv ?? null, motivGroesse: l.motivGroesse ?? null, farbton: l.farbton ?? null, platzierungsdetails: l.platzierungsdetails ?? null, sonstiges: l.sonstiges ?? null, altPreisText: l.altPreisText ?? null, imPdfAusblenden: l.imPdfAusblenden ?? false })),
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
        taxRatePct: l.taxRatePct ?? 19,
        kind: l.kind ?? "TEXTIL",
        articleId: l.articleId ?? null,
        articleName: l.articleName ?? null,
        variantId: l.variantId ?? null,
        isAlternative: l.isAlternative ?? false,
        bezugPositionen: l.bezugPositionen ?? [],
        dbCents: l.dbCents ?? null,
        lineType: "ARTIKEL",
        placement: null,
        positionType: null,
        positionSide: null,
        positionId: null,
        motiv: null,
        motivGroesse: null,
        farbton: null,
        platzierungsdetails: null,
        sonstiges: null,
        altPreisText: null,
        imPdfAusblenden: false,
        needsVariant: !!l.articleId && !l.variantId && !l.isAlternative,
      })),
    };
  }
  async markQuoteAccepted(quoteId: string): Promise<void> {
    const q = this.quotes.find((x) => x.id === quoteId);
    if (q) q.accepted = true;
  }
}
