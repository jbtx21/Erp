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
  /** Konto (z. B. Debitorenkonto des Kunden). */
  konto: string;
  /** Gegenkonto (z. B. Erlöskonto). */
  gegenkonto: string;
  /** BU-/Steuerschlüssel (z. B. "" = automatisch, "9" = 19% USt). */
  buSchluessel: string;
  /** Belegdatum als Date; serialisiert zu TTMM. */
  belegdatum: Date;
  /** Belegfeld 1 = Rechnungsnummer. */
  belegfeld1: string;
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
}

const BU_BY_RATE: Record<string, string> = {
  "0.19": "9", // 19% USt
  "0.07": "8", // 7% USt
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
      buchungstext: `Rechnung ${inv.number}`,
    };
  });
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
 * Umsatz;S/H;Konto;Gegenkonto;BU;Belegdatum;Belegfeld1;Buchungstext
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
      csvField(b.buchungstext),
    ].join(";")
  );

  return [header, ...rows].join("\r\n");
}
