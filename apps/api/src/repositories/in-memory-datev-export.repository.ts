// In-Memory-DATEV-Export-Repository für Unit-Tests/Dev. Hält Rechnungen + Gutschriften
// als einfache Listen und filtert nach Belegdatum im Zeitraum.

import type {
  DatevCreditNoteRow,
  DatevExportRepository,
  DatevInvoiceRow,
} from "../modules/datev-export/datev-export.service.js";

export class InMemoryDatevExportRepository implements DatevExportRepository {
  constructor(
    private readonly invoices: DatevInvoiceRow[] = [],
    private readonly creditNotes: DatevCreditNoteRow[] = []
  ) {}

  async invoicesInPeriod(from: Date, to: Date): Promise<DatevInvoiceRow[]> {
    return this.invoices.filter((i) => inPeriod(i.issuedAt, from, to));
  }

  async creditNotesInPeriod(from: Date, to: Date): Promise<DatevCreditNoteRow[]> {
    return this.creditNotes.filter((c) => inPeriod(c.createdAt, from, to));
  }
}

function inPeriod(at: Date, from: Date, to: Date): boolean {
  return at.getTime() >= from.getTime() && at.getTime() <= to.getTime();
}
