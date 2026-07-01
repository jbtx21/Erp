import { describe, expect, it } from "vitest";
import {
  EINRICHTUNG_SCHWELLE_STUECK,
  einrichtungFuerMenge,
  type EinrichtungKosten,
} from "./veredelung-einrichtung.js";

const fest: EinrichtungKosten = { ekCents: 3000, vkCents: 4500 };

describe("einrichtungFuerMenge — feste Einrichtung (EK+VK), nur < 10 Teile", () => {
  it("unter 10 Teilen: feste EK/VK unverändert (einmalig)", () => {
    expect(einrichtungFuerMenge(5, fest)).toEqual({ ekCents: 3000, vkCents: 4500 });
    expect(einrichtungFuerMenge(9, fest)).toEqual({ ekCents: 3000, vkCents: 4500 });
  });

  it("ab genau 10 Teilen entfällt die Einrichtung (Schwelle exklusiv)", () => {
    expect(einrichtungFuerMenge(EINRICHTUNG_SCHWELLE_STUECK, fest)).toBeNull();
    expect(einrichtungFuerMenge(100, fest)).toBeNull();
  });

  it("ohne gepflegte Einrichtung → null", () => {
    expect(einrichtungFuerMenge(3, null)).toBeNull();
    expect(einrichtungFuerMenge(3, undefined)).toBeNull();
  });

  it("individuelle Schwelle übersteuert den Default", () => {
    expect(einrichtungFuerMenge(20, fest, 25)).toEqual({ ekCents: 3000, vkCents: 4500 });
    expect(einrichtungFuerMenge(25, fest, 25)).toBeNull();
  });

  it("wirft bei negativer Menge und negativen Kosten", () => {
    expect(() => einrichtungFuerMenge(-1, fest)).toThrow();
    expect(() => einrichtungFuerMenge(3, { ekCents: -1, vkCents: 0 })).toThrow(/negativ/);
  });
});
