import { describe, expect, it } from "vitest";
import {
  assertGtin13,
  assertSellable,
  gtin13CheckDigit,
  InvalidGtinError,
  isLabelingComplete,
  isValidGtin13,
  LabelingIncompleteError,
} from "./pim.js";

describe("GTIN-13 Prüfziffer", () => {
  it("berechnet die Prüfziffer (bekanntes Beispiel 4006381333931)", () => {
    expect(gtin13CheckDigit("400638133393")).toBe(1);
  });

  it("akzeptiert gültige GTIN-13", () => {
    expect(isValidGtin13("4006381333931")).toBe(true);
  });

  it("lehnt falsche Prüfziffer / falsches Format ab", () => {
    expect(isValidGtin13("4006381333930")).toBe(false); // falsche Prüfziffer
    expect(isValidGtin13("123")).toBe(false);
    expect(isValidGtin13("abcdefghijklm")).toBe(false);
  });

  it("assertGtin13 wirft bei ungültiger GTIN", () => {
    expect(assertGtin13("4006381333931")).toBe("4006381333931");
    expect(() => assertGtin13("4006381333930")).toThrow(InvalidGtinError);
  });
});

describe("Textilkennzeichnung (EU-VO 1007/2011)", () => {
  it("vollständig nur mit Faserzusammensetzung", () => {
    expect(isLabelingComplete({ materialComposition: "100% Baumwolle" })).toBe(true);
    expect(isLabelingComplete({ materialComposition: "  " })).toBe(false);
    expect(isLabelingComplete({ materialComposition: null })).toBe(false);
    expect(isLabelingComplete({})).toBe(false);
  });

  it("assertSellable blockiert Artikel ohne Materialangabe", () => {
    expect(() => assertSellable({ materialComposition: "80% PES / 20% BW" })).not.toThrow();
    expect(() => assertSellable({})).toThrow(LabelingIncompleteError);
  });
});

import { articleCompleteness, PIM_FIELDS } from "./pim.js";

describe("PIM-Vollständigkeit", () => {
  it("0% bei leerem Artikel, listet alle fehlenden Felder", () => {
    const c = articleCompleteness({});
    expect(c.percent).toBe(0);
    expect(c.missing).toHaveLength(PIM_FIELDS.length);
  });
  it("zählt gefüllte Felder und ignoriert Leerstrings", () => {
    const c = articleCompleteness({ brand: "TEXMA", description: "  ", materialComposition: "Baumwolle" });
    expect(c.filled).toBe(2);
    expect(c.missing).toContain("Beschreibung");
  });
  it("100% wenn alle Felder gefüllt", () => {
    const full = Object.fromEntries(PIM_FIELDS.map((f) => [f.key, "x"]));
    expect(articleCompleteness(full).percent).toBe(100);
  });
});
