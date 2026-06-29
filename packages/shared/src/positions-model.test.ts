import { describe, expect, it } from "vitest";
import { computePositionTotals, lineTypeOf, type PositionLine } from "./positions-model.js";

const art = (over: Partial<PositionLine> = {}): PositionLine => ({ description: "x", qty: 1, unitNetCents: 1000, ...over });

describe("computePositionTotals", () => {
  it("summiert nur zählende ARTIKEL-Positionen (Netto/USt je Satz/Brutto)", () => {
    const t = computePositionTotals([
      art({ qty: 200, unitNetCents: 1290 }), // 258000
      art({ qty: 10, unitNetCents: 500 }), //   5000
    ]);
    expect(t.netCents).toBe(263000);
    expect(t.taxCents).toBe(Math.round(263000 * 0.19));
    expect(t.grossCents).toBe(263000 + Math.round(263000 * 0.19));
  });

  it("nimmt Alternativpositionen aus der Summe (Xentral-Optional)", () => {
    const t = computePositionTotals([
      art({ qty: 1, unitNetCents: 10000 }),
      art({ qty: 1, unitNetCents: 99900, isAlternative: true }),
    ]);
    expect(t.netCents).toBe(10000);
  });

  it("rundet USt je Satz (nicht je Zeile): 100×1ct @19% = 19ct, nicht 0", () => {
    const t = computePositionTotals(Array.from({ length: 100 }, () => art({ qty: 1, unitNetCents: 1 })));
    expect(t.netCents).toBe(100);
    expect(t.taxCents).toBe(19);
  });

  it("aggregiert gemischte Steuersätze je Satz", () => {
    const t = computePositionTotals([
      art({ qty: 1, unitNetCents: 10000, taxRatePct: 19 }),
      art({ qty: 1, unitNetCents: 10000, taxRatePct: 7 }),
    ]);
    expect(t.taxByRate.map((r) => r.rate).sort()).toEqual([0.07, 0.19]);
    expect(t.taxCents).toBe(Math.round(10000 * 0.07) + Math.round(10000 * 0.19));
  });

  it("ZWISCHENSUMME = laufendes Netto aller zählenden Positionen oberhalb", () => {
    const t = computePositionTotals([
      art({ qty: 2, unitNetCents: 1000 }), // 2000
      art({ qty: 3, unitNetCents: 1000 }), // 3000
      { lineType: "ZWISCHENSUMME", description: "Zwischensumme", qty: 0, unitNetCents: 0 },
      art({ qty: 1, unitNetCents: 1000 }), // 1000
    ]);
    const zw = t.rows.find((r) => r.lineType === "ZWISCHENSUMME");
    expect(zw?.computedNetCents).toBe(5000); // nur die zwei oberhalb
    expect(t.netCents).toBe(6000); // gesamt (Summenzeile zählt nicht doppelt)
  });

  it("GRUPPENSUMME = Netto seit der letzten Gruppenüberschrift; GRUPPE zählt nicht", () => {
    const t = computePositionTotals([
      { lineType: "GRUPPE", description: "Textilien", qty: 0, unitNetCents: 0 },
      art({ qty: 2, unitNetCents: 1000 }), // 2000
      { lineType: "GRUPPENSUMME", description: "Summe Textilien", qty: 0, unitNetCents: 0 },
      { lineType: "GRUPPE", description: "Veredelung", qty: 0, unitNetCents: 0 },
      art({ qty: 5, unitNetCents: 190 }), // 950
      { lineType: "GRUPPENSUMME", description: "Summe Veredelung", qty: 0, unitNetCents: 0 },
    ]);
    const sums = t.rows.filter((r) => r.lineType === "GRUPPENSUMME").map((r) => r.computedNetCents);
    expect(sums).toEqual([2000, 950]); // je Block zurückgesetzt
    expect(t.netCents).toBe(2950);
  });

  it("Deckungsbeitrag-Summe = null ohne DB, sonst Σ qty×dbCents", () => {
    expect(computePositionTotals([art()]).totalDbCents).toBeNull();
    const t = computePositionTotals([art({ qty: 10, dbCents: 300 }), art({ qty: 5, dbCents: 100 })]);
    expect(t.totalDbCents).toBe(10 * 300 + 5 * 100);
  });

  it("lineTypeOf liefert ARTIKEL als Default", () => {
    expect(lineTypeOf({})).toBe("ARTIKEL");
    expect(lineTypeOf({ lineType: "GRUPPE" })).toBe("GRUPPE");
  });
});
