import { describe, expect, it } from "vitest";
import { threeWayMatch, type ThreeWayInput } from "./three-way-match.js";

const ok: ThreeWayInput = {
  poQty: 100,
  poUnitCents: 500,
  receivedQty: 100,
  invoicedQty: 100,
  invoicedUnitCents: 500,
};

describe("3-Way-Match (Kap. 9.6)", () => {
  it("akzeptiert deckungsgleiche Bestellung/Wareneingang/Rechnung", () => {
    expect(threeWayMatch(ok)).toEqual({ ok: true, variances: [] });
  });

  it("sperrt, wenn mehr berechnet als bestellt wurde", () => {
    const r = threeWayMatch({ ...ok, invoicedQty: 120, receivedQty: 120 });
    expect(r.ok).toBe(false);
    expect(r.variances).toContain("MENGE_RECHNUNG_UEBER_BESTELLUNG");
  });

  it("sperrt, wenn mehr berechnet als geliefert wurde", () => {
    const r = threeWayMatch({ ...ok, invoicedQty: 100, receivedQty: 80 });
    expect(r.variances).toContain("MENGE_RECHNUNG_UEBER_WARENEINGANG");
  });

  it("sperrt bei Preisabweichung über Toleranz", () => {
    const r = threeWayMatch({ ...ok, invoicedUnitCents: 550 });
    expect(r.variances).toEqual(["PREIS_ABWEICHUNG"]);
  });

  it("akzeptiert Abweichung innerhalb der Toleranz", () => {
    const r = threeWayMatch(
      { ...ok, invoicedUnitCents: 505 },
      { qtyTolerance: 0, priceToleranceCents: 10 }
    );
    expect(r.ok).toBe(true);
  });
});
