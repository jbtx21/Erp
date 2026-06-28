// In-Memory-Zahlungs-Repository für Unit-Tests/Dev.

import type { OpenItemRow, PaymentRepository } from "../modules/payment/payment.service.js";

/** Test-Zahlungseingang (für die manuelle Zuordnung). */
export interface MemPayment {
  id: string;
  amountCents: number;
  allocations: Array<{ openItemId: string; amountCents: number }>;
  matched: boolean;
}

export class InMemoryPaymentRepository implements PaymentRepository {
  constructor(
    private readonly items: OpenItemRow[] = [],
    /** Vorerfasste Zahlungseingänge (z. B. aus dem Bankimport, in Klärung). */
    readonly payments: MemPayment[] = []
  ) {}

  async listOpenItems(): Promise<OpenItemRow[]> {
    return this.items.filter((i) => i.openCents > 0).map((i) => ({ ...i }));
  }

  async getOpenItem(openItemId: string): Promise<{ id: string; openCents: number } | null> {
    const i = this.items.find((x) => x.id === openItemId);
    return i ? { id: i.id, openCents: i.openCents } : null;
  }

  async recordPayment(input: { openItemId: string; amountCents: number }): Promise<{ newOpenCents: number }> {
    const i = this.items.find((x) => x.id === input.openItemId);
    if (!i) return { newOpenCents: 0 };
    i.openCents -= input.amountCents;
    return { newOpenCents: i.openCents };
  }

  async getPaymentForAssign(paymentId: string): Promise<{ amountCents: number; allocatedCents: number } | null> {
    const p = this.payments.find((x) => x.id === paymentId);
    return p ? { amountCents: p.amountCents, allocatedCents: p.allocations.reduce((s, a) => s + a.amountCents, 0) } : null;
  }

  async assignPaymentToOpenItem(input: { paymentId: string; openItemId: string; amountCents: number }): Promise<{ newOpenCents: number; paymentFullyMatched: boolean }> {
    const p = this.payments.find((x) => x.id === input.paymentId);
    if (!p) throw new Error("Zahlungseingang nicht gefunden.");
    if (p.allocations.some((a) => a.openItemId === input.openItemId)) throw new Error("Diese Zahlung ist diesem offenen Posten bereits zugeordnet.");
    p.allocations.push({ openItemId: input.openItemId, amountCents: input.amountCents });
    const oi = this.items.find((x) => x.id === input.openItemId);
    if (oi) oi.openCents -= input.amountCents;
    const allocated = p.allocations.reduce((s, a) => s + a.amountCents, 0);
    p.matched = allocated >= p.amountCents;
    return { newOpenCents: oi?.openCents ?? 0, paymentFullyMatched: p.matched };
  }
}
