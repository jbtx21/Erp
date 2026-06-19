// Prompt-Erstellung für das KI-Reporting (Kap. 29): aggregierte Kennzahlen,
// keine Personendaten. Reine Funktion, kein Netz.

import { describe, expect, it } from "vitest";
import { comparePeriods, bucketRevenue, type RevenuePoint } from "@texma/shared";
import { buildReportPrompt } from "./report-prompt.js";

const at = (iso: string): Date => new Date(iso);
const revenue: RevenuePoint[] = [
  { at: at("2026-05-10T09:00:00Z"), netCents: 20_000 },
  { at: at("2026-06-05T09:00:00Z"), netCents: 30_000 },
];

describe("buildReportPrompt", () => {
  const ref = at("2026-06-19T00:00:00Z");
  const prompt = buildReportPrompt({
    granularity: "MONTH",
    revenueBuckets: bucketRevenue(revenue, "MONTH"),
    orderBuckets: bucketRevenue(revenue, "MONTH"),
    revenueComparison: comparePeriods(revenue, "MONTH", ref),
    orderComparison: comparePeriods(revenue, "MONTH", ref),
  });

  it("nennt die Granularität und die Perioden-Kennzahlen", () => {
    expect(prompt).toContain("Monat");
    expect(prompt).toContain("2026-06");
    expect(prompt).toContain("2026-05");
  });

  it("weist die Veränderung zur Vorperiode aus", () => {
    expect(prompt).toContain("+50 %");
  });

  it("bleibt ohne Daten robust", () => {
    const empty = buildReportPrompt({
      granularity: "DAY",
      revenueBuckets: [],
      orderBuckets: [],
      revenueComparison: comparePeriods([], "DAY", ref),
      orderComparison: comparePeriods([], "DAY", ref),
    });
    expect(empty).toContain("keine Daten");
  });
});
