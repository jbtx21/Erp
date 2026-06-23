// In-Memory-Druckdaten für Tests.

import type { DeliveryNotePrintData, InvoicePrintData, LaufzettelPrintData, PrintRepository } from "../modules/print/print.service.js";

export class InMemoryPrintRepository implements PrintRepository {
  deliveryNotes: Record<string, DeliveryNotePrintData> = {};
  invoices: Record<string, InvoicePrintData> = {};
  laufzettel: Record<string, LaufzettelPrintData> = {};
  briefkopfLines: string[] = [];
  async deliveryNoteForPrint(id: string): Promise<DeliveryNotePrintData | null> { return this.deliveryNotes[id] ?? null; }
  async invoiceForPrint(id: string): Promise<InvoicePrintData | null> { return this.invoices[id] ?? null; }
  async laufzettelForPrint(orderId: string): Promise<LaufzettelPrintData | null> { return this.laufzettel[orderId] ?? null; }
  async briefkopf(): Promise<string[]> { return this.briefkopfLines; }
}
