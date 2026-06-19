// Reine, testbare Aufbereitung der Umsatz-Auswertung zu einem druckbaren Berichts-
// modell (Kap. 29). Wandelt die berechneten Kennzahlen in Abschnitte mit Tabellen
// (Spalten + Zeilen als Strings). IO-frei — der pdf-lib-Renderer (pdf/report-pdf.ts)
// setzt dieses Modell nur noch in Bytes um. So bleibt der Inhalt ohne PDF testbar.

import {
  formatEur,
  type Granularity,
  type PeriodComparison,
  type RevenueBreakdownItem,
  type RevenueBucket,
} from "@texma/shared";

export interface ReportTable {
  columns: string[];
  rows: string[][];
}
export interface ReportSection {
  heading: string;
  table: ReportTable;
}
export interface ReportDocument {
  title: string;
  subtitle: string;
  sections: ReportSection[];
}

export interface ReportData {
  granularity: Granularity;
  generatedAt: Date;
  revenueBuckets: ReadonlyArray<RevenueBucket>;
  orderBuckets: ReadonlyArray<RevenueBucket>;
  byShop: ReadonlyArray<RevenueBreakdownItem>;
  byPriceGroup: ReadonlyArray<RevenueBreakdownItem>;
  comparison: PeriodComparison;
}

const GRANULARITY_LABEL: Record<Granularity, string> = {
  DAY: "Tag",
  WEEK: "Woche",
  MONTH: "Monat",
  YEAR: "Jahr",
};

const sharePct = (p: number | null): string => (p == null ? "—" : `${p} %`);

function breakdownTable(items: ReadonlyArray<RevenueBreakdownItem>): ReportTable {
  return {
    columns: ["Bezeichnung", "Umsatz (Netto)", "Rechnungen", "Anteil"],
    rows: items.map((i) => [i.name, formatEur(i.netCents), String(i.count), sharePct(i.sharePercent)]),
  };
}

/** Baut das druckbare Berichtsmodell aus den aufbereiteten Umsatz-Kennzahlen (Kap. 29). */
export function buildReportDocument(data: ReportData): ReportDocument {
  const periode = GRANULARITY_LABEL[data.granularity];
  const generated = data.generatedAt.toLocaleDateString("de-DE", { timeZone: "UTC" });
  const orderByKey = new Map(data.orderBuckets.map((b) => [b.key, b]));

  const pct = data.comparison.deltaPercent;
  const comparison =
    `${formatEur(data.comparison.current.netCents)} im aktuellen Zeitraum (${data.comparison.current.key}); ` +
    `Veränderung ${data.comparison.deltaCents >= 0 ? "+" : ""}${formatEur(data.comparison.deltaCents)} ` +
    `(${pct == null ? "n/v" : `${pct > 0 ? "+" : ""}${pct} %`}) zur Vorperiode`;

  return {
    title: "TEXMA — Umsatz-Auswertung",
    subtitle: `Granularität: ${periode} · erstellt ${generated} · ${comparison}`,
    sections: [
      {
        heading: `Umsatz & Aufträge je ${periode}`,
        table: {
          columns: ["Periode", "Umsatz (Netto)", "Rechnungen", "Aufträge", "Auftragswert"],
          rows: data.revenueBuckets.map((b) => {
            const o = orderByKey.get(b.key);
            return [
              b.key,
              formatEur(b.netCents),
              String(b.count),
              String(o?.count ?? 0),
              formatEur(o?.netCents ?? 0),
            ];
          }),
        },
      },
      { heading: "Umsatz nach Shop", table: breakdownTable(data.byShop) },
      { heading: "Umsatz nach Kundengruppe", table: breakdownTable(data.byPriceGroup) },
    ],
  };
}
