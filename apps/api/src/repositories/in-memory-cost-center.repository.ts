// In-Memory-Kostenstellen-Repository für Unit-Tests/Dev.

import type { CostCenterRepository } from "../modules/cost-center/cost-center.service.js";

export class InMemoryCostCenterRepository implements CostCenterRepository {
  private readonly centers = new Map<string, { id: string; nummer: string; name: string }>();
  private readonly invoices = new Map<string, { costCenterId: string | null; amountCents: number }>();
  private seq = 0;

  /** Test-Helfer: Rechnung mit Betrag und (optionaler) Kostenstelle anlegen. */
  seedInvoice(id: string, amountCents: number, costCenterId: string | null = null): void {
    this.invoices.set(id, { costCenterId, amountCents });
  }

  async create(nummer: string, name: string): Promise<{ id: string; nummer: string }> {
    const id = `cc-${++this.seq}`;
    this.centers.set(id, { id, nummer, name });
    return { id, nummer };
  }

  async list(): Promise<Array<{ id: string; nummer: string; name: string }>> {
    return [...this.centers.values()].map((c) => ({ ...c })).sort((a, b) => a.nummer.localeCompare(b.nummer));
  }

  async remove(id: string): Promise<void> {
    this.centers.delete(id);
    for (const inv of this.invoices.values()) if (inv.costCenterId === id) inv.costCenterId = null;
  }

  async assignInvoice(invoiceId: string, costCenterId: string | null): Promise<void> {
    const inv = this.invoices.get(invoiceId);
    if (inv) inv.costCenterId = costCenterId;
  }

  async invoiceAmounts(): Promise<Array<{ costCenterId: string | null; amountCents: number }>> {
    return [...this.invoices.values()].map((i) => ({ ...i }));
  }
}
