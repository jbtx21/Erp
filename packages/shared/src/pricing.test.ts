import { describe, it, expect } from "vitest";
import { markupVk, deckungsbeitrag, dbMarge, STICK_MARKUP_FACTOR } from "./pricing.js";
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

describe("money (Kap. 9)", () => {
  it("Zeilennetto, Steuer, Brutto", () => {
    const net = lineNet(3, 1880); // 56,40 €
    expect(net).toBe(5640);
    expect(taxOnNet(net, 0.19)).toBe(1072); // 10,716 → 1072 ct
    expect(gross(net, 0.19)).toBe(6712);
  });
});
