import { describe, expect, it } from "vitest";
import { determineRoute, ORDER_ROUTES, routeProgress } from "./workflow.js";

describe("Auftrags-Workflow / Routen", () => {
  it("bestimmt die Route aus den Veredelungs-Merkmalen", () => {
    expect(determineRoute({ hasVeredelung: false, hasIntern: false, hasExtern: false })).toBe("ROUTE1_KEINE");
    expect(determineRoute({ hasVeredelung: true, hasIntern: true, hasExtern: false })).toBe("ROUTE2_INTERN");
    expect(determineRoute({ hasVeredelung: true, hasIntern: false, hasExtern: true })).toBe("ROUTE3_EXTERN");
    expect(determineRoute({ hasVeredelung: true, hasIntern: true, hasExtern: true })).toBe("ROUTE4_EXTERN_INTERN");
  });

  it("jede Route beginnt mit Anlage und endet mit Abrechnung & Versand", () => {
    for (const r of Object.values(ORDER_ROUTES)) {
      expect(r.steps[0]?.key).toBe("angelegt");
      expect(r.steps[r.steps.length - 1]?.key).toBe("abrechnung_versand");
    }
    expect(ORDER_ROUTES.ROUTE4_EXTERN_INTERN.steps.length).toBeGreaterThan(ORDER_ROUTES.ROUTE1_KEINE.steps.length);
  });

  it("Fortschritt: aktueller/nächster Schritt + done", () => {
    const p = routeProgress("ROUTE1_KEINE", 0);
    expect(p.currentStep?.key).toBe("angelegt");
    expect(p.nextStep?.key).toBe("bestellvorschlag");
    expect(p.done).toBe(false);
    const end = routeProgress("ROUTE1_KEINE", 5);
    expect(end.done).toBe(true);
    expect(end.currentStep).toBeNull();
    expect(end.steps.every((s) => s.done)).toBe(true);
  });
});
