// Reporting-Aggregation (Kap. 29): Bucketing nach Tag/Woche/Monat/Jahr,
// Periodenvergleich (Delta absolut/%), Gesamtsummen. Reine Logik, keine DB.

import { describe, expect, it } from "vitest";
import {
  aggregateByCostCenter,
  breakdownMargin,
  dso,
  liquidityForecast,
  opAging,
  bucketKey,
  bucketRevenue,
  bucketStart,
  breakdownRevenue,
  comparePeriods,
  filterByRange,
  percentChange,
  previousBucketStart,
  totalRevenueCents,
  type LabeledRevenuePoint,
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

describe("filterByRange (Zeitraum von–bis)", () => {
  const points: RevenuePoint[] = [
    { at: at("2026-05-31T23:00:00Z"), netCents: 1 },
    { at: at("2026-06-15T12:00:00Z"), netCents: 2 },
    { at: at("2026-07-01T00:30:00Z"), netCents: 3 },
  ];

  it("gibt ohne Range alle Punkte zurück", () => {
    expect(filterByRange(points)).toHaveLength(3);
  });

  it("filtert inklusiv auf [from, to]", () => {
    const res = filterByRange(points, { from: at("2026-06-01T00:00:00Z"), to: at("2026-06-30T23:59:59Z") });
    expect(res.map((p) => p.netCents)).toEqual([2]);
  });

  it("akzeptiert offene Grenzen", () => {
    expect(filterByRange(points, { from: at("2026-06-16T00:00:00Z") }).map((p) => p.netCents)).toEqual([3]);
    expect(filterByRange(points, { to: at("2026-06-01T00:00:00Z") }).map((p) => p.netCents)).toEqual([1]);
  });
});

describe("breakdownRevenue (Umsatz nach Shop/Kundengruppe)", () => {
  const points: LabeledRevenuePoint[] = [
    { at: at("2026-06-01T00:00:00Z"), label: "shop_a", name: "Shop A", netCents: 30_000 },
    { at: at("2026-06-02T00:00:00Z"), label: "shop_b", name: "Shop B", netCents: 10_000 },
    { at: at("2026-06-03T00:00:00Z"), label: "shop_a", name: "Shop A", netCents: 10_000 },
  ];

  it("aggregiert je Dimension, sortiert absteigend und rechnet Anteile", () => {
    const res = breakdownRevenue(points);
    expect(res.map((r) => r.label)).toEqual(["shop_a", "shop_b"]);
    expect(res[0]).toMatchObject({ name: "Shop A", count: 2, netCents: 40_000, sharePercent: 80 });
    expect(res[1]).toMatchObject({ name: "Shop B", count: 1, netCents: 10_000, sharePercent: 20 });
  });

  it("liefert sharePercent null, wenn der Gesamtumsatz 0 ist", () => {
    const res = breakdownRevenue([{ at: at("2026-06-01T00:00:00Z"), label: "x", name: "X", netCents: 0 }]);
    expect(res[0]?.sharePercent).toBeNull();
  });

  it("ist robust ohne Datenpunkte", () => {
    expect(breakdownRevenue([])).toEqual([]);
  });
});

describe("aggregateByCostCenter (B7 / Kap. 37.1)", () => {
  it("summiert Beträge und zählt Belege je Kostenstelle", () => {
    const res = aggregateByCostCenter([
      { costCenterId: "cc-100", amountCents: 5000 },
      { costCenterId: "cc-200", amountCents: 3000 },
      { costCenterId: "cc-100", amountCents: 2500 },
    ]);
    expect(res).toEqual([
      { costCenterId: "cc-100", totalCents: 7500, count: 2 },
      { costCenterId: "cc-200", totalCents: 3000, count: 1 },
    ]);
  });

  it("führt nicht zugeordnete Belege unter null und sortiert sie zuletzt", () => {
    const res = aggregateByCostCenter([
      { costCenterId: null, amountCents: 1000 },
      { costCenterId: "cc-100", amountCents: 2000 },
    ]);
    expect(res.map((r) => r.costCenterId)).toEqual(["cc-100", null]);
    expect(res[1]).toEqual({ costCenterId: null, totalCents: 1000, count: 1 });
  });

  it("ist robust ohne Belege", () => {
    expect(aggregateByCostCenter([])).toEqual([]);
  });
});

describe("Finanz-Reporting (B19, Kap. 29)", () => {
  const asOf = new Date(Date.UTC(2026, 5, 30));
  const due = (overdueDays: number) => new Date(asOf.getTime() - overdueDays * 86_400_000);

  it("opAging verteilt offene Posten auf Überfälligkeits-Buckets", () => {
    const r = opAging(
      [
        { openCents: 1000, dueDate: due(-5) }, // noch nicht fällig
        { openCents: 2000, dueDate: due(10) }, // 0–30
        { openCents: 3000, dueDate: due(45) }, // 31–60
        { openCents: 4000, dueDate: due(75) }, // 61–90
        { openCents: 5000, dueDate: due(120) }, // >90
        { openCents: 0, dueDate: due(200) }, // bezahlt → ignoriert
      ],
      asOf
    );
    expect(r).toEqual({ notDue: 1000, d0_30: 2000, d31_60: 3000, d61_90: 4000, d90plus: 5000, total: 15000 });
  });

  it("dso = Forderungen / Umsatz × Tage; robust bei 0-Umsatz", () => {
    expect(dso(15000, 90000, 90)).toBeCloseTo(15, 5);
    expect(dso(15000, 0, 90)).toBe(0);
  });

  it("breakdownMargin berechnet Deckungsbeitrag + Marge je Dimension", () => {
    const res = breakdownMargin([
      { label: "STICK", name: "Stickerei", netCents: 10000, costCents: 6000 },
      { label: "STICK", name: "Stickerei", netCents: 5000, costCents: 3000 },
      { label: "DRUCK", name: "Druck", netCents: 4000, costCents: 1000 },
    ]);
    // STICK: 15000 − 9000 = 6000 DB (40%); DRUCK: 3000 DB (75%). Sortiert nach DB desc.
    expect(res[0]).toMatchObject({ label: "STICK", dbCents: 6000, margePercent: 40 });
    expect(res[1]).toMatchObject({ label: "DRUCK", dbCents: 3000, margePercent: 75 });
  });

  it("liquidityForecast bildet Netto je Periode + laufenden Saldo", () => {
    const f = liquidityForecast(
      [
        { at: new Date(Date.UTC(2026, 0, 5)), amountCents: 1000 }, // Zufluss Jan
        { at: new Date(Date.UTC(2026, 0, 20)), amountCents: -400 }, // Abfluss Jan
        { at: new Date(Date.UTC(2026, 1, 10)), amountCents: 500 }, // Zufluss Feb
      ],
      "MONTH",
      2000 // Anfangsbestand
    );
    expect(f[0]).toMatchObject({ netCents: 600, cumulativeCents: 2600 });
    expect(f[1]).toMatchObject({ netCents: 500, cumulativeCents: 3100 });
  });
});
