// Reine, testbare Prompt-Erstellung für die KI-gestützte Auswertung (Kap. 29).
// Wandelt die berechneten Kennzahlen (Umsatz/Aufträge je Periode + Periodenvergleich)
// in einen deterministischen, deutschsprachigen Prompt für Claude. IO-frei → testbar
// ohne Netz. Die eigentliche LLM-Anbindung liegt in `anthropic-report-client.ts`.

import { formatEur, type Granularity, type PeriodComparison, type RevenueBucket } from "@texma/shared";

export interface ReportPromptInput {
  granularity: Granularity;
  /** Aufsteigend sortierte Umsatz-Eimer (Netto). */
  revenueBuckets: ReadonlyArray<RevenueBucket>;
  /** Aufsteigend sortierte Auftrags-Eimer (Anzahl + Auftragswert). */
  orderBuckets: ReadonlyArray<RevenueBucket>;
  /** Umsatz aktuelle vs. vorhergehende Periode. */
  revenueComparison: PeriodComparison;
  /** Aufträge aktuelle vs. vorhergehende Periode. */
  orderComparison: PeriodComparison;
}

const GRANULARITY_LABEL: Record<Granularity, string> = {
  DAY: "Tag",
  WEEK: "Woche",
  MONTH: "Monat",
  YEAR: "Jahr",
};

function formatDelta(cmp: PeriodComparison): string {
  const pct = cmp.deltaPercent === null ? "n/v" : `${cmp.deltaPercent > 0 ? "+" : ""}${cmp.deltaPercent} %`;
  const abs = `${cmp.deltaCents >= 0 ? "+" : ""}${formatEur(cmp.deltaCents)}`;
  return `${abs} (${pct})`;
}

/**
 * Baut den vollständigen Prompt für die KI-Zusammenfassung (Kap. 29). Enthält nur
 * aggregierte Kennzahlen — keine Kunden-/Personendaten (DSGVO, Kap. 28).
 */
export function buildReportPrompt(input: ReportPromptInput): string {
  const periode = GRANULARITY_LABEL[input.granularity];
  const revenueRows = input.revenueBuckets
    .map((b) => `- ${b.key}: ${formatEur(b.netCents)} Netto aus ${b.count} Rechnung(en)`)
    .join("\n");
  const orderRows = input.orderBuckets
    .map((b) => `- ${b.key}: ${b.count} Auftrag/Aufträge, Auftragswert ${formatEur(b.netCents)}`)
    .join("\n");

  return [
    `Du bist Controlling-Assistent für TEXMA, einen Textilveredelungsbetrieb.`,
    `Erstelle eine knappe, sachliche deutschsprachige Auswertung (3–6 Sätze) der folgenden Kennzahlen`,
    `auf Ebene "${periode}". Nenne den Trend, auffällige Perioden und die Veränderung zur Vorperiode.`,
    `Erfinde keine Zahlen; verwende ausschließlich die angegebenen Werte. Keine Kundennamen (liegen nicht vor).`,
    ``,
    `## Umsatz (Netto) je ${periode}`,
    revenueRows || "- keine Daten",
    ``,
    `## Aufträge je ${periode}`,
    orderRows || "- keine Daten",
    ``,
    `## Vergleich aktuelle vs. vorhergehende Periode`,
    `- Umsatz aktuell (${input.revenueComparison.current.key}): ${formatEur(input.revenueComparison.current.netCents)}; Veränderung ${formatDelta(input.revenueComparison)}`,
    `- Aufträge aktuell (${input.orderComparison.current.key}): ${input.orderComparison.current.count}; Wert-Veränderung ${formatDelta(input.orderComparison)}`,
  ].join("\n");
}
