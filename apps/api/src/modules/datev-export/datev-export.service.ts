// DATEV-Export (Buchungsstapel) — Kap. 9.2, T-07. Verdrahtet die reinen Builder
// (@texma/shared/datev) gegen die Belege einer Periode: Ausgangsrechnungen (Debitor an
// Erlös, SOLL) + Gutschriften (Erlösminderung, HABEN) → ein DATEV-CSV (EXTF-Buchungsstapel).
// ERP = Rechnungs-/Nummern-Master (Kap. 19); die Fibu/ADDISON erhält die Buchungssätze.
// Reine Leseanalyse über das Repository-Interface (testbar ohne DB); der Export wird auditiert.

import {
  buildDatevStapel,
  creditNoteTaxByRate,
  erloeskonto,
  invoiceTaxByRate,
  konto,
  toDatevCsv,
  type Kontenrahmen,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

/** Ausgangsrechnung der Periode (Felder für den DATEV-Buchungssatz). */
export interface DatevInvoiceRow {
  number: string;
  issuedAt: Date;
  netCents: number;
  taxCents: number;
  /** Debitorenkonto des Kunden; null → Sammeldebitor (Fallback). */
  debitorKonto: string | null;
}

/** Gutschrift der Periode; `amountCents` ist BRUTTO, der Satz stammt aus der Originalrechnung. */
export interface DatevCreditNoteRow {
  number: string;
  createdAt: Date;
  amountCents: number;
  debitorKonto: string | null;
  invoiceNumber: string;
  invoiceNetCents: number;
  invoiceTaxCents: number;
}

export interface DatevExportRepository {
  /** Finalisierte Ausgangsrechnungen mit Belegdatum im Zeitraum [from, to]. */
  invoicesInPeriod(from: Date, to: Date): Promise<DatevInvoiceRow[]>;
  /** Gutschriften mit Belegdatum im Zeitraum [from, to] (inkl. Originalrechnungs-Bezug). */
  creditNotesInPeriod(from: Date, to: Date): Promise<DatevCreditNoteRow[]>;
}

export interface DatevExportInput {
  from: Date;
  to: Date;
  kontenrahmen: Kontenrahmen;
}

export interface DatevExportResult {
  csv: string;
  filename: string;
  invoiceCount: number;
  creditNoteCount: number;
  buchungCount: number;
}

export class DatevExportService {
  constructor(
    private readonly repo: DatevExportRepository,
    private readonly audit: AuditSink
  ) {}

  /** Baut den DATEV-Buchungsstapel der Periode und gibt ihn als CSV + Kennzahlen zurück. */
  async export(input: DatevExportInput): Promise<DatevExportResult> {
    const { from, to, kontenrahmen } = input;
    if (from.getTime() > to.getTime()) throw new Error("Zeitraum ungültig: 'von' liegt nach 'bis'.");

    const [invoices, creditNotes] = await Promise.all([
      this.repo.invoicesInPeriod(from, to),
      this.repo.creditNotesInPeriod(from, to),
    ]);

    // Erlöskonten je Satz + Sammeldebitor-Fallback aus dem gewählten Kontenrahmen (SKR03/04).
    const erloes = { standard: erloeskonto(kontenrahmen, 0.19), reduced: erloeskonto(kontenrahmen, 0.07) };
    const sammeldebitor = konto(kontenrahmen, "debitoren");

    const buchungen = buildDatevStapel({
      erloes,
      invoices: invoices.map((i) => ({
        number: i.number,
        issuedAt: i.issuedAt,
        debitorKonto: i.debitorKonto ?? sammeldebitor,
        taxByRate: invoiceTaxByRate(i.netCents, i.taxCents),
      })),
      creditNotes: creditNotes.map((c) => ({
        number: c.number,
        issuedAt: c.createdAt,
        debitorKonto: c.debitorKonto ?? sammeldebitor,
        originalInvoiceNumber: c.invoiceNumber,
        taxByRate: creditNoteTaxByRate(c.amountCents, c.invoiceNetCents, c.invoiceTaxCents),
      })),
    });

    const csv = toDatevCsv(buchungen);
    const filename = `DATEV_Buchungsstapel_${iso(from)}_${iso(to)}_${kontenrahmen}.csv`;

    // GoBD: jeder Export wird protokolliert (wer/wann/Umfang) — kein stiller Datenabfluss.
    await this.audit.append(
      buildEntry({
        entity: "DatevExport",
        entityId: filename,
        action: "EXPORT",
        after: { from: iso(from), to: iso(to), kontenrahmen, invoiceCount: invoices.length, creditNoteCount: creditNotes.length, buchungCount: buchungen.length },
      })
    );

    return { csv, filename, invoiceCount: invoices.length, creditNoteCount: creditNotes.length, buchungCount: buchungen.length };
  }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
