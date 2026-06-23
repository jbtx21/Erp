// In-Memory-Druckdaten für Tests.

import type { DeliveryNotePrintData, InvoicePrintData, PrintRepository } from "../modules/print/print.service.js";

export class InMemoryPrintRepository implements PrintRepository {
  deliveryNotes: Record<string, DeliveryNotePrintData> = {};
  invoices: Record<string, InvoicePrintData> = {};
  briefkopfLines: string[] = [];
  async deliveryNoteForPrint(id: string): Promise<DeliveryNotePrintData | null> { return this.deliveryNotes[id] ?? null; }
  async invoiceForPrint(id: string): Promise<InvoicePrintData | null> { return this.invoices[id] ?? null; }
  async briefkopf(): Promise<string[]> { return this.briefkopfLines; }
}
