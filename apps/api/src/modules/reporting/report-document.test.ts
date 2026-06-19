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
});
