// In-Memory-Zahlungs-Repository für Unit-Tests/Dev.

import type { OpenItemRow, PaymentRepository } from "../modules/payment/payment.service.js";

export class InMemoryPaymentRepository implements PaymentRepository {
  constructor(private readonly items: OpenItemRow[] = []) {}

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
}
