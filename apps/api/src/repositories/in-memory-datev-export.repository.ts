// In-Memory-DATEV-Export-Repository für Unit-Tests/Dev. Hält Rechnungen, Gutschriften und
// Eingangsrechnungen als einfache Listen, filtert nach Belegdatum und führt den
// „bereits exportiert"-Guard als Set über die Belegschlüssel.

import type {
  DatevCreditNoteRow,
  DatevExportRepository,
  DatevIncomingInvoiceRow,
  DatevInvoiceRow,
} from "../modules/datev-export/datev-export.service.js";

export class InMemoryDatevExportRepository implements DatevExportRepository {
  private readonly exported = new Set<string>();

  constructor(
    private readonly invoices: DatevInvoiceRow[] = [],
    private readonly creditNotes: DatevCreditNoteRow[] = [],
    private readonly incomingInvoices: DatevIncomingInvoiceRow[] = []
  ) {}

  async invoicesInPeriod(from: Date, to: Date): Promise<DatevInvoiceRow[]> {
    return this.invoices.filter((i) => inPeriod(i.issuedAt, from, to));
  }

  async creditNotesInPeriod(from: Date, to: Date): Promise<DatevCreditNoteRow[]> {
    return this.creditNotes.filter((c) => inPeriod(c.createdAt, from, to));
  }

  async incomingInvoicesInPeriod(from: Date, to: Date): Promise<DatevIncomingInvoiceRow[]> {
    return this.incomingInvoices.filter((ii) => inPeriod(ii.issuedAt, from, to));
  }

  async existingExportedKeys(keys: string[]): Promise<Set<string>> {
    return new Set(keys.filter((k) => this.exported.has(k)));
  }

  async recordExported(entries: ReadonlyArray<{ belegart: string; belegKey: string }>): Promise<void> {
    for (const e of entries) this.exported.add(`${e.belegart}:${e.belegKey}`);
  }
}

function inPeriod(at: Date, from: Date, to: Date): boolean {
  return at.getTime() >= from.getTime() && at.getTime() <= to.getTime();
}
