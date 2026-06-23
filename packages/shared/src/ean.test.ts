import { describe, expect, it } from "vitest";
import { isValidGtin, normalizeGtin } from "./ean.js";

describe("GTIN/EAN-Prüfung (B18)", () => {
  it("akzeptiert gültige EAN-13 mit korrekter Prüfziffer", () => {
    expect(isValidGtin("4006381333931")).toBe(true); // bekanntes Beispiel
    expect(isValidGtin("0012345678905")).toBe(true);
  });

  it("akzeptiert gültige EAN-8 und GTIN-14", () => {
    expect(isValidGtin("96385074")).toBe(true);
    expect(isValidGtin("00012345678905")).toBe(true);
  });

  it("lehnt falsche Prüfziffer ab", () => {
    expect(isValidGtin("4006381333930")).toBe(false);
    expect(isValidGtin("4006381333932")).toBe(false);
  });

  it("lehnt falsche Länge ab", () => {
    expect(isValidGtin("123")).toBe(false);
    expect(isValidGtin("12345678901234567")).toBe(false);
  });

  it("normalisiert Trennzeichen/Leerzeichen vor der Prüfung", () => {
    expect(normalizeGtin(" 4006381-333931 ")).toBe("4006381333931");
    expect(isValidGtin("4006381 333931")).toBe(true);
  });
});
