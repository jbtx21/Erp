// In-Memory-Druckdaten für Tests.

import type { CompanyDataSheetData, CreditNotePrintData, DeliveryNotePrintData, InvoicePrintData, LaufzettelPrintData, MahnungPrintData, OrderConfirmationPrintData, PrintRepository, QuotePrintData, SupplierDataSheetData } from "../modules/print/print.service.js";

export class InMemoryPrintRepository implements PrintRepository {
  deliveryNotes: Record<string, DeliveryNotePrintData> = {};
  invoices: Record<string, InvoicePrintData> = {};
  creditNotes: Record<string, CreditNotePrintData> = {};
  mahnungen: Record<string, MahnungPrintData> = {};
  laufzettel: Record<string, LaufzettelPrintData> = {};
  quotes: Record<string, QuotePrintData> = {};
  orderConfirmations: Record<string, OrderConfirmationPrintData> = {};
  companies: Record<string, CompanyDataSheetData> = {};
  suppliers: Record<string, SupplierDataSheetData> = {};
  briefkopfLines: string[] = [];
  async companyForDataSheet(companyId: string): Promise<CompanyDataSheetData | null> { return this.companies[companyId] ?? null; }
  async supplierForDataSheet(supplierId: string): Promise<SupplierDataSheetData | null> { return this.suppliers[supplierId] ?? null; }
  async deliveryNoteForPrint(id: string): Promise<DeliveryNotePrintData | null> { return this.deliveryNotes[id] ?? null; }
  async creditNoteForPrint(id: string): Promise<CreditNotePrintData | null> { return this.creditNotes[id] ?? null; }
  async mahnungForPrint(id: string): Promise<MahnungPrintData | null> { return this.mahnungen[id] ?? null; }
  async sampleLoanForPrint(loanId: string): Promise<DeliveryNotePrintData | null> { return this.deliveryNotes[loanId] ?? null; }
  async invoiceForPrint(id: string): Promise<InvoicePrintData | null> { return this.invoices[id] ?? null; }
  async laufzettelForPrint(orderId: string): Promise<LaufzettelPrintData | null> { return this.laufzettel[orderId] ?? null; }
  async quoteForPrint(id: string): Promise<QuotePrintData | null> { return this.quotes[id] ?? null; }
  async orderConfirmationForPrint(orderId: string): Promise<OrderConfirmationPrintData | null> { return this.orderConfirmations[orderId] ?? null; }
  async briefkopf(): Promise<string[]> { return this.briefkopfLines; }
}
