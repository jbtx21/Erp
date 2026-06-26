import { describe, expect, it } from "vitest";
import {
  ATTR_FARBE,
  ATTR_GROESSE,
  attributesFromWooMeta,
  buildVariantMatrix,
  resolveVariantAttributes,
  skuCode,
  VariantAttributeError,
  variantKey,
} from "./variants.js";

describe("Varianten-Matrix (Farbe×Größe)", () => {
  it("bildet das vollständige kartesische Raster mit stabilen SKUs", () => {
    const m = buildVariantMatrix("POLO-01", ["Navy", "Weiß"], ["M", "L"]);
    expect(m).toHaveLength(4);
    expect(m.map((v) => v.sku)).toEqual(["POLO-01-NAVY-M", "POLO-01-NAVY-L", "POLO-01-WEISS-M", "POLO-01-WEISS-L"]);
  });
  it("entfernt leere Werte + Duplikate je Achse (case-insensitiv)", () => {
    const m = buildVariantMatrix("T1", ["Navy", "navy", "  "], ["S", "S", ""]);
    expect(m).toHaveLength(1);
    expect(m[0]?.sku).toBe("T1-NAVY-S");
  });
  it("skuCode löst Umlaute auf und säubert", () => {
    expect(skuCode("French Navy")).toBe("FRENCH-NAVY");
    expect(skuCode("Größe 42")).toBe("GROESSE-42");
    expect(skuCode("XL")).toBe("XL");
  });
  it("verlangt eine Artikel-SKU", () => {
    expect(() => buildVariantMatrix("  ", ["Navy"], ["M"])).toThrow(VariantAttributeError);
  });
});

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
