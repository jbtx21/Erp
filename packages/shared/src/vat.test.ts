import { describe, expect, it } from "vitest";
import { isValidGermanVatChecksum, normalizeVatId, validateVatId } from "./vat.js";

describe("USt-IdNr-Prüfung", () => {
  it("normalisiert Leer-/Sonderzeichen", () => {
    expect(normalizeVatId(" de 136 695 976 ")).toBe("DE136695976");
  });

  it("akzeptiert eine gültige deutsche USt-IdNr (Prüfziffer korrekt)", () => {
    expect(validateVatId("DE136695976")).toMatchObject({ valid: true, country: "DE", normalized: "DE136695976" });
    expect(isValidGermanVatChecksum("136695976")).toBe(true);
  });

  it("lehnt eine deutsche USt-IdNr mit falscher Prüfziffer ab", () => {
    const r = validateVatId("DE136695977");
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/Prüfziffer/);
  });

  it("lehnt falsche Länge / falsches Format ab", () => {
    expect(validateVatId("DE12345").valid).toBe(false); // zu kurz
    expect(validateVatId("DE1369A5976").valid).toBe(false); // Buchstabe
  });

  it("prüft das Format anderer EU-Länder (ohne Prüfziffer)", () => {
    expect(validateVatId("ATU12345678").valid).toBe(true);
    expect(validateVatId("NL123456789B01").valid).toBe(true);
    expect(validateVatId("FRXX123456789").valid).toBe(true);
    expect(validateVatId("AT12345678").valid).toBe(false); // AT braucht führendes U
  });

  it("meldet leere Eingabe und unbekannte Länderkürzel", () => {
    expect(validateVatId("").reason).toMatch(/leer/);
    expect(validateVatId("XX123").reason).toMatch(/Länderkürzel/);
    expect(validateVatId("12345").reason).toMatch(/Länderkürzel/);
  });
});
