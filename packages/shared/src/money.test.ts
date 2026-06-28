// Tests für die Geldarithmetik und das robuste Parsen von Freitext-Geldeingaben.
// Kernfall: der FACH-PRICE-Bug — „1.234,56" darf NICHT zu „1,23" verstümmelt werden.

import { describe, expect, it } from "vitest";
import { eurToCents, formatEuroAmount, parseEuroInput } from "./money.js";

describe("parseEuroInput", () => {
  it("deutscher Tausenderpunkt + Dezimalkomma (FACH-PRICE-Regression)", () => {
    expect(parseEuroInput("1.234,56")).toBeCloseTo(1234.56, 5);
    expect(parseEuroInput("1.234.567,89")).toBeCloseTo(1234567.89, 5);
    expect(parseEuroInput("12.500,00")).toBeCloseTo(12500, 5);
  });

  it("nur Dezimalkomma", () => {
    expect(parseEuroInput("1234,56")).toBeCloseTo(1234.56, 5);
    expect(parseEuroInput("9,90")).toBeCloseTo(9.9, 5);
    expect(parseEuroInput("0,05")).toBeCloseTo(0.05, 5);
  });

  it("Dezimalpunkt vom Ziffernblock / Copy-Paste (1–2 Nachkommastellen)", () => {
    expect(parseEuroInput("9.90")).toBeCloseTo(9.9, 5);
    expect(parseEuroInput("12.5")).toBeCloseTo(12.5, 5);
    expect(parseEuroInput("100.00")).toBeCloseTo(100, 5);
  });

  it("einzelner Punkt mit 3 Folgestellen ⇒ Tausendergruppe (deutscher Default)", () => {
    expect(parseEuroInput("1.234")).toBeCloseTo(1234, 5);
    expect(parseEuroInput("1.500")).toBeCloseTo(1500, 5);
    expect(parseEuroInput("999.000")).toBeCloseTo(999000, 5);
  });

  it("führende Null vor 3 Folgestellen bleibt Dezimal (keine sinnlose Tausendergruppe)", () => {
    expect(parseEuroInput("0.125")).toBeCloseTo(0.125, 5);
  });

  it("mehrere Punkte ohne Komma ⇒ Tausender", () => {
    expect(parseEuroInput("1.234.567")).toBeCloseTo(1234567, 5);
  });

  it("englische Mischform: rechtester Trenner ist der Dezimaltrenner", () => {
    expect(parseEuroInput("1,234.56")).toBeCloseTo(1234.56, 5);
  });

  it("Vorzeichen, Whitespace und €-Symbol", () => {
    expect(parseEuroInput("-9,90")).toBeCloseTo(-9.9, 5);
    expect(parseEuroInput(" 1.234,56 €")).toBeCloseTo(1234.56, 5);
    expect(parseEuroInput("+12,00")).toBeCloseTo(12, 5);
  });

  it("leere/ungültige Eingabe ⇒ null", () => {
    expect(parseEuroInput("")).toBeNull();
    expect(parseEuroInput("   ")).toBeNull();
    expect(parseEuroInput("-")).toBeNull();
    expect(parseEuroInput("abc")).toBeNull();
    expect(parseEuroInput("1,2,abc")).toBeNull();
  });

  it("ganze Zahlen ohne Trenner", () => {
    expect(parseEuroInput("100")).toBe(100);
    expect(parseEuroInput("0")).toBe(0);
  });
});

describe("formatEuroAmount", () => {
  it("formatiert de-DE mit zwei Nachkommastellen ohne €-Symbol", () => {
    expect(formatEuroAmount(1234.56)).toBe("1.234,56");
    expect(formatEuroAmount(9.9)).toBe("9,90");
    expect(formatEuroAmount(0)).toBe("0,00");
  });
});

describe("Roundtrip parseEuroInput → eurToCents", () => {
  it("deutsche Eingabe ergibt korrekte Cent", () => {
    const euros = parseEuroInput("1.234,56");
    expect(euros).not.toBeNull();
    expect(eurToCents(euros!)).toBe(123456);
  });
});
