// Lückenlose Belegnummern (GoBD, Kap. 10/19). Reine Formatierung — die atomare,
// lückenlose Vergabe der laufenden Nummer liegt in der Repository-Schicht
// (transaktional, s. apps/api). Vorbild: Odoo ir.sequence / ERPNext naming series.
// Grundsatz: ERP ist Master des Nummernkreises (Kap. 19); je Belegart und Jahr ein
// eigener, lückenloser Kreis.

/** Belegart mit eigenem Nummernkreis. */
export type SequenceKey =
  | "INVOICE"
  | "CREDIT_NOTE"
  | "ORDER"
  | "QUOTE"
  | "INQUIRY"
  | "PURCHASE_ORDER"
  | "DELIVERY_NOTE"
  | "PRODUCTION_ORDER"
  | "CASH_RECEIPT";

/** Standard-Präfix je Belegart (DE-üblich). */
export const SEQUENCE_PREFIX: Record<SequenceKey, string> = {
  INVOICE: "RE",
  CREDIT_NOTE: "GS",
  ORDER: "AB",
  QUOTE: "AN",
  INQUIRY: "AF",
  PURCHASE_ORDER: "BE",
  DELIVERY_NOTE: "LS",
  PRODUCTION_ORDER: "PA",
  CASH_RECEIPT: "BON",
};

export interface FormatOptions {
  /** Mindestbreite der laufenden Nummer (links mit 0 aufgefüllt). Default 4. */
  pad?: number;
}

/** Formatiert eine Belegnummer als `<PREFIX>-<JAHR>-<NNNN>`. */
export function formatNumber(
  prefix: string,
  year: number,
  seq: number,
  opts: FormatOptions = {}
): string {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`seq must be a positive integer, got ${String(seq)}`);
  }
  if (!Number.isInteger(year) || year < 2000) {
    throw new Error(`invalid year: ${String(year)}`);
  }
  const pad = opts.pad ?? 4;
  return `${prefix}-${year}-${String(seq).padStart(pad, "0")}`;
}

/** Belegnummer für eine bekannte Belegart (nutzt das Standard-Präfix). */
export function formatSequenceNumber(
  key: SequenceKey,
  year: number,
  seq: number,
  opts?: FormatOptions
): string {
  return formatNumber(SEQUENCE_PREFIX[key], year, seq, opts);
}
