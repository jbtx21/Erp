// DATEV-Export (Buchungsstapel) — Kap. 9.2. Testfall T-07 (Übergabe an ADDISON).
// ERP = Rechnungs-/Nummern-Master (Kap. 19); die Fibu erhält Buchungssätze.
// An Xentrals Accounting-Domäne orientiert (payment-transaction / general-ledger).
// Reiner Builder + CSV-Serialisierung (DATEV EXTF Buchungsstapel, vereinfacht).

import type { Cents } from "./money.js";

export type SollHaben = "S" | "H";

/** Ein DATEV-Buchungssatz (Kernfelder des EXTF-Buchungsstapels). */
export interface DatevBuchung {
  /** Umsatz immer positiv, Richtung über sollHaben. */
  umsatzCents: Cents;
  sollHaben: SollHaben;
  /** Konto (z. B. Debitorenkonto des Kunden / Aufwandskonto bei ER). */
  konto: string;
  /** Gegenkonto (z. B. Erlöskonto / Kreditorenkonto bei ER). */
  gegenkonto: string;
  /** BU-/Steuerschlüssel (z. B. "" = automatisch, "9" = 19% USt/VSt). */
  buSchluessel: string;
  /** Belegdatum als Date; serialisiert zu TTMM. */
  belegdatum: Date;
  /** Belegfeld 1 = Rechnungsnummer. */
  belegfeld1: string;
  /** Belegfeld 2 (optional) = Kunden-/Lieferantennummer o. Ä. (Belegfeld-Mapping). */
  belegfeld2?: string;
  buchungstext: string;
}

/** Erlöskonto je Steuersatz (SKR03-Defaults; konfigurierbar). */
export interface ErloeskontoMap {
  /** 19% USt. */
  standard: string;
  /** 7% USt. */
  reduced: string;
}

export interface InvoiceForDatev {
  number: string;
  issuedAt: Date;
  /** Debitorenkonto des Kunden. */
  debitorKonto: string;
  /** Netto/Steuer je Satz (aus buildInvoiceTotals.taxByRate). */
  taxByRate: ReadonlyArray<{ rate: number; netCents: Cents }>;
  /** Belegfeld 2 (z. B. Kundennummer). */
  belegfeld2?: string;
}

export interface CreditNoteForDatev {
  number: string;
  issuedAt: Date;
  /** Debitorenkonto des Kunden (identisch zur Originalrechnung). */
  debitorKonto: string;
  /** Originalrechnungs-Nummer (für den Buchungstext-Bezug). */
  originalInvoiceNumber?: string;
  /** Netto je Satz (aus buildInvoiceTotals.taxByRate der Gutschrift). */
  taxByRate: ReadonlyArray<{ rate: number; netCents: Cents }>;
  /** Belegfeld 2 (z. B. Kundennummer). */
  belegfeld2?: string;
}

/**
 * Eingangsrechnung/Verbindlichkeit (kreditorische Seite, Kap. 9.2). Buchung
 * „Aufwand (Soll) an Kreditor" je Steuersatz; die Vorsteuer ermittelt DATEV aus
 * Kontofunktion (Aufwand) + BU-Schlüssel.
 */
export interface IncomingInvoiceForDatev {
  number: string;
  issuedAt: Date;
  /** Kreditorenkonto des Lieferanten (oder Sammelkreditor). */
  kreditorKonto: string;
  /** Aufwandskonto (Wareneingang/Fremdleistung). */
  aufwandskonto: string;
  /** Netto je Satz (aus den ER-Beträgen). */
  taxByRate: ReadonlyArray<{ rate: number; netCents: Cents }>;
  /** Lieferantenname für den Buchungstext. */
  supplierName?: string;
  /** Belegfeld 2 (z. B. Lieferantennummer). */
  belegfeld2?: string;
}

const BU_BY_RATE: Record<string, string> = {
  "0.19": "9", // 19% USt
  "0.07": "8", // 7% USt
};

// Vorsteuer-Schlüssel (Eingangsseite): identische Sätze; DATEV bucht Vorsteuer, weil
// das Aufwandskonto im Soll gegen das Kreditorenkonto läuft.
const VST_BU_BY_RATE: Record<string, string> = {
  "0.19": "9",
  "0.07": "8",
};

/**
 * Erzeugt Buchungssätze für eine Ausgangsrechnung: je Steuersatz eine Buchung
 * Debitor an Erlöskonto über den Netto-Betrag mit passendem BU-Schlüssel (die
 * Steuer ermittelt DATEV automatisch aus dem BU-Schlüssel).
 */
export function buchungenFromInvoice(
  inv: InvoiceForDatev,
  erloes: ErloeskontoMap
): DatevBuchung[] {
  return inv.taxByRate.map((t) => {
    const rateKey = t.rate.toFixed(2);
    return {
      umsatzCents: t.netCents,
      sollHaben: "S" as const,
      konto: inv.debitorKonto,
      gegenkonto: t.rate >= 0.19 ? erloes.standard : erloes.reduced,
      buSchluessel: BU_BY_RATE[rateKey] ?? "",
      belegdatum: inv.issuedAt,
      belegfeld1: inv.number,
      ...(inv.belegfeld2 ? { belegfeld2: inv.belegfeld2 } : {}),
      buchungstext: `Rechnung ${inv.number}`,
    };
  });
}

/**
 * Erzeugt Buchungssätze für eine Eingangsrechnung (Verbindlichkeit, Kap. 9.2): je
 * Steuersatz eine Buchung „Aufwand (SOLL) an Kreditor" über den Netto-Betrag mit
 * Vorsteuer-BU-Schlüssel. Spiegelt die debitorische Ausgangslogik auf die Kreditorseite.
 */
export function buchungenFromIncomingInvoice(ii: IncomingInvoiceForDatev): DatevBuchung[] {
  return ii.taxByRate.map((t) => ({
    umsatzCents: t.netCents,
    sollHaben: "S" as const, // Aufwand im Soll
    konto: ii.aufwandskonto,
    gegenkonto: ii.kreditorKonto,
    buSchluessel: VST_BU_BY_RATE[t.rate.toFixed(2)] ?? "",
    belegdatum: ii.issuedAt,
    belegfeld1: ii.number,
    ...(ii.belegfeld2 ? { belegfeld2: ii.belegfeld2 } : {}),
    buchungstext: ii.supplierName ? `ER ${ii.number} ${ii.supplierName}` : `Eingangsrechnung ${ii.number}`,
  }));
}

/**
 * Erzeugt Buchungssätze für eine Gutschrift/Storno (Kap. 9.1/20): wie die
 * Originalrechnung, aber mit umgekehrter Richtung (sollHaben "H" — Storno der
 * Forderung + Erlösminderung). Der Umsatz bleibt POSITIV; die Richtung trägt
 * allein das Soll/Haben-Kennzeichen (genau deshalb ist `Math.abs` in datevAmount
 * korrekt — DATEV-001/GoBD: kein stiller Vorzeichenverlust bei Gutschriften).
 */
export function buchungenFromCreditNote(
  cn: CreditNoteForDatev,
  erloes: ErloeskontoMap
): DatevBuchung[] {
  return cn.taxByRate.map((t) => {
    const rateKey = t.rate.toFixed(2);
    return {
      umsatzCents: t.netCents,
      sollHaben: "H" as const,
      konto: cn.debitorKonto,
      gegenkonto: t.rate >= 0.19 ? erloes.standard : erloes.reduced,
      buSchluessel: BU_BY_RATE[rateKey] ?? "",
      belegdatum: cn.issuedAt,
      belegfeld1: cn.number,
      ...(cn.belegfeld2 ? { belegfeld2: cn.belegfeld2 } : {}),
      buchungstext: cn.originalInvoiceNumber
        ? `Gutschrift ${cn.number} zu ${cn.originalInvoiceNumber}`
        : `Gutschrift ${cn.number}`,
    };
  });
}

/** Norm-USt-Sätze (DE): steuerfrei, 7 %, 19 %. */
const STANDARD_RATES = [0, 0.07, 0.19] as const;

/**
 * Snappt einen effektiven USt-Satz (taxCents/netCents) auf den nächsten Normsatz.
 * Rundungsdifferenzen aus der Cent-Arithmetik dürfen den Steuerschlüssel nicht verschieben.
 */
export function snapTaxRate(effective: number): number {
  return STANDARD_RATES.reduce((best, r) =>
    Math.abs(r - effective) < Math.abs(best - effective) ? r : best, STANDARD_RATES[0]);
}

/** Netto-je-Satz einer Ausgangsrechnung aus Netto/Steuer-Summe (zentrale USt, ein Satz). */
export function invoiceTaxByRate(netCents: Cents, taxCents: Cents): Array<{ rate: number; netCents: Cents }> {
  const rate = netCents > 0 ? snapTaxRate(taxCents / netCents) : 0;
  return [{ rate, netCents }];
}

/**
 * Netto-je-Satz einer Gutschrift: deren `amountCents` ist BRUTTO (grossCents − bereits
 * gutgeschrieben). Der Satz stammt aus der Originalrechnung; das Netto wird zurückgerechnet
 * (net = brutto / (1+satz)). Bei Vollgutschrift = exakt der Rechnungs-Netto.
 */
export function creditNoteTaxByRate(
  grossCents: Cents,
  invoiceNetCents: Cents,
  invoiceTaxCents: Cents
): Array<{ rate: number; netCents: Cents }> {
  const rate = invoiceNetCents > 0 ? snapTaxRate(invoiceTaxCents / invoiceNetCents) : 0;
  return [{ rate, netCents: Math.round(grossCents / (1 + rate)) }];
}

export interface DatevStapelInput {
  invoices: ReadonlyArray<InvoiceForDatev>;
  creditNotes: ReadonlyArray<CreditNoteForDatev>;
  /** Eingangsrechnungen/Verbindlichkeiten (kreditorische Seite). Optional. */
  incomingInvoices?: ReadonlyArray<IncomingInvoiceForDatev>;
  erloes: ErloeskontoMap;
}

/**
 * Baut den vollständigen DATEV-Buchungsstapel einer Periode: Ausgangsrechnungen
 * (Debitor an Erlös, SOLL), Gutschriften (Erlösminderung, HABEN) und Eingangsrechnungen
 * (Aufwand an Kreditor, SOLL). Reine Komposition der Einzel-Builder — die Serialisierung
 * übernimmt `toDatevCsv` bzw. `toDatevXml`.
 */
export function buildDatevStapel(input: DatevStapelInput): DatevBuchung[] {
  return [
    ...input.invoices.flatMap((i) => buchungenFromInvoice(i, input.erloes)),
    ...input.creditNotes.flatMap((c) => buchungenFromCreditNote(c, input.erloes)),
    ...(input.incomingInvoices ?? []).flatMap((ii) => buchungenFromIncomingInvoice(ii)),
  ];
}

function ttmm(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}`;
}

/** DATEV-Betragsformat: Euro mit Komma, immer positiv. */
function datevAmount(cents: Cents): string {
  return (Math.abs(cents) / 100).toFixed(2).replace(".", ",");
}

function csvField(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

/**
 * Serialisiert Buchungssätze als DATEV-Buchungszeilen (Semikolon-getrennt).
 * Spaltenfolge entspricht dem EXTF-Buchungsstapel-Kern:
 * Umsatz;S/H;Konto;Gegenkonto;BU;Belegdatum;Belegfeld1;Belegfeld2;Buchungstext
 */
export function toDatevCsv(buchungen: ReadonlyArray<DatevBuchung>): string {
  const header = [
    "Umsatz",
    "Soll/Haben-Kennzeichen",
    "Konto",
    "Gegenkonto",
    "BU-Schlüssel",
    "Belegdatum",
    "Belegfeld 1",
    "Belegfeld 2",
    "Buchungstext",
  ].join(";");

  const rows = buchungen.map((b) =>
    [
      datevAmount(b.umsatzCents),
      b.sollHaben,
      b.konto,
      b.gegenkonto,
      b.buSchluessel,
      ttmm(b.belegdatum),
      csvField(b.belegfeld1),
      csvField(b.belegfeld2 ?? ""),
      csvField(b.buchungstext),
    ].join(";")
  );

  return [header, ...rows].join("\r\n");
}

function xmlEscape(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Serialisiert denselben Buchungsstapel als wohlgeformtes XML — die XML-Variante für
 * XML-basierte FiBu-Importe bzw. DATEV-Unternehmen-Online-Vorsysteme (alternativ zur CSV).
 * Beträge in Euro mit Punkt-Dezimaltrenner (maschinenlesbar), Datum ISO-8601.
 */
export function toDatevXml(buchungen: ReadonlyArray<DatevBuchung>): string {
  const lines = buchungen.map((b) => {
    const attrs = [
      `umsatz="${(Math.abs(b.umsatzCents) / 100).toFixed(2)}"`,
      `sollHaben="${b.sollHaben}"`,
      `konto="${xmlEscape(b.konto)}"`,
      `gegenkonto="${xmlEscape(b.gegenkonto)}"`,
      `buSchluessel="${xmlEscape(b.buSchluessel)}"`,
      `belegdatum="${isoDate(b.belegdatum)}"`,
      `belegfeld1="${xmlEscape(b.belegfeld1)}"`,
      ...(b.belegfeld2 ? [`belegfeld2="${xmlEscape(b.belegfeld2)}"`] : []),
      `buchungstext="${xmlEscape(b.buchungstext)}"`,
    ].join(" ");
    return `  <Buchung ${attrs} />`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Buchungsstapel format="EXTF" anzahl="${buchungen.length}">`,
    ...lines,
    "</Buchungsstapel>",
  ].join("\n");
}
