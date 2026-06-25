import { describe, expect, it } from "vitest";
import { computeAbschlag, abschlagSummary, AbschlagError } from "./abschlag.js";

describe("computeAbschlag", () => {
  it("prozentual mit USt", () => {
    expect(computeAbschlag(100000, 19, { percent: 30 })).toEqual({ netCents: 30000, taxCents: 5700, grossCents: 35700, percent: 30 });
  });
  it("Festbetrag mit USt", () => {
    expect(computeAbschlag(100000, 19, { netCents: 25000 })).toEqual({ netCents: 25000, taxCents: 4750, grossCents: 29750, percent: null });
  });
  it("validiert Eingaben", () => {
    expect(() => computeAbschlag(1000, 19, { percent: 0 })).toThrow(AbschlagError);
    expect(() => computeAbschlag(1000, 19, { percent: 150 })).toThrow(AbschlagError);
    expect(() => computeAbschlag(1000, 19, { netCents: 0 })).toThrow(AbschlagError);
    expect(() => computeAbschlag(1000, 19, {})).toThrow(AbschlagError);
  });
});

describe("abschlagSummary", () => {
  it("rechnet Restsumme aus Auftrag − Abschläge", () => {
    const s = abschlagSummary(100000, [{ netCents: 30000 }, { netCents: 20000 }]);
    expect(s).toEqual({ orderNetCents: 100000, sumNetCents: 50000, restNetCents: 50000, count: 2 });
  });
  it("Restsumme nie negativ (Überzahlung der Abschläge)", () => {
    expect(abschlagSummary(50000, [{ netCents: 60000 }]).restNetCents).toBe(0);
  });
});
