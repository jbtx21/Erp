// Produktions-Kennzahlen (Kap. 29/35): Durchlaufzeit (Lead Time) + Fehlerquote.
// Reine Logik, keine DB.

import { describe, expect, it } from "vitest";
import {
  bucketDefectRate,
  bucketLeadTime,
  computeDefectRate,
  computeLeadTimeStats,
  defectRate,
  defectsByCause,
  leadTimeHours,
  type DefectPoint,
  type LeadTimePoint,
} from "./production-metrics.js";

const at = (iso: string): Date => new Date(iso);

describe("leadTimeHours", () => {
  it("berechnet die Durchlaufzeit in Stunden", () => {
    expect(leadTimeHours(at("2026-06-01T08:00:00Z"), at("2026-06-01T20:00:00Z"))).toBe(12);
    expect(leadTimeHours(at("2026-06-01T00:00:00Z"), at("2026-06-03T00:00:00Z"))).toBe(48);
  });

  it("klemmt negative Zeiten auf 0", () => {
    expect(leadTimeHours(at("2026-06-02T00:00:00Z"), at("2026-06-01T00:00:00Z"))).toBe(0);
  });
});

describe("computeLeadTimeStats", () => {
  const points: LeadTimePoint[] = [
    { at: at("2026-06-01T00:00:00Z"), hours: 24 },
    { at: at("2026-06-02T00:00:00Z"), hours: 48 },
    { at: at("2026-06-03T00:00:00Z"), hours: 12 },
  ];

  it("liefert Mittel/Median/Min/Max", () => {
    expect(computeLeadTimeStats(points)).toEqual({
      count: 3,
      avgHours: 28,
      medianHours: 24,
      minHours: 12,
      maxHours: 48,
    });
  });

  it("mittelt den Median bei gerader Anzahl", () => {
    const stats = computeLeadTimeStats([
      { at: at("2026-06-01T00:00:00Z"), hours: 10 },
      { at: at("2026-06-02T00:00:00Z"), hours: 20 },
    ]);
    expect(stats.medianHours).toBe(15);
  });

  it("ist robust ohne Datenpunkte", () => {
    expect(computeLeadTimeStats([])).toMatchObject({ count: 0, avgHours: 0 });
  });
});

describe("bucketLeadTime", () => {
  it("mittelt die Durchlaufzeit je Monat", () => {
    const points: LeadTimePoint[] = [
      { at: at("2026-05-10T00:00:00Z"), hours: 20 },
      { at: at("2026-05-20T00:00:00Z"), hours: 40 },
      { at: at("2026-06-01T00:00:00Z"), hours: 30 },
    ];
    const buckets = bucketLeadTime(points, "MONTH");
    expect(buckets.map((b) => b.key)).toEqual(["2026-05", "2026-06"]);
    expect(buckets[0]).toMatchObject({ count: 2, avgHours: 30 });
    expect(buckets[1]).toMatchObject({ count: 1, avgHours: 30 });
  });
});

describe("Fehlerquote", () => {
  const points: DefectPoint[] = [
    { at: at("2026-06-01T00:00:00Z"), defective: false },
    { at: at("2026-06-02T00:00:00Z"), defective: true, cause: "INTERN" },
    { at: at("2026-06-03T00:00:00Z"), defective: true, cause: "LIEFERANT" },
    { at: at("2026-06-04T00:00:00Z"), defective: false },
  ];

  it("computeDefectRate rechnet Prozent und schützt vor Division durch 0", () => {
    expect(computeDefectRate(4, 1)).toEqual({ total: 4, defects: 1, ratePercent: 25 });
    expect(computeDefectRate(0, 0).ratePercent).toBeNull();
  });

  it("defectRate über alle Aufträge", () => {
    expect(defectRate(points)).toEqual({ total: 4, defects: 2, ratePercent: 50 });
  });

  it("zählt Reklamationen je Ursache", () => {
    expect(defectsByCause(points)).toEqual({ LIEFERANT: 1, INTERN: 1, EXTERN_VEREDLER: 0 });
  });

  it("bucketDefectRate je Monat", () => {
    const buckets = bucketDefectRate(points, "MONTH");
    expect(buckets[0]).toMatchObject({ key: "2026-06", total: 4, defects: 2, ratePercent: 50 });
  });
});
