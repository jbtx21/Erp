// Positionsmodell für Belege (Anfrage/Angebot/Auftrag) — reine, IO-freie Domänenlogik.
// Erweitert die einfache Positionsliste um STRUKTURZEILEN (Gruppenüberschrift, Zwischen-/
// Gruppensumme) nach Xentral-Vorbild und berechnet daraus die Belegsummen über die EINE
// vorhandene Steuer-/Rundungslogik (buildQuoteTotals → buildInvoiceTotals, USt je Satz).
//
// Trennung der Zeilentypen (Kap. 9.1):
//  - ARTIKEL        zählende Position (Textil/Veredelung/Sonstiges). Alternativen (isAlternative)
//                   zählen NICHT in die Beleg-/Auftragssumme.
//  - GRUPPE         fette Überschrift; beginnt einen Block (für Gruppensummen). Kein Betrag.
//  - ZWISCHENSUMME  Netto-Summe ALLER zählenden Positionen oberhalb (laufend, Xentral).
//  - GRUPPENSUMME   Netto-Summe der zählenden Positionen seit der letzten Gruppenüberschrift.

import { lineNet, type Cents } from "./money.js";
import type { PositionKind } from "./positions.js";
import { buildQuoteTotals, type QuoteTotals, type QuoteTotalsLine } from "./quote-totals.js";

/** Zeilentyp einer Belegposition. Default (fehlend) = ARTIKEL. */
export type LineType = "ARTIKEL" | "GRUPPE" | "ZWISCHENSUMME" | "GRUPPENSUMME";

/** Kanonische Belegposition (Cent-basiert, IO-frei). */
export interface PositionLine {
  /** Zeilentyp; fehlend = ARTIKEL. */
  lineType?: LineType;
  description: string;
  qty: number;
  /** Effektiver Netto-Einzelpreis NACH Positionsrabatt (Cent). */
  unitNetCents: Cents;
  /** USt-Satz in PROZENT (z. B. 19, 7, 0). Default: Regelsatz (in den Summen). */
  taxRatePct?: number | null;
  /** Alternativposition — zählt nicht in die Summe. */
  isAlternative?: boolean;
  /** Deckungsbeitrag je STÜCK (Cent), optional. */
  dbCents?: number | null;
  kind?: PositionKind;
}

/** Berechnetes Ergebnis je Zeile (für Summenzeilen der konkrete Netto-Wert). */
export interface PositionRowResult {
  index: number;
  lineType: LineType;
  /** Nur bei ZWISCHENSUMME/GRUPPENSUMME: der berechnete Netto-Betrag dieser Zeile. */
  computedNetCents?: Cents;
}

export interface PositionTotals extends QuoteTotals {
  /** Je Zeile (in Eingabereihenfolge) der Typ + berechnete Summen-Werte. */
  rows: PositionRowResult[];
}

/** Zeilentyp einer Position (Default ARTIKEL). */
export const lineTypeOf = (l: Pick<PositionLine, "lineType">): LineType => l.lineType ?? "ARTIKEL";

/** Nur ARTIKEL-Zeilen sind zählende Positionen (mit Menge/Preis/Steuer). */
export const isArticleLine = (l: Pick<PositionLine, "lineType">): boolean => lineTypeOf(l) === "ARTIKEL";

/**
 * Belegsummen + laufende Zwischen-/Gruppensummen. ARTIKEL-Zeilen speisen die zentrale
 * Steuerlogik (buildQuoteTotals: Alternativen ausgenommen, USt je Satz gerundet). GRUPPE
 * beginnt einen Block; ZWISCHENSUMME/GRUPPENSUMME erhalten ihren berechneten Netto-Wert.
 */
export function computePositionTotals(lines: ReadonlyArray<PositionLine>): PositionTotals {
  const counting: QuoteTotalsLine[] = [];
  const rows: PositionRowResult[] = [];
  let runningNet = 0; // Netto aller zählenden Positionen oberhalb (für Zwischensumme)
  let groupNet = 0; // Netto der zählenden Positionen seit der letzten Gruppenüberschrift

  lines.forEach((l, index) => {
    const t = lineTypeOf(l);
    if (t === "ARTIKEL") {
      counting.push({ qty: l.qty, unitNetCents: l.unitNetCents, taxRatePct: l.taxRatePct, isAlternative: l.isAlternative, dbCents: l.dbCents });
      if (!l.isAlternative) {
        const net = lineNet(l.qty, l.unitNetCents);
        runningNet += net;
        groupNet += net;
      }
      rows.push({ index, lineType: t });
    } else if (t === "GRUPPE") {
      groupNet = 0; // neue Gruppe beginnt
      rows.push({ index, lineType: t });
    } else if (t === "ZWISCHENSUMME") {
      rows.push({ index, lineType: t, computedNetCents: runningNet });
    } else {
      // GRUPPENSUMME
      rows.push({ index, lineType: t, computedNetCents: groupNet });
    }
  });

  const totals = buildQuoteTotals(counting);
  return { ...totals, rows };
}
