import { describe, expect, it } from "vitest";
import { redeemGutschein, isGutscheinValid, GutscheinError } from "./gutschein.js";

describe("redeemGutschein", () => {
  it("löst voll ein, wenn Guthaben reicht", () => {
    expect(redeemGutschein(5000, 2000)).toEqual({ appliedCents: 2000, remainingCents: 3000 });
  });
  it("löst nur das Restguthaben ein (Teil-Einlösung)", () => {
    expect(redeemGutschein(1500, 2000)).toEqual({ appliedCents: 1500, remainingCents: 0 });
  });
  it("wirft bei 0 Guthaben oder ungültigem Betrag", () => {
    expect(() => redeemGutschein(0, 100)).toThrow(GutscheinError);
    expect(() => redeemGutschein(100, 0)).toThrow(GutscheinError);
  });
});

describe("isGutscheinValid", () => {
  const today = new Date("2026-06-25T00:00:00Z");
  it("gültig: aktiv, Guthaben, nicht abgelaufen", () => {
    expect(isGutscheinValid({ active: true, validUntil: new Date("2026-12-31"), remainingCents: 1000 }, today)).toBe(true);
    expect(isGutscheinValid({ active: true, validUntil: null, remainingCents: 1000 }, today)).toBe(true);
  });
  it("ungültig: inaktiv / leer / abgelaufen", () => {
    expect(isGutscheinValid({ active: false, validUntil: null, remainingCents: 1000 }, today)).toBe(false);
    expect(isGutscheinValid({ active: true, validUntil: null, remainingCents: 0 }, today)).toBe(false);
    expect(isGutscheinValid({ active: true, validUntil: new Date("2026-01-01"), remainingCents: 1000 }, today)).toBe(false);
  });
});
