import { describe, expect, it } from "vitest";
import { expandBom } from "./bom.js";

describe("BOM-Expansion (T-03)", () => {
  const template = [
    { description: "Basistextil T-Shirt", defaultQty: 1 },
    { description: "Transferdruck Brust", defaultQty: 1 },
  ];

  it("multipliziert Template-Positionen mit der Auftragsmenge", () => {
    const bom = expandBom(template, [], 25);
    expect(bom).toEqual([
      { description: "Basistextil T-Shirt", qty: 25, source: "template" },
      { description: "Transferdruck Brust", qty: 25, source: "template" },
    ]);
  });

  it("hängt Auftragszeilen als eigene Positionen an", () => {
    const bom = expandBom(template, [{ description: "Sonderveredelung Rücken", qty: 5 }], 10);
    expect(bom).toHaveLength(3);
    expect(bom[2]).toEqual({
      description: "Sonderveredelung Rücken",
      qty: 5,
      source: "order",
    });
  });

  it("ohne Template entstehen nur die Auftragszeilen (manueller Auftrag)", () => {
    const bom = expandBom(null, [{ description: "Stick Logo", qty: 3 }], 3);
    expect(bom).toEqual([{ description: "Stick Logo", qty: 3, source: "order" }]);
  });

  it("lehnt nicht-positive Auftragsmengen ab", () => {
    expect(() => expandBom(template, [], 0)).toThrow();
  });
});
