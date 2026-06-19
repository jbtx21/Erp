// Reine, testbare Aufbereitung der Umsatz-Auswertung zu einem druckbaren Berichts-
// modell (Kap. 29). Wandelt die berechneten Kennzahlen in Abschnitte mit Tabellen
// (Spalten + Zeilen als Strings). IO-frei — der pdf-lib-Renderer (pdf/report-pdf.ts)
// setzt dieses Modell nur noch in Bytes um. So bleibt der Inhalt ohne PDF testbar.

import {
  formatEur,
  type DateRange,
  type DefectBucket,
  type DefectCause,
  type Granularity,
  type LeadTimeBucket,
  type LeadTimeStats,
  type OnTimeBucket,
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

/** Operative Produktions-Kennzahlen für den Gesamtbericht (Kap. 29/35). */
export interface ProductionReportData {
  leadTime: { stats: LeadTimeStats; buckets: ReadonlyArray<LeadTimeBucket> };
  defects: {
    overall: { total: number; defects: number; ratePercent: number | null };
    byCause: Record<DefectCause, number>;
    buckets: ReadonlyArray<DefectBucket>;
  };
  onTime: {
    overall: { total: number; onTime: number; ratePercent: number | null };
    buckets: ReadonlyArray<OnTimeBucket>;
  };
}

export interface ReportData {
  granularity: Granularity;
  generatedAt: Date;
  /** Optionaler Auswertungszeitraum (für den Untertitel). */
  range?: DateRange;
  revenueBuckets: ReadonlyArray<RevenueBucket>;
  orderBuckets: ReadonlyArray<RevenueBucket>;
  byShop: ReadonlyArray<RevenueBreakdownItem>;
  byPriceGroup: ReadonlyArray<RevenueBreakdownItem>;
  comparison: PeriodComparison;
  /** Optional: Auftragswert nach Artikel/Veredelung (Gesamtbericht). */
  byArticle?: ReadonlyArray<RevenueBreakdownItem>;
  /** Optional: operative Produktions-KPIs (Gesamtbericht). */
  production?: ProductionReportData;
}

const rate = (p: number | null): string => (p == null ? "—" : `${p} %`);

const deDate = (d: Date): string => d.toLocaleDateString("de-DE", { timeZone: "UTC" });

function rangeLabel(range?: DateRange): string {
  if (!range || (!range.from && !range.to)) return "";
  const from = range.from ? deDate(range.from) : "Beginn";
  const to = range.to ? deDate(range.to) : "heute";
  return ` · Zeitraum ${from}–${to}`;
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
  const generated = deDate(data.generatedAt);
  const orderByKey = new Map(data.orderBuckets.map((b) => [b.key, b]));

  const pct = data.comparison.deltaPercent;
  const comparison =
    `${formatEur(data.comparison.current.netCents)} im aktuellen Zeitraum (${data.comparison.current.key}); ` +
    `Veränderung ${data.comparison.deltaCents >= 0 ? "+" : ""}${formatEur(data.comparison.deltaCents)} ` +
    `(${pct == null ? "n/v" : `${pct > 0 ? "+" : ""}${pct} %`}) zur Vorperiode`;

  const sections: ReportSection[] = [
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
  ];

  if (data.byArticle) {
    sections.push({ heading: "Umsatz nach Artikel/Veredelung (Auftragswert)", table: breakdownTable(data.byArticle) });
  }

  if (data.production) {
    const p = data.production;
    sections.push({
      heading: `Durchlaufzeit je ${periode} (Ø ${p.leadTime.stats.avgHours} h, Median ${p.leadTime.stats.medianHours} h)`,
      table: {
        columns: ["Periode", "Aufträge", "Ø Durchlaufzeit (h)"],
        rows: p.leadTime.buckets.map((b) => [b.key, String(b.count), String(b.avgHours)]),
      },
    });
    sections.push({
      heading: `Fehlerquote je ${periode} (gesamt ${rate(p.defects.overall.ratePercent)}; Lieferant ${p.defects.byCause.LIEFERANT} / intern ${p.defects.byCause.INTERN} / Veredler ${p.defects.byCause.EXTERN_VEREDLER})`,
      table: {
        columns: ["Periode", "Aufträge", "Reklamationen", "Quote"],
        rows: p.defects.buckets.map((b) => [b.key, String(b.total), String(b.defects), rate(b.ratePercent)]),
      },
    });
    sections.push({
      heading: `Termintreue je ${periode} (gesamt ${rate(p.onTime.overall.ratePercent)})`,
      table: {
        columns: ["Periode", "Aufträge", "Pünktlich", "Quote"],
        rows: p.onTime.buckets.map((b) => [b.key, String(b.total), String(b.onTime), rate(b.ratePercent)]),
      },
    });
  }

  return {
    title: data.production ? "TEXMA — Gesamtbericht" : "TEXMA — Umsatz-Auswertung",
    subtitle: `Granularität: ${periode} · erstellt ${generated}${rangeLabel(data.range)} · ${comparison}`,
    sections,
  };
}
