import { describe, expect, it } from "vitest";
import { postCalc, type CostSide } from "./postcalc.js";

const plan: CostSide = {
  revenueCents: 100000,
  materialCents: 40000,
  laborMinutes: 120,
  laborRateCentsPerMinute: 100, // 60 €/h
};

describe("Nachkalkulation Soll-Ist (T-10)", () => {
  it("berechnet Plan-DB = Umsatz − Material − Lohn", () => {
    const r = postCalc(plan, plan);
    expect(r.plan.laborCents).toBe(12000);
    expect(r.plan.dbCents).toBe(100000 - 40000 - 12000);
    expect(r.dbVarianceCents).toBe(0);
  });

  it("zeigt negative Abweichung bei Mehraufwand", () => {
    const ist: CostSide = { ...plan, laborMinutes: 180, materialCents: 45000 };
    const r = postCalc(plan, ist);
    // Ist-DB kleiner → negative Abweichung
    expect(r.dbVarianceCents).toBeLessThan(0);
    expect(r.ist.dbCents).toBe(100000 - 45000 - 18000);
  });

  it("liefert Abweichung in Prozent des Plan-DB", () => {
    const ist: CostSide = { ...plan, materialCents: 48000 };
    const r = postCalc(plan, ist);
    // 8000 Cent schlechter bei Plan-DB 48000 → ~ -16,7 %
    expect(r.dbVariancePct).toBeCloseTo(-8000 / 48000, 5);
  });
});
