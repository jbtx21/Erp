// Angebots-/Auftragssummen: Netto, USt (je Satz), Brutto und Deckungsbeitrag aus
// Positionen. Wiederverwendung der Faktura-Aggregation (buildInvoiceTotals), damit
// Angebot, Auftrag und Rechnung dieselbe Steuer-/Rundungslogik teilen (eine Quelle).
//
// Zwei Eigenheiten des Angebots ggü. der reinen Rechnung:
//  1. ALTERNATIVPOSITIONEN (isAlternative) zählen NICHT in die Beleg-/Auftragssumme —
//     der Kunde wählt eine davon; erst bei der Auftragswandlung wird die Wahl zur Position.
//  2. DECKUNGSBEITRAG je Position wird (sofern vorhanden) zur DB-Summe addiert; trägt
//     keine zählende Position einen DB, ist die Summe `null` (unbekannt, nicht 0).
import { buildInvoiceTotals, type InvoiceTotals, VAT_STANDARD } from "./invoice.js";
import { type Cents } from "./money.js";

/** Regelsteuersatz in Prozent (für UI-Defaults; intern rechnet invoice.ts mit Bruch). */
export const VAT_STANDARD_PCT = Math.round(VAT_STANDARD * 100); // 19

export interface QuoteTotalsLine {
  qty: number;
  /** Effektiver Netto-Einzelpreis NACH Positionsrabatt (Cent). */
  unitNetCents: Cents;
  /** USt-Satz in PROZENT (z. B. 19, 7). Default: Regelsatz. */
  taxRatePct?: number | null;
  /** Alternativposition — zählt nicht in die Summe. */
  isAlternative?: boolean;
  /** Deckungsbeitrag je Position (Cent), optional. */
  dbCents?: number | null;
}

export interface QuoteTotals extends InvoiceTotals {
  /** Summe Deckungsbeitrag über zählende Positionen; null, wenn keine Position DB trägt. */
  totalDbCents: number | null;
}

/** Effektiver Netto-Einzelpreis aus Listenpreis und Positionsrabatt (%). */
export function effectiveUnitNet(listNetCents: Cents, rabattPct?: number | null): Cents {
  const pct = Math.min(100, Math.max(0, rabattPct ?? 0));
  return Math.round(listNetCents * (1 - pct / 100));
}

const EMPTY: QuoteTotals = { lines: [], netCents: 0, taxCents: 0, grossCents: 0, taxByRate: [], totalDbCents: null };

/**
 * Belegsummen eines Angebots/Auftrags. Alternativpositionen bleiben außen vor.
 * Steuer wird je Zeile gerundet und je Satz aggregiert (saubere USt-Ausweisung).
 */
export function buildQuoteTotals(lines: ReadonlyArray<QuoteTotalsLine>): QuoteTotals {
  const counting = lines.filter((l) => !l.isAlternative);
  if (counting.length === 0) return EMPTY;

  const totals = buildInvoiceTotals(
    counting.map((l) => ({
      description: "",
      qty: l.qty,
      unitNetCents: l.unitNetCents,
      vatRate: (l.taxRatePct ?? VAT_STANDARD_PCT) / 100,
    }))
  );

  const dbLines = counting.filter((l) => l.dbCents != null);
  const totalDbCents = dbLines.length > 0 ? dbLines.reduce((s, l) => s + (l.dbCents ?? 0), 0) : null;

  return { ...totals, totalDbCents };
}
