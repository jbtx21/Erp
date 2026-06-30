import { describe, expect, it } from "vitest";
import {
  bpToFactor,
  factorToBp,
  resolveCustomerPriceGroup,
  resolveSupplierVk,
  type SupplierMarkupEntry,
} from "./supplier-markup.js";
import { PriceResolutionError } from "./pricing.js";

describe("Lieferanten-Aufschlag (Kap. 4.4): VK = EK × Faktor(Lieferant × Kundengruppe)", () => {
  // HAKRO-artige Matrix: Standard 1,88; Premium günstiger; Wiederverkäufer am günstigsten.
  const hakro: SupplierMarkupEntry[] = [
    { priceGroup: "STANDARD", factorBp: factorToBp(1.88) },
    { priceGroup: "PREMIUM", factorBp: factorToBp(1.6) },
    { priceGroup: "WIEDERVERKAEUFER", factorBp: factorToBp(1.35) },
  ];

  it("factorToBp/bpToFactor sind invers (1,88 ⇒ 18800)", () => {
    expect(factorToBp(1.88)).toBe(18800);
    expect(bpToFactor(18800)).toBeCloseTo(1.88);
  });

  it("Grund-VK = EK × Standard-Faktor (STANDARD-Kunde)", () => {
    const r = resolveSupplierVk({ ekCents: 1000, markups: hakro, group: "STANDARD" });
    expect(r).toMatchObject({ vkCents: 1880, factorBp: 18800, group: "STANDARD", source: "gruppe" });
  });

  it("Gruppen-Faktor gewinnt (Premium günstiger)", () => {
    const r = resolveSupplierVk({ ekCents: 1000, markups: hakro, group: "PREMIUM" });
    expect(r).toMatchObject({ vkCents: 1600, factorBp: 16000, group: "PREMIUM", source: "gruppe" });
  });

  it("fehlt der Gruppen-Faktor → Rückfall auf Standard-Faktor (Grund-VK), Gruppe meldet STANDARD", () => {
    // TOP ist in der HAKRO-Matrix nicht gepflegt.
    const r = resolveSupplierVk({ ekCents: 1000, markups: hakro, group: "TOP" });
    expect(r).toMatchObject({ vkCents: 1880, factorBp: 18800, group: "STANDARD", source: "standard" });
  });

  it("manueller Override gewinnt immer (kein Faktor angewandt)", () => {
    const r = resolveSupplierVk({ ekCents: 1000, markups: hakro, group: "PREMIUM", overrideNetCents: 999 });
    expect(r).toMatchObject({ vkCents: 999, factorBp: null, source: "override" });
  });

  it("Rundung kaufmännisch auf Cent (EK 1234 × 1,88 = 2319,92 → 2320)", () => {
    expect(resolveSupplierVk({ ekCents: 1234, markups: hakro, group: "STANDARD" }).vkCents).toBe(2320);
  });

  it("ohne jeden Faktor → sichtbarer Pflegefehler (T-08)", () => {
    expect(() => resolveSupplierVk({ ekCents: 1000, markups: [], group: "PREMIUM" })).toThrow(PriceResolutionError);
  });
});

describe("Kundengruppe je Lieferant (Premium@HAKRO, Standard@Stanley)", () => {
  it("kundenindividuelle Lieferanten-Gruppe gewinnt vor globaler Standardgruppe", () => {
    expect(resolveCustomerPriceGroup({ perSupplierGroup: "PREMIUM", companyDefaultGroup: "TOP" })).toBe("PREMIUM");
  });
  it("ohne Lieferanten-Zuordnung → globale Standardgruppe der Firma", () => {
    expect(resolveCustomerPriceGroup({ perSupplierGroup: null, companyDefaultGroup: "TOP" })).toBe("TOP");
  });
  it("ohne alles → STANDARD", () => {
    expect(resolveCustomerPriceGroup({})).toBe("STANDARD");
  });
});

describe("factorToBp", () => {
  it("lehnt nicht-positive Faktoren ab", () => {
    expect(() => factorToBp(0)).toThrow();
  });
});
