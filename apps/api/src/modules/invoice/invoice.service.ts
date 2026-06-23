// Order → Invoice „Make-Target" (Kap. 9.1, ERPNext-Muster make_sales_invoice): erzeugt
// aus einem Auftrag die Ausgangsrechnung (Positionsübernahme + USt aus @texma/shared),
// legt den offenen Posten an und meldet den Fortschritt an den Auftrag zurück
// (fakturastatus → VOLL, status → FAKTURIERT). Idempotent: ein Auftrag = eine Rechnung.

import { buildInvoiceTotals, type InvoiceLineInput } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";
import type { NumberingService } from "../numbering/numbering.service.js";

export class InvoiceError extends Error {}

export interface OrderForInvoice {
  id: string;
  number: string;
  companyId: string;
  zahlungszielTage: number;
  alreadyInvoicedId: string | null;
  lines: InvoiceLineInput[];
}

export interface CreatedInvoice {
  id: string;
  number: string;
  netCents: number;
  taxCents: number;
  grossCents: number;
}

export interface InvoiceRepository {
  loadOrderForInvoice(orderId: string): Promise<OrderForInvoice | null>;
  /** Legt Rechnung + offenen Posten an und meldet den Auftrag als fakturiert zurück. */
  createInvoiceFromOrder(input: {
    orderId: string;
    companyId: string;
    number: string;
    netCents: number;
    taxCents: number;
    grossCents: number;
    dueDate: Date;
  }): Promise<{ id: string }>;
  listRecent(limit: number): Promise<Array<{ id: string; number: string; orderId: string | null; companyId: string; grossCents: number; issuedAt: Date }>>;
}

export class InvoiceService {
  constructor(
    private readonly repo: InvoiceRepository,
    private readonly numbering: NumberingService,
    private readonly audit: AuditSink,
    private readonly now: () => Date = () => new Date()
  ) {}

  /** Auftrag → Rechnung. Übernimmt Positionen, rechnet USt, legt OP an, schreibt Status zurück. */
  async createFromOrder(orderId: string): Promise<CreatedInvoice> {
    const order = await this.repo.loadOrderForInvoice(orderId);
    if (!order) throw new InvoiceError("Auftrag nicht gefunden.");
    if (order.alreadyInvoicedId) throw new InvoiceError("Auftrag ist bereits fakturiert.");
    if (order.lines.length === 0) throw new InvoiceError("Auftrag ohne Positionen kann nicht fakturiert werden.");

    const totals = buildInvoiceTotals(order.lines);
    const number = await this.numbering.next("INVOICE", this.now());
    const dueDate = new Date(this.now().getTime() + order.zahlungszielTage * 24 * 60 * 60 * 1000);

    const { id } = await this.repo.createInvoiceFromOrder({
      orderId: order.id,
      companyId: order.companyId,
      number,
      netCents: totals.netCents,
      taxCents: totals.taxCents,
      grossCents: totals.grossCents,
      dueDate,
    });

    await this.audit.append(
      buildEntry({
        entity: "Invoice",
        entityId: id,
        action: "FINALIZE",
        after: { number, fromOrder: order.number, netCents: totals.netCents, grossCents: totals.grossCents, fakturastatus: "VOLL" },
      })
    );
    return { id, number, netCents: totals.netCents, taxCents: totals.taxCents, grossCents: totals.grossCents };
  }

  listRecent(limit = 50): Promise<Array<{ id: string; number: string; orderId: string | null; companyId: string; grossCents: number; issuedAt: Date }>> {
    return this.repo.listRecent(limit);
  }
}
