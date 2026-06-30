// PayPal-Zahlungseingänge — reine, IO-freie Normalisierung (Kap. 9.4, PaymentSource PAYPAL).
// Übersetzt PayPal-Reporting-Datensätze (Activity-CSV oder Transactions-API-JSON) in
// `PaypalCredit` und weiter in die quellen-agnostische Abgleich-Pipeline
// (BankingImportService.importCredits). PayPal-Besonderheiten gegenüber der Bank:
//   - die PayPal-GEBÜHR wird separat als Aufwand geführt (nicht im OP-Abgleich),
//   - FREMDWÄHRUNG/Wechselkurs wird mitgeführt (sonst stimmt der DATEV-Export nicht).
// Der OP wird über das BRUTTO geschlossen (was der Kunde gezahlt hat); der Netto-Auszahlbetrag
// (Brutto − Gebühr) ist eine reine Liquiditätsgröße.

import { parseCsv } from "./csv.js";
import type { Cents } from "./money.js";
import { parseEuroInput, roundCents } from "./money.js";

/** Bereits geparster PayPal-Transaktionsdatensatz (signierte Beträge wie im Report). */
export interface PaypalTxn {
  transactionId: string;
  /** Brutto, signiert: + = empfangen, − = Rückzahlung/Auszahlung. */
  grossCents: Cents;
  /** PayPal-Gebühr, signiert (i. d. R. ≤ 0). */
  feeCents: Cents;
  /** ISO-4217 (EUR, USD …). */
  currency: string;
  status?: string;
  type?: string;
  payerName?: string;
  /** Rechnungsnummer / Verwendungszweck / Hinweis. */
  invoiceNumber?: string;
  /** Buchungsdatum (ISO-String, falls vorhanden). */
  bookedAt?: string;
}

/** Normalisierte PayPal-Gutschrift für die Abgleich-Pipeline (Beträge positiv). */
export interface PaypalCredit {
  externalRef: string;
  reference: string;
  /** Brutto (klärt den OP). */
  amountCents: Cents;
  /** PayPal-Gebühr als positiver Aufwand. */
  feeCents: Cents;
  currency: string;
  payerName?: string;
  bookedAt?: string;
}

/** PayPal-Status, die einen abgeschlossenen Geldeingang markieren. */
function isCompleted(status: string | undefined): boolean {
  if (!status) return true; // ohne Statusfeld nicht ausschließen
  const s = status.trim().toLowerCase();
  return s === "abgeschlossen" || s === "completed" || s === "succeeded";
}

/**
 * Filtert echte Geldeingänge (Brutto > 0, abgeschlossen) und normalisiert sie.
 * Rückzahlungen/Auszahlungen (Brutto ≤ 0), Gebührenzeilen und offene/zurückgehaltene
 * Posten werden nicht als OP-Gutschrift behandelt.
 */
export function paypalCredits(txns: ReadonlyArray<PaypalTxn>): PaypalCredit[] {
  return txns
    .filter((t) => t.grossCents > 0 && isCompleted(t.status))
    .map((t) => ({
      externalRef: t.transactionId,
      reference: t.invoiceNumber ?? "",
      amountCents: t.grossCents,
      feeCents: Math.abs(t.feeCents ?? 0),
      currency: (t.currency || "EUR").toUpperCase(),
      ...(t.payerName ? { payerName: t.payerName } : {}),
      ...(t.bookedAt ? { bookedAt: t.bookedAt } : {}),
    }));
}

// ── CSV-Parsing (PayPal-Aktivitäten-Export, DE/EN) ────────────────────────────

const HEADER_ALIASES: Record<keyof Omit<PaypalTxn, "grossCents" | "feeCents">, string[]> & {
  gross: string[];
  fee: string[];
} = {
  transactionId: ["transaktionscode", "transaction id", "transaktions-id", "transaktionsnr"],
  gross: ["brutto", "gross"],
  fee: ["gebühr", "gebuehr", "fee"],
  currency: ["währung", "waehrung", "currency"],
  status: ["status"],
  type: ["typ", "type"],
  payerName: ["name", "absender", "from email address", "von e-mail-adresse"],
  invoiceNumber: ["rechnungsnummer", "invoice number", "rechnungs-nr.", "custom number", "hinweis", "note", "betreff", "subject", "artikelbezeichnung"],
  bookedAt: ["datum", "date"],
};

function buildHeaderIndex(headers: string[]): Map<string, number> {
  const idx = new Map<string, number>();
  headers.forEach((h, i) => {
    const norm = h.trim().toLowerCase();
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(norm) && !idx.has(field)) idx.set(field, i);
    }
  });
  return idx;
}

function moneyToCents(raw: string | undefined): Cents {
  if (!raw) return 0;
  const v = parseEuroInput(raw); // robust für „1.234,56" und „-0,53"
  return v == null ? 0 : roundCents(v * 100);
}

/**
 * Parst einen PayPal-Aktivitäten-CSV-Export (Spaltenköpfe DE oder EN) zu `PaypalTxn[]`.
 * Unbekannte/leere Spalten werden toleriert; nur Zeilen mit Transaktionscode + Brutto
 * werden übernommen.
 */
export function parsePaypalCsv(text: string): PaypalTxn[] {
  const { headers, rows } = parseCsv(text);
  const idx = buildHeaderIndex(headers);
  const at = (row: string[], field: string): string | undefined => {
    const i = idx.get(field);
    return i == null ? undefined : row[i]?.trim();
  };
  const out: PaypalTxn[] = [];
  for (const row of rows) {
    const transactionId = at(row, "transactionId");
    const grossRaw = at(row, "gross");
    if (!transactionId || grossRaw == null || grossRaw === "") continue;
    out.push({
      transactionId,
      grossCents: moneyToCents(grossRaw),
      feeCents: moneyToCents(at(row, "fee")),
      currency: at(row, "currency") || "EUR",
      ...(at(row, "status") ? { status: at(row, "status") } : {}),
      ...(at(row, "type") ? { type: at(row, "type") } : {}),
      ...(at(row, "payerName") ? { payerName: at(row, "payerName") } : {}),
      ...(at(row, "invoiceNumber") ? { invoiceNumber: at(row, "invoiceNumber") } : {}),
      ...(at(row, "bookedAt") ? { bookedAt: at(row, "bookedAt") } : {}),
    });
  }
  return out;
}

/**
 * Bequemer Einstieg: PayPal-CSV → normalisierte Gutschriften (nur echte Eingänge).
 */
export function paypalCreditsFromCsv(text: string): PaypalCredit[] {
  return paypalCredits(parsePaypalCsv(text));
}
