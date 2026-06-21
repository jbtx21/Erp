import { describe, expect, it } from "vitest";
import { decomposeVariance, marginPct, postCalc, type CostSide } from "./postcalc.js";

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

  it("zerlegt die DB-Abweichung in Umsatz/Material/Lohn (Menge/Satz)", () => {
    const ist: CostSide = {
      revenueCents: 98_000, // 2.000 weniger Umsatz
      materialCents: 45_000, // 5.000 mehr Material
      laborMinutes: 180, // 60 min mehr
      laborRateCentsPerMinute: 110, // 10 ct/min teurer
    };
    const v = decomposeVariance(plan, ist);
    expect(v.revenueVarianceCents).toBe(-2_000);
    expect(v.materialVarianceCents).toBe(-5_000);
    expect(v.laborQtyVarianceCents).toBe((120 - 180) * 100); // -6.000
    expect(v.laborRateVarianceCents).toBe((100 - 110) * 180); // -1.800
    // Kontrolle: Summe der Komponenten = DB-Gesamtabweichung.
    const sum = v.revenueVarianceCents + v.materialVarianceCents + v.laborQtyVarianceCents + v.laborRateVarianceCents;
    expect(sum).toBe(postCalc(plan, ist).dbVarianceCents);
  });

  it("berechnet die DB-Marge und klassifiziert das Ergebnis (Ampel)", () => {
    const r = postCalc(plan, plan);
    expect(r.planMarginPct).toBe(marginPct(r.plan));
    expect(r.planMarginPct).toBe(48); // 48.000/100.000
    expect(r.status).toBe("GRUEN");

    // 5 % unter Plan-DB → GELB (Toleranz 10 %).
    const gelb = postCalc(plan, { ...plan, materialCents: 40000 + Math.round(48000 * 0.05) });
    expect(gelb.status).toBe("GELB");
    // 20 % unter Plan-DB → ROT.
    const rot = postCalc(plan, { ...plan, materialCents: 40000 + Math.round(48000 * 0.2) });
    expect(rot.status).toBe("ROT");
  });
});
