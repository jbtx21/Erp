// In-Memory-Druckdaten für Tests.

import type { DeliveryNotePrintData, InvoicePrintData, LaufzettelPrintData, OrderConfirmationPrintData, PrintRepository, QuotePrintData } from "../modules/print/print.service.js";

export class InMemoryPrintRepository implements PrintRepository {
  deliveryNotes: Record<string, DeliveryNotePrintData> = {};
  invoices: Record<string, InvoicePrintData> = {};
  laufzettel: Record<string, LaufzettelPrintData> = {};
  quotes: Record<string, QuotePrintData> = {};
  orderConfirmations: Record<string, OrderConfirmationPrintData> = {};
  briefkopfLines: string[] = [];
  async deliveryNoteForPrint(id: string): Promise<DeliveryNotePrintData | null> { return this.deliveryNotes[id] ?? null; }
  async sampleLoanForPrint(loanId: string): Promise<DeliveryNotePrintData | null> { return this.deliveryNotes[loanId] ?? null; }
  async invoiceForPrint(id: string): Promise<InvoicePrintData | null> { return this.invoices[id] ?? null; }
  async laufzettelForPrint(orderId: string): Promise<LaufzettelPrintData | null> { return this.laufzettel[orderId] ?? null; }
  async quoteForPrint(id: string): Promise<QuotePrintData | null> { return this.quotes[id] ?? null; }
  async orderConfirmationForPrint(orderId: string): Promise<OrderConfirmationPrintData | null> { return this.orderConfirmations[orderId] ?? null; }
  async briefkopf(): Promise<string[]> { return this.briefkopfLines; }
}
