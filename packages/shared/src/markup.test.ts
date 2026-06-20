import { describe, expect, it } from "vitest";
import {
  DEFAULT_MARKUP_CONFIG,
  resolveMarkupFactor,
  validateMarkupConfig,
  type MarkupConfig,
} from "./markup.js";

describe("Aufschlagsfaktor-Auflösung (Kap. 4.4): Default + Regeln + Logo-Override", () => {
  const config: MarkupConfig = {
    defaultFactor: 1.88,
    rules: [
      { id: "vip", factor: 1.6, priceGroupId: "VIP" }, // Kundengruppe
      { id: "klein", factor: 2.1, maxMenge: 9 }, // Mengenstaffel (kleine Mengen teurer)
      { id: "stick-billig", factor: 2.3, finishingType: "STICKEREI", maxEkCents: 500 }, // Veredelung + EK-Wert
    ],
  };

  it("ohne passende Regel → globaler Standardfaktor", () => {
    const r = resolveMarkupFactor(config, { priceGroupId: "STD", menge: 100, ekCents: 1_000 });
    expect(r).toMatchObject({ factor: 1.88, source: "default" });
  });

  it("Kundengruppen-Regel greift", () => {
    expect(resolveMarkupFactor(config, { priceGroupId: "VIP", menge: 100 }).factor).toBe(1.6);
  });

  it("Mengen-Regel greift bei kleiner Menge", () => {
    const r = resolveMarkupFactor(config, { priceGroupId: "STD", menge: 5, ekCents: 1_000 });
    expect(r).toMatchObject({ factor: 2.1, source: "rule", ruleId: "klein" });
  });

  it("spezifischere Regel gewinnt (Veredelung+EK schlägt Menge)", () => {
    // menge 5 (maxMenge 9 trifft, 1 Bedingung) vs. stick-billig (finishing+maxEk, 2 Bedingungen)
    const r = resolveMarkupFactor(config, { finishingType: "STICKEREI", menge: 5, ekCents: 400 });
    expect(r.ruleId).toBe("stick-billig");
    expect(r.factor).toBe(2.3);
  });

  it("Mengen-Bedingung greift nicht, wenn Menge unbekannt", () => {
    expect(resolveMarkupFactor(config, { priceGroupId: "STD" }).source).toBe("default");
  });

  it("Logo-Override gewinnt immer", () => {
    const r = resolveMarkupFactor(config, { priceGroupId: "VIP", menge: 5, ekCents: 400 }, 1.95);
    expect(r).toMatchObject({ factor: 1.95, source: "logo-override" });
  });

  it("Logo-Override muss > 0 sein", () => {
    expect(() => resolveMarkupFactor(config, {}, 0)).toThrow(/> 0/);
  });

  it("DEFAULT_MARKUP_CONFIG ist 1,88 ohne Regeln", () => {
    expect(DEFAULT_MARKUP_CONFIG.defaultFactor).toBe(1.88);
    expect(resolveMarkupFactor(DEFAULT_MARKUP_CONFIG, { menge: 50 }).factor).toBe(1.88);
  });
});

describe("validateMarkupConfig", () => {
  it("akzeptiert eine gültige Konfiguration", () => {
    expect(() => validateMarkupConfig(DEFAULT_MARKUP_CONFIG)).not.toThrow();
  });
  it("lehnt Faktor ≤ 0 und inkonsistente Bereiche ab", () => {
    expect(() => validateMarkupConfig({ defaultFactor: 0, rules: [] })).toThrow(/Standard/);
    expect(() => validateMarkupConfig({ defaultFactor: 1.88, rules: [{ factor: 0 }] })).toThrow(/Regel-Aufschlag/);
    expect(() =>
      validateMarkupConfig({ defaultFactor: 1.88, rules: [{ factor: 2, minMenge: 100, maxMenge: 10 }] })
    ).toThrow(/minMenge/);
    expect(() =>
      validateMarkupConfig({ defaultFactor: 1.88, rules: [{ factor: 2, minEkCents: 900, maxEkCents: 100 }] })
    ).toThrow(/minEkCents/);
  });
});
