// DATEV-Export (Buchungsstapel) — Kap. 9.2, T-07. Verdrahtet die reinen Builder
// (@texma/shared/datev) gegen die Belege einer Periode: Ausgangsrechnungen (Debitor an
// Erlös, SOLL), Gutschriften (Erlösminderung, HABEN) UND Eingangsrechnungen/Verbindlichkeiten
// (Aufwand an Kreditor, SOLL) → ein DATEV-Buchungsstapel als CSV (EXTF) oder XML.
// „bereits exportiert"-Guard: jeder übernommene Beleg wird protokolliert; Folge-Exporte
// überspringen ihn (kein Doppelbuchen). ERP = Rechnungs-/Nummern-Master (Kap. 19).
// Reine Leseanalyse über das Repository-Interface (testbar ohne DB); der Export wird auditiert.

import {
  buildDatevStapel,
  creditNoteTaxByRate,
  erloeskonto,
  invoiceTaxByRate,
  konto,
  snapTaxRate,
  toDatevCsv,
  toDatevXml,
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
  /** Belegfeld 2 (z. B. Kundennummer). */
  belegfeld2?: string | null;
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
  belegfeld2?: string | null;
}

/** Eingangsrechnung/Verbindlichkeit der Periode (kreditorische Seite). */
export interface DatevIncomingInvoiceRow {
  /** Stabiler Belegschlüssel für den Export-Guard (IncomingInvoice.id). */
  id: string;
  number: string;
  issuedAt: Date;
  netCents: number;
  taxCents: number;
  /** Kreditorenkonto des Lieferanten; null → Sammelkreditor (Fallback). */
  kreditorKonto: string | null;
  /** Aufwandskonto; null → Wareneingang (Fallback). */
  aufwandskonto: string | null;
  supplierName?: string;
  belegfeld2?: string | null;
}

export interface DatevExportRepository {
  /** Finalisierte Ausgangsrechnungen mit Belegdatum im Zeitraum [from, to]. */
  invoicesInPeriod(from: Date, to: Date): Promise<DatevInvoiceRow[]>;
  /** Gutschriften mit Belegdatum im Zeitraum [from, to] (inkl. Originalrechnungs-Bezug). */
  creditNotesInPeriod(from: Date, to: Date): Promise<DatevCreditNoteRow[]>;
  /** Eingangsrechnungen/Verbindlichkeiten im Zeitraum [from, to]. Optional (Default leer). */
  incomingInvoicesInPeriod?(from: Date, to: Date): Promise<DatevIncomingInvoiceRow[]>;
  /** Bereits in einen Stapel übernommene Belegschlüssel (Guard). Optional (Default leer). */
  existingExportedKeys?(keys: string[]): Promise<Set<string>>;
  /** Protokolliert die übernommenen Belege (append-only). Optional. */
  recordExported?(entries: ReadonlyArray<{ belegart: string; belegKey: string }>, filename: string): Promise<void>;
}

export type DatevFormat = "csv" | "xml";

export interface DatevExportInput {
  from: Date;
  to: Date;
  kontenrahmen: Kontenrahmen;
  /** Ausgabeformat (Default csv = EXTF-Buchungsstapel). */
  format?: DatevFormat;
  /** Bereits exportierte Belege erneut einbeziehen (Default false = überspringen). */
  includeAlreadyExported?: boolean;
}

export interface DatevExportResult {
  /** Serialisierter Stapel (CSV oder XML, je nach format) — Feldname aus Abwärtskompatibilität. */
  csv: string;
  format: DatevFormat;
  filename: string;
  invoiceCount: number;
  creditNoteCount: number;
  incomingInvoiceCount: number;
  buchungCount: number;
  /** Anzahl wegen des Guards übersprungener (bereits exportierter) Belege. */
  skippedAlreadyExported: number;
}

const KEY = {
  invoice: (n: string) => `RECHNUNG:${n}`,
  creditNote: (n: string) => `GUTSCHRIFT:${n}`,
  incoming: (id: string) => `EINGANGSRECHNUNG:${id}`,
};

export class DatevExportService {
  constructor(
    private readonly repo: DatevExportRepository,
    private readonly audit: AuditSink
  ) {}

  /** Baut den DATEV-Buchungsstapel der Periode und gibt ihn als CSV/XML + Kennzahlen zurück. */
  async export(input: DatevExportInput): Promise<DatevExportResult> {
    const { from, to, kontenrahmen } = input;
    const format: DatevFormat = input.format ?? "csv";
    if (from.getTime() > to.getTime()) throw new Error("Zeitraum ungültig: 'von' liegt nach 'bis'.");

    const [invoices, creditNotes, incomingInvoices] = await Promise.all([
      this.repo.invoicesInPeriod(from, to),
      this.repo.creditNotesInPeriod(from, to),
      this.repo.incomingInvoicesInPeriod?.(from, to) ?? Promise.resolve([] as DatevIncomingInvoiceRow[]),
    ]);

    // „bereits exportiert"-Guard: Belegschlüssel sammeln und bereits exportierte herausfiltern.
    const allKeys = [
      ...invoices.map((i) => KEY.invoice(i.number)),
      ...creditNotes.map((c) => KEY.creditNote(c.number)),
      ...incomingInvoices.map((ii) => KEY.incoming(ii.id)),
    ];
    const exported = input.includeAlreadyExported
      ? new Set<string>()
      : (await this.repo.existingExportedKeys?.(allKeys)) ?? new Set<string>();

    const freshInvoices = invoices.filter((i) => !exported.has(KEY.invoice(i.number)));
    const freshCreditNotes = creditNotes.filter((c) => !exported.has(KEY.creditNote(c.number)));
    const freshIncoming = incomingInvoices.filter((ii) => !exported.has(KEY.incoming(ii.id)));
    const skippedAlreadyExported = allKeys.length - (freshInvoices.length + freshCreditNotes.length + freshIncoming.length);

    // Konten je Satz + Sammeldebitor/-kreditor/Wareneingang-Fallback aus dem Kontenrahmen (SKR03/04).
    const erloes = { standard: erloeskonto(kontenrahmen, 0.19), reduced: erloeskonto(kontenrahmen, 0.07) };
    const sammeldebitor = konto(kontenrahmen, "debitoren");
    const sammelkreditor = konto(kontenrahmen, "kreditoren");
    const wareneingang = konto(kontenrahmen, "wareneingang");

    const buchungen = buildDatevStapel({
      erloes,
      invoices: freshInvoices.map((i) => ({
        number: i.number,
        issuedAt: i.issuedAt,
        debitorKonto: i.debitorKonto ?? sammeldebitor,
        taxByRate: invoiceTaxByRate(i.netCents, i.taxCents),
        ...(i.belegfeld2 ? { belegfeld2: i.belegfeld2 } : {}),
      })),
      creditNotes: freshCreditNotes.map((c) => ({
        number: c.number,
        issuedAt: c.createdAt,
        debitorKonto: c.debitorKonto ?? sammeldebitor,
        originalInvoiceNumber: c.invoiceNumber,
        taxByRate: creditNoteTaxByRate(c.amountCents, c.invoiceNetCents, c.invoiceTaxCents),
        ...(c.belegfeld2 ? { belegfeld2: c.belegfeld2 } : {}),
      })),
      incomingInvoices: freshIncoming.map((ii) => ({
        number: ii.number,
        issuedAt: ii.issuedAt,
        kreditorKonto: ii.kreditorKonto ?? sammelkreditor,
        aufwandskonto: ii.aufwandskonto ?? wareneingang,
        // ER trägt nur Netto/Steuer-Summe → ein Satz, auf den Normsatz gesnappt.
        taxByRate: [{ rate: ii.netCents > 0 ? snapTaxRate(ii.taxCents / ii.netCents) : 0, netCents: ii.netCents }],
        ...(ii.supplierName ? { supplierName: ii.supplierName } : {}),
        ...(ii.belegfeld2 ? { belegfeld2: ii.belegfeld2 } : {}),
      })),
    });

    const ext = format === "xml" ? "xml" : "csv";
    const filename = `DATEV_Buchungsstapel_${iso(from)}_${iso(to)}_${kontenrahmen}.${ext}`;
    const csv = format === "xml" ? toDatevXml(buchungen) : toDatevCsv(buchungen);

    // Guard fortschreiben: übernommene Belege protokollieren (kein Doppelbuchen im Folgelauf).
    const recordedKeys = [
      ...freshInvoices.map((i) => ({ belegart: "RECHNUNG", belegKey: i.number })),
      ...freshCreditNotes.map((c) => ({ belegart: "GUTSCHRIFT", belegKey: c.number })),
      ...freshIncoming.map((ii) => ({ belegart: "EINGANGSRECHNUNG", belegKey: ii.id })),
    ];
    if (recordedKeys.length > 0) await this.repo.recordExported?.(recordedKeys, filename);

    // GoBD: jeder Export wird protokolliert (wer/wann/Umfang) — kein stiller Datenabfluss.
    await this.audit.append(
      buildEntry({
        entity: "DatevExport",
        entityId: filename,
        action: "EXPORT",
        after: {
          from: iso(from), to: iso(to), kontenrahmen, format,
          invoiceCount: freshInvoices.length, creditNoteCount: freshCreditNotes.length,
          incomingInvoiceCount: freshIncoming.length, buchungCount: buchungen.length, skippedAlreadyExported,
        },
      })
    );

    return {
      csv, format, filename,
      invoiceCount: freshInvoices.length,
      creditNoteCount: freshCreditNotes.length,
      incomingInvoiceCount: freshIncoming.length,
      buchungCount: buchungen.length,
      skippedAlreadyExported,
    };
  }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
