import { describe, expect, it } from "vitest";
import {
  ATTR_FARBE,
  ATTR_GROESSE,
  attributesFromWooMeta,
  resolveVariantAttributes,
  VariantAttributeError,
  variantKey,
} from "./variants.js";

describe("Variantenstruktur (T-02)", () => {
  it("akzeptiert exakt Farbe + Größe und normalisiert Whitespace", () => {
    const r = resolveVariantAttributes([
      { name: "Farbe", value: " Rot " },
      { name: "Größe", value: "XL" },
    ]);
    expect(r[ATTR_FARBE]).toBe("Rot");
    expect(r[ATTR_GROESSE]).toBe("XL");
  });

  it("lehnt unbekannte Attributnamen ab (keine inkonsistenten Varianten)", () => {
    expect(() =>
      resolveVariantAttributes([
        { name: "Farbe", value: "Rot" },
        { name: "Material", value: "Baumwolle" },
      ])
    ).toThrow(VariantAttributeError);
  });

  it("verlangt beide Pflichtattribute", () => {
    expect(() => resolveVariantAttributes([{ name: "Farbe", value: "Rot" }])).toThrow(
      /Größe/
    );
  });

  it("lehnt Duplikate und leere Werte ab", () => {
    expect(() =>
      resolveVariantAttributes([
        { name: "Farbe", value: "Rot" },
        { name: "Farbe", value: "Blau" },
        { name: "Größe", value: "M" },
      ])
    ).toThrow(/doppelt/);
    expect(() =>
      resolveVariantAttributes([
        { name: "Farbe", value: "  " },
        { name: "Größe", value: "M" },
      ])
    ).toThrow(/ohne Wert/);
  });

  it("erzeugt einen reihenfolge-unabhängigen, stabilen Variantenschlüssel", () => {
    const a = variantKey([
      { name: "Farbe", value: "Rot" },
      { name: "Größe", value: "M" },
    ]);
    const b = variantKey([
      { name: "Größe", value: "M" },
      { name: "Farbe", value: "Rot" },
    ]);
    expect(a).toBe(b);
  });

  it("mappt WooCommerce meta_data (Slugs) auf Pflichtattribute", () => {
    const attrs = attributesFromWooMeta([
      { key: "pa_farbe", value: "Schwarz" },
      { key: "pa_groesse", value: "L" },
      { key: "_irrelevant", value: "x" },
    ]);
    const r = resolveVariantAttributes(attrs);
    expect(r).toEqual({ [ATTR_FARBE]: "Schwarz", [ATTR_GROESSE]: "L" });
  });
});
