// Angebots-Erfolgsquote / Conversion-Verfolgung (Kap. 35.1). Reine Aggregation der
// Angebote zu Gewonnen/Verloren/Offen, Win-Rate und Verlustgrund-Aufschlüsselung —
// für das Vertriebs-Reporting. IO-frei; die Datenpunkte liefert das Repository.

import { filterByRange, type DateRange } from "./reporting.js";
import type { QuoteStatus } from "./quote.js";

export interface QuotePoint {
  at: Date;
  status: QuoteStatus;
  verlustgrund: string | null;
  /** Angebotswert netto (Summe der Positionen) in Cent. */
  netCents: number;
}

export interface QuoteConversion {
  total: number;
  won: number; // ANGENOMMEN
  lost: number; // ABGELEHNT
  open: number; // ENTWURF | VERSENDET | NACHFASSEN
  /** Gewonnen / (Gewonnen + Verloren), in Prozent (0 wenn keine entschiedenen). */
  winRatePercent: number;
  quotedNetCents: number; // Gesamtwert aller Angebote
  wonNetCents: number; // Wert der gewonnenen Angebote
  /** Verlustgründe absteigend nach Häufigkeit. */
  lossReasons: Array<{ reason: string; count: number }>;
}

/** Verdichtet Angebots-Datenpunkte (optional auf einen Zeitraum gefiltert). */
export function summarizeQuoteConversion(points: ReadonlyArray<QuotePoint>, range?: DateRange): QuoteConversion {
  const rows = filterByRange(points as ReadonlyArray<QuotePoint & { at: Date }>, range);
  let won = 0;
  let lost = 0;
  let open = 0;
  let quotedNetCents = 0;
  let wonNetCents = 0;
  const reasons = new Map<string, number>();
  for (const q of rows) {
    quotedNetCents += q.netCents;
    if (q.status === "ANGENOMMEN") {
      won += 1;
      wonNetCents += q.netCents;
    } else if (q.status === "ABGELEHNT") {
      lost += 1;
      const r = (q.verlustgrund ?? "").trim() || "ohne Angabe";
      reasons.set(r, (reasons.get(r) ?? 0) + 1);
    } else {
      open += 1;
    }
  }
  const decided = won + lost;
  return {
    total: rows.length,
    won,
    lost,
    open,
    winRatePercent: decided > 0 ? Math.round((won / decided) * 100) : 0,
    quotedNetCents,
    wonNetCents,
    lossReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}
