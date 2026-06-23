import { describe, expect, it } from "vitest";
import { parseEanList, planEanImport, type VariantIndexEntry } from "./ean-import.js";

const index: VariantIndexEntry[] = [
  { variantId: "v1", articleId: "a1", sku: "POLO-001-rot-L", gtin: "4006381333931", articleName: "Poloshirt" },
  { variantId: "v2", articleId: "a2", sku: "CAP-007", gtin: null, articleName: "Cap" },
];

const csv = [
  "EAN;Artikelnummer;Bezeichnung;Marke;EK (EUR);Gewicht (g)",
  "4006381333931;POLO-001-rot-L;Poloshirt rot L;TEXMA;4,50;180", // Treffer per EAN
  "4006381333930;CAP-007;Cap schwarz;TEXMA;2,10;90",            // EAN-Prüfziffer falsch → Treffer per SKU
  "0012345678905;NEU-999;Neuer Hoodie;TEXMA;9,90;420",          // gültige EAN, kein Bestand → Nicht-Treffer
].join("\n");

describe("EAN-Listen-Import — Parsing", () => {
  it("parst Felder, normalisiert EAN, parst EK in Cent und Gewicht", () => {
    const { rows, errors } = parseEanList(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.gtin).toBe("4006381333931");
    expect(rows[0]?.gtinValid).toBe(true);
    expect(rows[0]?.fields.ekCents).toBe(450);
    expect(rows[0]?.fields.weightGrams).toBe(180);
    expect(rows[1]?.gtinValid).toBe(false);
  });

  it("meldet fehlende Pflichtspalte EAN", () => {
    const { errors } = parseEanList("Artikelnummer;Bezeichnung\nA-1;X");
    expect(errors[0]?.message).toContain("EAN");
  });
});

describe("EAN-Listen-Import — automatischer Abgleich", () => {
  it("matcht primär per EAN, ersatzweise per SKU, sonst Nicht-Treffer", () => {
    const { rows } = parseEanList(csv);
    const plan = planEanImport(rows, index);
    expect(plan.rows[0]?.match).toBe("EAN");
    expect(plan.rows[0]?.variantId).toBe("v1");
    expect(plan.rows[1]?.match).toBe("SKU"); // EAN ungültig → über SKU gefunden
    expect(plan.rows[1]?.variantId).toBe("v2");
    expect(plan.rows[2]?.match).toBe("NONE");
    expect(plan.rows[2]?.variantId).toBeNull();
  });

  it("zählt Treffer/Nicht-Treffer/ungültige EAN", () => {
    const plan = planEanImport(parseEanList(csv).rows, index);
    expect(plan.counts).toEqual({ total: 3, matchedEan: 1, matchedSku: 1, unmatched: 1, invalidGtin: 1 });
  });
});
