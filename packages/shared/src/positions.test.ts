import { describe, expect, it } from "vitest";
import { sumByKind } from "./positions.js";

describe("sumByKind (Textil/Veredelung getrennt)", () => {
  it("summiert je Positionsart und gesamt", () => {
    const t = sumByKind([
      { kind: "TEXTIL", qty: 10, unitNetCents: 500 },      // 5000
      { kind: "VEREDELUNG", qty: 10, unitNetCents: 300 },  // 3000
      { kind: "VEREDELUNG", qty: 2, unitNetCents: 1000 },  // 2000
      { kind: "SONSTIGE", qty: 1, unitNetCents: 690 },     // 690
    ]);
    expect(t.textilCents).toBe(5000);
    expect(t.veredelungCents).toBe(5000);
    expect(t.sonstigeCents).toBe(690);
    expect(t.totalCents).toBe(10690);
  });

  it("leere Liste → alles 0", () => {
    expect(sumByKind([])).toEqual({ textilCents: 0, veredelungCents: 0, sonstigeCents: 0, totalCents: 0 });
  });
});
