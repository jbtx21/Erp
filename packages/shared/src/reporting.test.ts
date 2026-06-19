// Reporting-Aggregation (Kap. 29): Bucketing nach Tag/Woche/Monat/Jahr,
// Periodenvergleich (Delta absolut/%), Gesamtsummen. Reine Logik, keine DB.

import { describe, expect, it } from "vitest";
import {
  bucketKey,
  bucketRevenue,
  bucketStart,
  comparePeriods,
  percentChange,
  previousBucketStart,
  totalRevenueCents,
  type RevenuePoint,
} from "./reporting.js";

const at = (iso: string): Date => new Date(iso);

describe("bucketKey (Kap. 29)", () => {
  it("bildet stabile, sortierbare Schlüssel je Granularität", () => {
    const d = at("2026-06-19T14:30:00Z"); // Freitag, ISO-KW 25
    expect(bucketKey(d, "DAY")).toBe("2026-06-19");
    expect(bucketKey(d, "WEEK")).toBe("2026-W25");
    expect(bucketKey(d, "MONTH")).toBe("2026-06");
    expect(bucketKey(d, "YEAR")).toBe("2026");
  });

  it("ordnet ISO-Wochen am Jahreswechsel dem Wochenjahr zu", () => {
    // 1. Januar 2027 ist ein Freitag → gehört noch zur KW 53 von 2026.
    expect(bucketKey(at("2027-01-01T00:00:00Z"), "WEEK")).toBe("2026-W53");
    // 4. Januar 2027 (Montag) startet KW 01/2027.
    expect(bucketKey(at("2027-01-04T00:00:00Z"), "WEEK")).toBe("2027-W01");
  });
});

describe("bucketStart / previousBucketStart", () => {
  it("liefert UTC-Periodenbeginn", () => {
    expect(bucketStart(at("2026-06-19T14:00:00Z"), "MONTH").toISOString()).toBe(
      "2026-06-01T00:00:00.000Z"
    );
    // ISO-Woche beginnt am Montag (2026-06-15).
    expect(bucketStart(at("2026-06-19T14:00:00Z"), "WEEK").toISOString()).toBe(
      "2026-06-15T00:00:00.000Z"
    );
  });

  it("rechnet auf die Vorperiode zurück", () => {
    const monthStart = bucketStart(at("2026-01-15T00:00:00Z"), "MONTH");
    expect(previousBucketStart(monthStart, "MONTH").toISOString()).toBe(
      "2025-12-01T00:00:00.000Z"
    );
    const yearStart = bucketStart(at("2026-03-01T00:00:00Z"), "YEAR");
    expect(previousBucketStart(yearStart, "YEAR").toISOString()).toBe(
      "2025-01-01T00:00:00.000Z"
    );
  });
});

describe("bucketRevenue", () => {
  const points: RevenuePoint[] = [
    { at: at("2026-06-01T09:00:00Z"), netCents: 10_000 },
    { at: at("2026-06-01T18:00:00Z"), netCents: 5_000 },
    { at: at("2026-06-02T09:00:00Z"), netCents: 2_000 },
    { at: at("2026-07-15T09:00:00Z"), netCents: 8_000 },
  ];

  it("summiert Beträge und zählt je Tag", () => {
    const days = bucketRevenue(points, "DAY");
    expect(days.map((b) => b.key)).toEqual(["2026-06-01", "2026-06-02", "2026-07-15"]);
    expect(days[0]).toMatchObject({ count: 2, netCents: 15_000 });
  });

  it("aggregiert je Monat", () => {
    const months = bucketRevenue(points, "MONTH");
    expect(months.map((b) => b.key)).toEqual(["2026-06", "2026-07"]);
    expect(months[0]).toMatchObject({ count: 3, netCents: 17_000 });
    expect(months[1]).toMatchObject({ count: 1, netCents: 8_000 });
  });

  it("liefert aufsteigend sortierte Eimer", () => {
    const shuffled: RevenuePoint[] = [
      { at: at("2026-03-01T00:00:00Z"), netCents: 1 },
      { at: at("2026-01-01T00:00:00Z"), netCents: 1 },
      { at: at("2026-02-01T00:00:00Z"), netCents: 1 },
    ];
    expect(bucketRevenue(shuffled, "MONTH").map((b) => b.key)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });
});

describe("percentChange", () => {
  it("berechnet gerundete Prozentveränderung", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
  });

  it("liefert null, wenn die Basis 0 ist", () => {
    expect(percentChange(100, 0)).toBeNull();
  });
});

describe("comparePeriods (Tag/Woche/Monat/Jahr)", () => {
  const points: RevenuePoint[] = [
    { at: at("2026-05-10T09:00:00Z"), netCents: 20_000 }, // Mai
    { at: at("2026-06-10T09:00:00Z"), netCents: 30_000 }, // Juni
  ];

  it("vergleicht den Monat mit dem Vormonat (Delta + Prozent)", () => {
    const cmp = comparePeriods(points, "MONTH", at("2026-06-19T00:00:00Z"));
    expect(cmp.current.netCents).toBe(30_000);
    expect(cmp.previous?.netCents).toBe(20_000);
    expect(cmp.deltaCents).toBe(10_000);
    expect(cmp.deltaPercent).toBe(50);
  });

  it("behandelt eine fehlende Vorperiode als 0 (Prozent null)", () => {
    const cmp = comparePeriods(points, "MONTH", at("2026-05-15T00:00:00Z"));
    expect(cmp.current.netCents).toBe(20_000);
    expect(cmp.previous).toBeNull();
    expect(cmp.deltaCents).toBe(20_000);
    expect(cmp.deltaPercent).toBeNull();
  });

  it("liefert für eine datenlose Periode einen Null-Eimer", () => {
    const cmp = comparePeriods(points, "YEAR", at("2030-01-01T00:00:00Z"));
    expect(cmp.current).toMatchObject({ key: "2030", count: 0, netCents: 0 });
  });
});

describe("totalRevenueCents", () => {
  it("summiert alle Datenpunkte", () => {
    expect(
      totalRevenueCents([
        { at: at("2026-01-01T00:00:00Z"), netCents: 100 },
        { at: at("2026-02-01T00:00:00Z"), netCents: 250 },
      ])
    ).toBe(350);
  });
});
