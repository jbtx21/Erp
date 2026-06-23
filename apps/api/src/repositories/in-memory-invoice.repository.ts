// In-Memory-Invoice-Repo (Order → Invoice Make-Target) für Tests.
import type { InvoiceRepository, OrderForInvoice } from "../modules/invoice/invoice.service.js";

interface MemOrder {
  id: string;
  number: string;
  companyId: string;
  zahlungszielTage: number;
  lines: OrderForInvoice["lines"];
  invoiceId: string | null;
  fakturastatus: string;
  status: string;
}
interface MemInvoice {
  id: string;
  number: string;
  orderId: string | null;
  companyId: string;
  netCents: number;
  taxCents: number;
  grossCents: number;
  issuedAt: Date;
  openCents: number;
  dueDate: Date;
}

export class InMemoryInvoiceRepository implements InvoiceRepository {
  private seq = 0;
  readonly invoices: MemInvoice[] = [];
  constructor(private readonly orders: MemOrder[]) {}

  async loadOrderForInvoice(orderId: string): Promise<OrderForInvoice | null> {
    const o = this.orders.find((x) => x.id === orderId);
    if (!o) return null;
    return { id: o.id, number: o.number, companyId: o.companyId, zahlungszielTage: o.zahlungszielTage, alreadyInvoicedId: o.invoiceId, lines: o.lines };
  }

  async createInvoiceFromOrder(input: { orderId: string; companyId: string; number: string; netCents: number; taxCents: number; grossCents: number; dueDate: Date }): Promise<{ id: string }> {
    const id = `inv_${String(++this.seq)}`;
    this.invoices.push({ id, number: input.number, orderId: input.orderId, companyId: input.companyId, netCents: input.netCents, taxCents: input.taxCents, grossCents: input.grossCents, issuedAt: new Date(), openCents: input.grossCents, dueDate: input.dueDate });
    const o = this.orders.find((x) => x.id === input.orderId);
    if (o) { o.invoiceId = id; o.fakturastatus = "VOLL"; o.status = "FAKTURIERT"; }
    return { id };
  }

  async listRecent(limit: number): Promise<Array<{ id: string; number: string; orderId: string | null; companyId: string; grossCents: number; issuedAt: Date }>> {
    return [...this.invoices].reverse().slice(0, limit).map((i) => ({ id: i.id, number: i.number, orderId: i.orderId, companyId: i.companyId, grossCents: i.grossCents, issuedAt: i.issuedAt }));
  }
}
