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
  creditedCents: number;
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
    this.invoices.push({ id, number: input.number, orderId: input.orderId, companyId: input.companyId, netCents: input.netCents, taxCents: input.taxCents, grossCents: input.grossCents, issuedAt: new Date(), openCents: input.grossCents, dueDate: input.dueDate, creditedCents: 0 });
    const o = this.orders.find((x) => x.id === input.orderId);
    if (o) { o.invoiceId = id; o.fakturastatus = "VOLL"; o.status = "FAKTURIERT"; }
    return { id };
  }

  async loadInvoiceForCredit(invoiceId: string): Promise<import("../modules/invoice/invoice.service.js").InvoiceForCredit | null> {
    const i = this.invoices.find((x) => x.id === invoiceId);
    if (!i) return null;
    return { id: i.id, number: i.number, grossCents: i.grossCents, finalized: true, orderId: i.orderId, alreadyCreditedCents: i.creditedCents };
  }

  async createCreditNoteAndNeutralize(input: { invoiceId: string; orderId: string | null; number: string; amountCents: number; reason: string }): Promise<{ id: string }> {
    const i = this.invoices.find((x) => x.id === input.invoiceId)!;
    i.creditedCents += input.amountCents;
    i.openCents = Math.max(0, i.openCents - input.amountCents);
    if (input.orderId) {
      const o = this.orders.find((x) => x.id === input.orderId);
      if (o) o.fakturastatus = "NICHT";
    }
    const id = `cn_${String(++this.seq)}`;
    return { id };
  }

  async listRecent(limit: number): Promise<Array<{ id: string; number: string; orderId: string | null; companyId: string; netCents: number; taxCents: number; grossCents: number; openCents: number | null; dueDate: Date | null; issuedAt: Date }>> {
    return [...this.invoices].reverse().slice(0, limit).map((i) => ({ id: i.id, number: i.number, orderId: i.orderId, companyId: i.companyId, netCents: i.netCents, taxCents: i.taxCents, grossCents: i.grossCents, openCents: null, dueDate: null, issuedAt: i.issuedAt }));
  }
}
