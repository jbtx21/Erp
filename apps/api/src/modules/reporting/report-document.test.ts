// Berichtsmodell für den PDF-Export (Kap. 29): Aufbau von Abschnitten/Tabellen aus
// den Umsatz-Kennzahlen. Reine Funktion, kein PDF.

import { describe, expect, it } from "vitest";
import { bucketRevenue, breakdownRevenue, comparePeriods, type RevenuePoint } from "@texma/shared";
import { buildReportDocument } from "./report-document.js";

const at = (iso: string): Date => new Date(iso);
const revenue: RevenuePoint[] = [
  { at: at("2026-05-10T00:00:00Z"), netCents: 20_000 },
  { at: at("2026-06-05T00:00:00Z"), netCents: 30_000 },
];

describe("buildReportDocument", () => {
  const doc = buildReportDocument({
    granularity: "MONTH",
    generatedAt: at("2026-06-19T00:00:00Z"),
    revenueBuckets: bucketRevenue(revenue, "MONTH"),
    orderBuckets: bucketRevenue(revenue, "MONTH"),
    byShop: breakdownRevenue([
      { at: at("2026-05-10T00:00:00Z"), label: "shop_a", name: "Shop A", netCents: 30_000 },
      { at: at("2026-06-05T00:00:00Z"), label: "shop_b", name: "Shop B", netCents: 20_000 },
    ]),
    byPriceGroup: breakdownRevenue([{ at: at("2026-06-05T00:00:00Z"), label: "STANDARD", name: "Standard", netCents: 50_000 }]),
    comparison: comparePeriods(revenue, "MONTH", at("2026-06-19T00:00:00Z")),
  });

  it("nennt Titel, Granularität und Veränderung im Untertitel", () => {
    expect(doc.title).toContain("Umsatz-Auswertung");
    expect(doc.subtitle).toContain("Monat");
    expect(doc.subtitle).toContain("+50 %");
  });

  it("baut drei Abschnitte: Übersicht, nach Shop, nach Kundengruppe", () => {
    expect(doc.sections.map((s) => s.heading)).toEqual([
      "Umsatz & Aufträge je Monat",
      "Umsatz nach Shop",
      "Umsatz nach Kundengruppe",
    ]);
  });

  it("füllt die Shop-Tabelle mit Anteilen", () => {
    const shop = doc.sections[1]!.table;
    expect(shop.columns).toContain("Anteil");
    expect(shop.rows[0]?.[0]).toBe("Shop A");
    expect(shop.rows[0]?.[3]).toBe("60 %");
  });

  it("ergänzt im Gesamtbericht Artikel- und Produktions-Abschnitte", () => {
    const full = buildReportDocument({
      granularity: "MONTH",
      generatedAt: at("2026-06-19T00:00:00Z"),
      revenueBuckets: bucketRevenue(revenue, "MONTH"),
      orderBuckets: bucketRevenue(revenue, "MONTH"),
      byShop: [],
      byPriceGroup: [],
      byArticle: breakdownRevenue([{ at: at("2026-06-01T00:00:00Z"), label: "Polo", name: "Polo", netCents: 10_000 }]),
      comparison: comparePeriods(revenue, "MONTH", at("2026-06-19T00:00:00Z")),
      production: {
        leadTime: { stats: { count: 2, avgHours: 36, medianHours: 36, minHours: 24, maxHours: 48 }, buckets: [{ key: "2026-06", start: at("2026-06-01T00:00:00Z"), count: 2, avgHours: 36 }] },
        defects: { overall: { total: 4, defects: 1, ratePercent: 25 }, byCause: { LIEFERANT: 0, INTERN: 1, EXTERN_VEREDLER: 0 }, buckets: [{ key: "2026-06", start: at("2026-06-01T00:00:00Z"), total: 4, defects: 1, ratePercent: 25 }] },
        onTime: { overall: { total: 3, onTime: 2, ratePercent: 67 }, buckets: [{ key: "2026-06", start: at("2026-06-01T00:00:00Z"), total: 3, onTime: 2, ratePercent: 67 }] },
      },
    });
    expect(full.title).toBe("TEXMA — Gesamtbericht");
    const headings = full.sections.map((s) => s.heading);
    expect(headings.some((h) => h.startsWith("Umsatz nach Artikel"))).toBe(true);
    expect(headings.some((h) => h.startsWith("Durchlaufzeit"))).toBe(true);
    expect(headings.some((h) => h.startsWith("Fehlerquote"))).toBe(true);
    expect(headings.some((h) => h.startsWith("Termintreue"))).toBe(true);
  });
});
