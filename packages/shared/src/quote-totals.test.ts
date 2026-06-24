import { describe, expect, it } from "vitest";
import { buildQuoteTotals, effectiveUnitNet, VAT_STANDARD_PCT } from "./quote-totals.js";

describe("effectiveUnitNet", () => {
  it("zieht den Positionsrabatt vom Listenpreis ab (gerundet)", () => {
    expect(effectiveUnitNet(10000, 10)).toBe(9000);
    expect(effectiveUnitNet(1999, 15)).toBe(1699); // 1999*0.85 = 1699,15 → 1699
  });
  it("klemmt den Rabatt auf 0..100 und behandelt null als 0 %", () => {
    expect(effectiveUnitNet(5000, null)).toBe(5000);
    expect(effectiveUnitNet(5000, -5)).toBe(5000);
    expect(effectiveUnitNet(5000, 200)).toBe(0);
  });
});

describe("buildQuoteTotals", () => {
  it("rechnet Netto/USt/Brutto über die Positionen", () => {
    const t = buildQuoteTotals([{ qty: 2, unitNetCents: 10000 }]); // 20000 netto, 19 %
    expect(t.netCents).toBe(20000);
    expect(t.taxCents).toBe(3800);
    expect(t.grossCents).toBe(23800);
    expect(VAT_STANDARD_PCT).toBe(19);
  });

  it("aggregiert die Steuer je Satz (19 % und 7 % gemischt)", () => {
    const t = buildQuoteTotals([
      { qty: 1, unitNetCents: 10000, taxRatePct: 19 },
      { qty: 1, unitNetCents: 10000, taxRatePct: 7 },
    ]);
    expect(t.netCents).toBe(20000);
    expect(t.taxCents).toBe(1900 + 700);
    expect(t.taxByRate).toEqual([
      { rate: 0.07, netCents: 10000, taxCents: 700 },
      { rate: 0.19, netCents: 10000, taxCents: 1900 },
    ]);
  });

  it("lässt Alternativpositionen aus der Summe", () => {
    const t = buildQuoteTotals([
      { qty: 1, unitNetCents: 10000 },
      { qty: 1, unitNetCents: 99900, isAlternative: true },
    ]);
    expect(t.netCents).toBe(10000);
    expect(t.grossCents).toBe(11900);
  });

  it("liefert Nullsummen, wenn nur Alternativen vorliegen", () => {
    const t = buildQuoteTotals([{ qty: 1, unitNetCents: 5000, isAlternative: true }]);
    expect(t).toMatchObject({ netCents: 0, taxCents: 0, grossCents: 0, totalDbCents: null });
  });

  it("summiert den Deckungsbeitrag (je Stück × Menge) über zählende Positionen; null ohne DB", () => {
    expect(buildQuoteTotals([{ qty: 1, unitNetCents: 5000 }]).totalDbCents).toBeNull();
    const t = buildQuoteTotals([
      { qty: 3, unitNetCents: 5000, dbCents: 1500 }, // 3 × 1500 = 4500
      { qty: 2, unitNetCents: 5000, dbCents: 500 }, //  2 × 500  = 1000
      { qty: 9, unitNetCents: 9999, dbCents: 9999, isAlternative: true }, // ignoriert
    ]);
    expect(t.totalDbCents).toBe(5500);
  });
});
