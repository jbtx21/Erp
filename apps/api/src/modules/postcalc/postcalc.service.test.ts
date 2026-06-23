// Nachkalkulation (T-10): Plan-DB vs. Ist-DB, Abweichung in Cent und Prozent.
// In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import type { CostSide } from "@texma/shared";
import { InMemoryPostCalcRepository } from "../../repositories/in-memory-postcalc.repository.js";
import { PostCalcService } from "./postcalc.service.js";

const plan: CostSide = {
  revenueCents: 100000,
  materialCents: 35000,
  laborMinutes: 500,
  laborRateCentsPerMinute: 80,
}; // DB = 100000 − 35000 − 40000 = 25000

function setup(ist: { revenueCents: number; materialCents: number; laborMinutes: number }) {
  const repo = new InMemoryPostCalcRepository({ pa: ist });
  return new PostCalcService(repo);
}

describe("PostCalcService.compute (T-10)", () => {
  it("zeigt eine negative DB-Abweichung bei Mehrverbrauch", async () => {
    const service = setup({ revenueCents: 100000, materialCents: 40000, laborMinutes: 600 });
    const res = await service.compute({ productionId: "pa", plan, istLaborRateCentsPerMinute: 80 });
    expect(res.ist.dbCents).toBe(12000); // 100000 − 40000 − 48000
    expect(res.dbVarianceCents).toBe(-13000);
    expect(res.dbVariancePct).toBeCloseTo(-0.52, 2);
  });

  it("meldet keine Abweichung, wenn Ist = Plan", async () => {
    const service = setup({ revenueCents: 100000, materialCents: 35000, laborMinutes: 500 });
    const res = await service.compute({ productionId: "pa", plan, istLaborRateCentsPerMinute: 80 });
    expect(res.dbVarianceCents).toBe(0);
  });

  it("wirft für einen unbekannten Produktionsauftrag", async () => {
    const service = setup({ revenueCents: 1, materialCents: 0, laborMinutes: 0 });
    await expect(
      service.compute({ productionId: "unknown", plan, istLaborRateCentsPerMinute: 80 })
    ).rejects.toThrow(/nicht gefunden/);
  });
});

describe("PostCalcService.computeForProduction (T-10, abgeleiteter Plan)", () => {
  it("leitet Plan automatisch ab und stellt ihn dem Ist gegenüber", async () => {
    const repo = new InMemoryPostCalcRepository({
      pa: {
        revenueCents: 100000, materialCents: 40000, laborMinutes: 600,
        plan: { revenueCents: 100000, materialCents: 35000, laborMinutes: 500 },
      },
    });
    const service = new PostCalcService(repo);
    const res = await service.computeForProduction({ productionId: "pa", laborRateCentsPerMinute: 80 });
    expect(res.plan.dbCents).toBe(25000); // 100000 − 35000 − 40000
    expect(res.ist.dbCents).toBe(12000); // 100000 − 40000 − 48000
    expect(res.dbVarianceCents).toBe(-13000);
  });

  it("überschreibt die Plan-Lohnminuten manuell (stückzahlabhängig)", async () => {
    const repo = new InMemoryPostCalcRepository({
      pa: { revenueCents: 100000, materialCents: 40000, laborMinutes: 600, plan: { revenueCents: 100000, materialCents: 35000, laborMinutes: 500 } },
    });
    const service = new PostCalcService(repo);
    const res = await service.computeForProduction({ productionId: "pa", laborRateCentsPerMinute: 80, planLaborMinutes: 700 });
    expect(res.plan.laborCents).toBe(56000); // 700 × 80
  });

  it("wirft für einen unbekannten PA", async () => {
    const service = new PostCalcService(new InMemoryPostCalcRepository({}));
    await expect(service.computeForProduction({ productionId: "x", laborRateCentsPerMinute: 80 })).rejects.toThrow(/nicht gefunden/);
  });
});
