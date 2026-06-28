// In-Memory-Repository der Ausgangs-E-Rechnung für Unit-Tests/Dev.

import type { EInvoiceData, EInvoiceRepository } from "../modules/einvoice/einvoice.service.js";

export class InMemoryEInvoiceRepository implements EInvoiceRepository {
  readonly persisted = new Map<string, string>();
  constructor(private readonly data: Record<string, EInvoiceData> = {}) {}

  async invoiceForEInvoice(invoiceId: string): Promise<EInvoiceData | null> {
    return this.data[invoiceId] ?? null;
  }

  async persistXml(invoiceId: string, xml: string): Promise<void> {
    this.persisted.set(invoiceId, xml);
  }
}
