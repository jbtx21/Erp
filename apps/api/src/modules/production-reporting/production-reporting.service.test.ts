// Operatives Produktions-Reporting (Kap. 29/35): Durchlaufzeit + Fehlerquote.
// Repository als Fake — keine DB.

import { describe, expect, it } from "vitest";
import type { DefectPoint, LeadTimePoint } from "@texma/shared";
import { InMemoryProductionReportingRepository } from "../../repositories/in-memory-production-reporting.repository.js";
import { ProductionReportingService } from "./production-reporting.service.js";

const at = (iso: string): Date => new Date(iso);

const leadTimes: LeadTimePoint[] = [
  { at: at("2026-05-10T00:00:00Z"), hours: 48 },
  { at: at("2026-06-05T00:00:00Z"), hours: 24 },
  { at: at("2026-06-20T00:00:00Z"), hours: 72 },
];
const defects: DefectPoint[] = [
  { at: at("2026-06-01T00:00:00Z"), defective: false },
  { at: at("2026-06-02T00:00:00Z"), defective: true, cause: "INTERN" },
  { at: at("2026-06-03T00:00:00Z"), defective: false },
  { at: at("2026-06-04T00:00:00Z"), defective: true, cause: "EXTERN_VEREDLER" },
];

function service(): ProductionReportingService {
  return new ProductionReportingService(
    new InMemoryProductionReportingRepository(leadTimes, defects)
  );
}

describe("ProductionReportingService (Kap. 29/35)", () => {
  it("liefert die Durchlaufzeit je Monat + Gesamtkennzahlen", async () => {
    const res = await service().leadTimeOverview("MONTH");
    expect(res.buckets.map((b) => b.key)).toEqual(["2026-05", "2026-06"]);
    expect(res.buckets[1]).toMatchObject({ count: 2, avgHours: 48 });
    expect(res.stats).toMatchObject({ count: 3, minHours: 24, maxHours: 72, medianHours: 48 });
  });

  it("liefert die Fehlerquote je Monat, gesamt und je Ursache", async () => {
    const res = await service().defectOverview("MONTH");
    expect(res.overall).toEqual({ total: 4, defects: 2, ratePercent: 50 });
    expect(res.byCause).toEqual({ LIEFERANT: 0, INTERN: 1, EXTERN_VEREDLER: 1 });
    expect(res.buckets[0]).toMatchObject({ key: "2026-06", total: 4, defects: 2, ratePercent: 50 });
  });
});
