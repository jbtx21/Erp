import { describe, it, expect } from "vitest";
import {
  markupVk,
  deckungsbeitrag,
  dbMarge,
  STICK_MARKUP_FACTOR,
  selectTier,
  resolveBasePrice,
  PriceResolutionError,
  type PriceTier,
} from "./pricing.js";
import { gross, taxOnNet, lineNet } from "./money.js";

describe("pricing — Stick-Aufschlag (Kap. 4.4)", () => {
  it("VK = EK × 1,88", () => {
    expect(STICK_MARKUP_FACTOR).toBe(1.88);
    // EK 10,00 € → VK 18,80 €
    expect(markupVk(1000)).toBe(1880);
  });

  it("rundet kaufmännisch auf ganze Cent", () => {
    // EK 3,33 € × 1,88 = 6,2604 € → 626 ct
    expect(markupVk(333)).toBe(626);
  });

  it("DB und Marge", () => {
    expect(deckungsbeitrag(1880, 1000)).toBe(880);
    expect(dbMarge(1880, 1000)).toBeCloseTo(0.468, 3);
  });

  it("lehnt ungültige Werte ab", () => {
    expect(() => markupVk(-1)).toThrow();
    expect(() => markupVk(1000, 0)).toThrow();
  });
});

describe("Mengenstaffel selectTier (B4 / T-15)", () => {
  const tiers: PriceTier[] = [
    { minMenge: 1, netCents: 1000 },
    { minMenge: 10, netCents: 900 },
    { minMenge: 50, netCents: 800 },
  ];

  it("wählt die größte minMenge ≤ Bestellmenge", () => {
    expect(selectTier(tiers, 1)?.netCents).toBe(1000);
    expect(selectTier(tiers, 9)?.netCents).toBe(1000);
    expect(selectTier(tiers, 10)?.netCents).toBe(900); // T-15: Grenze erreicht → Stufenpreis
    expect(selectTier(tiers, 49)?.netCents).toBe(900);
    expect(selectTier(tiers, 50)?.netCents).toBe(800);
    expect(selectTier(tiers, 999)?.netCents).toBe(800);
  });

  it("gibt null, wenn keine Stufe greift", () => {
    expect(selectTier([{ minMenge: 10, netCents: 900 }], 5)).toBeNull();
    expect(selectTier([], 100)).toBeNull();
  });
});

describe("resolveBasePrice — eine Pipeline mit Präzedenz (B4)", () => {
  const groupPrices = [{ priceGroup: "STANDARD" as const, netCents: 1200 }];
  const groupTiers: PriceTier[] = [
    { minMenge: 1, netCents: 1000 },
    { minMenge: 10, netCents: 900 },
  ];
  const customerTiers: PriceTier[] = [
    { minMenge: 1, netCents: 850 },
    { minMenge: 10, netCents: 800 },
  ];

  it("kundenindividuelle Staffel sticht vor Preisgruppen-Staffel und Einzelpreis", () => {
    expect(resolveBasePrice({ customerTiers, groupTiers, groupPrices }, "STANDARD", 1)).toBe(850);
    expect(resolveBasePrice({ customerTiers, groupTiers, groupPrices }, "STANDARD", 10)).toBe(800);
  });

  it("ohne Kundenstaffel greift die Preisgruppen-Staffel", () => {
    expect(resolveBasePrice({ groupTiers, groupPrices }, "STANDARD", 5)).toBe(1000);
    expect(resolveBasePrice({ groupTiers, groupPrices }, "STANDARD", 25)).toBe(900);
  });

  it("ohne Staffeln fällt es auf den Einzelpreis der Preisgruppe zurück", () => {
    expect(resolveBasePrice({ groupPrices }, "STANDARD", 100)).toBe(1200);
  });

  it("fällt unter der Staffelschwelle auf den Standardpreis zurück (Listenpreis, ein Pfad)", () => {
    // WIEDERVERKAEUFER hat nur eine Staffel ab 25 Stk und KEINEN eigenen Einzelpreis,
    // aber es gibt einen Standardpreis (1290). Unter 25 Stk → Standardpreis statt Fehler.
    const wvTiers: PriceTier[] = [{ minMenge: 25, netCents: 1100 }];
    const prices = [{ priceGroup: "STANDARD" as const, netCents: 1290 }];
    expect(resolveBasePrice({ groupTiers: wvTiers, groupPrices: prices }, "WIEDERVERKAEUFER", 10)).toBe(1290);
    expect(resolveBasePrice({ groupTiers: wvTiers, groupPrices: prices }, "WIEDERVERKAEUFER", 25)).toBe(1100);
  });

  it("wirft sichtbar, wenn gar kein Preis hinterlegt ist (T-08)", () => {
    expect(() => resolveBasePrice({}, "STANDARD", 5)).toThrow(PriceResolutionError);
  });
});

describe("money (Kap. 9)", () => {
  it("Zeilennetto, Steuer, Brutto", () => {
    const net = lineNet(3, 1880); // 56,40 €
    expect(net).toBe(5640);
    expect(taxOnNet(net, 0.19)).toBe(1072); // 10,716 → 1072 ct
    expect(gross(net, 0.19)).toBe(6712);
  });
});
