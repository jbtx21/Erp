import { describe, expect, it } from "vitest";
import {
  EINRICHTUNG_SCHWELLE_STUECK,
  kalkuliereVeredelung,
  type EkStaffelStufe,
} from "./veredelung-engine.js";

// Stick-EK von der Stickerei je Stück, gestaffelt (wir haben keine eigene Maschine).
const stickEk: EkStaffelStufe[] = [
  { minMenge: 1, ekCents: 500 },
  { minMenge: 25, ekCents: 420 },
  { minMenge: 100, ekCents: 380 },
];
// Siebdruck: feste, bekannte EKs mit Mengenstaffel.
const siebEk: EkStaffelStufe[] = [
  { minMenge: 1, ekCents: 300 },
  { minMenge: 50, ekCents: 180 },
];

describe("kalkuliereVeredelung — VK = EK-je-Stück(Menge) × Aufschlag", () => {
  it("STICK: wählt die Staffelstufe und rechnet VK = EK × factor (Menge ≥ Schwelle → keine Einrichtung)", () => {
    const r = kalkuliereVeredelung({ methode: "STICK", ekStaffel: stickEk, menge: 30, factor: 1.88 });
    expect(r.ekStueckCents).toBe(420); // 30 ⇒ Stufe minMenge 25
    expect(r.vkStueckCents).toBe(790); // round(420 × 1,88 = 789,6) → 790
    expect(r.einrichtungBerechnet).toBe(false);
    expect(r.einrichtungEkCents).toBe(0);
    expect(r.ekGesamtCents).toBe(30 * 420);
    expect(r.vkGesamtCents).toBe(30 * 790);
    expect(r.dbGesamtCents).toBe(30 * 790 - 30 * 420);
  });

  it("SIEBDRUCK unter 10 Teilen: Einrichtung fällt an (einmalig, mit Aufschlag)", () => {
    const r = kalkuliereVeredelung({
      methode: "SIEBDRUCK",
      ekStaffel: siebEk,
      menge: 5,
      factor: 2.0,
      einrichtung: { ekCents: 3000 }, // Film/Sieb einmalig
    });
    expect(r.ekStueckCents).toBe(300);
    expect(r.vkStueckCents).toBe(600);
    expect(r.einrichtungBerechnet).toBe(true);
    expect(r.einrichtungEkCents).toBe(3000);
    expect(r.einrichtungVkCents).toBe(6000); // 3000 × 2,0
    expect(r.ekGesamtCents).toBe(5 * 300 + 3000);
    expect(r.vkGesamtCents).toBe(5 * 600 + 6000);
  });

  it("ab genau 10 Teilen keine Einrichtung (Schwelle ist exklusiv)", () => {
    const r = kalkuliereVeredelung({
      methode: "SIEBDRUCK",
      ekStaffel: siebEk,
      menge: EINRICHTUNG_SCHWELLE_STUECK, // 10
      factor: 2.0,
      einrichtung: { ekCents: 3000 },
    });
    expect(r.einrichtungBerechnet).toBe(false);
    expect(r.einrichtungEkCents).toBe(0);
    expect(r.einrichtungVkCents).toBe(0);
  });

  it("Einrichtung ohne Aufschlag wird zum EK durchgereicht (mitAufschlag=false)", () => {
    const r = kalkuliereVeredelung({
      methode: "TRANSFER",
      ekStaffel: siebEk,
      menge: 3,
      factor: 2.0,
      einrichtung: { ekCents: 3000, mitAufschlag: false },
    });
    expect(r.einrichtungEkCents).toBe(3000);
    expect(r.einrichtungVkCents).toBe(3000);
  });

  it("individuelle Schwelle übersteuert den Default", () => {
    const unter = kalkuliereVeredelung({
      methode: "DIGITALDRUCK", ekStaffel: siebEk, menge: 20, factor: 1.5,
      einrichtung: { ekCents: 1000, schwelleStueck: 25 },
    });
    expect(unter.einrichtungBerechnet).toBe(true); // 20 < 25
  });

  it("wirft bei fehlender Staffel für die Menge (Pflegefehler T-08)", () => {
    expect(() =>
      kalkuliereVeredelung({ methode: "STICK", ekStaffel: [{ minMenge: 10, ekCents: 400 }], menge: 5, factor: 1.88 })
    ).toThrow(/Pflegefehler/);
  });

  it("wirft bei factor ≤ 0 und bei negativer Menge", () => {
    expect(() => kalkuliereVeredelung({ methode: "STICK", ekStaffel: stickEk, menge: 10, factor: 0 })).toThrow();
    expect(() => kalkuliereVeredelung({ methode: "STICK", ekStaffel: stickEk, menge: -1, factor: 1.5 })).toThrow();
  });

  it("wirft bei negativem Stück-EK und negativer Einrichtung (Robustheit)", () => {
    expect(() =>
      kalkuliereVeredelung({ methode: "STICK", ekStaffel: [{ minMenge: 1, ekCents: -1 }], menge: 5, factor: 1.5 })
    ).toThrow(/negativ/);
    expect(() =>
      kalkuliereVeredelung({ methode: "SIEBDRUCK", ekStaffel: siebEk, menge: 3, factor: 1.5, einrichtung: { ekCents: -1 } })
    ).toThrow(/negativ/);
  });
});
