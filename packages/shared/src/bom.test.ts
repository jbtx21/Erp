import { describe, expect, it } from "vitest";
import { expandBom, explodeComponents } from "./bom.js";

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

describe("Set/Bundle-Stückliste (explodeComponents, Kap. 5.1)", () => {
  const set = [
    { description: "Polo HAKRO weiß M", qty: 1, componentVariantId: "v-polo-m" },
    { description: "Stick Brust links", qty: 1 },
    { description: "Geschenkbox", qty: 1, componentVariantId: null },
  ];

  it("multipliziert Komponentenmengen mit der Positionsmenge", () => {
    const exp = explodeComponents(set, 20);
    expect(exp).toHaveLength(3);
    expect(exp[0]).toEqual({ description: "Polo HAKRO weiß M", qty: 20, componentVariantId: "v-polo-m" });
    expect(exp[1]).toEqual({ description: "Stick Brust links", qty: 20, componentVariantId: null });
  });

  it("überspringt leere/0-Mengen-Komponenten", () => {
    const exp = explodeComponents([{ description: "  ", qty: 5 }, { description: "X", qty: 0 }, { description: "Y", qty: 2 }], 3);
    expect(exp).toEqual([{ description: "Y", qty: 6, componentVariantId: null }]);
  });

  it("lehnt nicht-positive Positionsmengen ab", () => {
    expect(() => explodeComponents(set, 0)).toThrow();
  });
});
