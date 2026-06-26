import { describe, expect, it } from "vitest";
import { parseMatrixCatalog, planMatrixImport } from "./matrix-import.js";

const HEADER = "Artikelnummer;Bezeichnung;Farbe;Größe;Lieferantennummer;EK netto";

describe("parseMatrixCatalog", () => {
  it("parst eine Matrix-CSV header-basiert und meldet fehlende Pflichtwerte", () => {
    const csv = [HEADER, "POLO-01;Premium Polo;Navy;M;SS-100;9,90", "POLO-01;;;L;;"].join("\r\n");
    const { rows, errors } = parseMatrixCatalog(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sku: "POLO-01", name: "Premium Polo", farbe: "Navy", groesse: "M", supplierSku: "SS-100", ek: "9,90" });
    // Zeile 2 hat keine Farbe → Zeilenfehler, kein Datensatz
    expect(errors.some((e) => e.row === 2 && /Farbe/.test(e.message))).toBe(true);
  });
});

describe("planMatrixImport", () => {
  it("klassifiziert Artikel/Varianten und berechnet SKU + EK", () => {
    const csv = [HEADER,
      "POLO-01;Premium Polo;Navy;M;SS-100;9,90",
      "POLO-01;Premium Polo;Navy;L;SS-101;9,90",
      "POLO-01;Premium Polo;Weiß;M;SS-102;9,50",
    ].join("\n");
    const plan = planMatrixImport(csv, { articleSkus: [], variantCombos: [] });
    expect(plan.newArticles).toBe(1); // POLO-01 nur einmal als neu gezählt
    expect(plan.newVariants).toBe(3);
    expect(plan.existingVariants).toBe(0);
    expect(plan.withEk).toBe(3);
    expect(plan.rows[0]).toMatchObject({ articleStatus: "neu", variantStatus: "neu", variantSku: "POLO-01-NAVY-M", ekCents: 990 });
    expect(plan.rows[2]!.variantSku).toBe("POLO-01-WEISS-M"); // Umlaut aufgelöst
    expect(plan.rows[1]!.articleStatus).toBe("vorhanden"); // zweite Zeile desselben Artikels
  });

  it("erkennt vorhandene Artikel/Varianten aus dem Bestand und CSV-Duplikate", () => {
    const csv = [HEADER,
      "POLO-01;Polo;Navy;M;;",   // Variante existiert bereits in DB
      "POLO-01;Polo;Navy;L;;",   // neu
      "POLO-01;Polo;Navy;L;;",   // Duplikat innerhalb der CSV
    ].join("\n");
    const plan = planMatrixImport(csv, {
      articleSkus: ["polo-01"],
      variantCombos: ["POLO-01|Navy|M"],
    });
    expect(plan.newArticles).toBe(0);
    expect(plan.rows[0]).toMatchObject({ articleStatus: "vorhanden", variantStatus: "vorhanden" });
    expect(plan.rows[1]!.variantStatus).toBe("neu");
    expect(plan.rows[2]!.variantStatus).toBe("duplikat");
    expect(plan.newVariants).toBe(1);
    expect(plan.existingVariants).toBe(1);
  });

  it("meldet ungültige/negative EK-Werte als Zeilenfehler, lässt die Zeile aber gültig", () => {
    const csv = [HEADER,
      "POLO-01;Polo;Navy;M;;abc",
      "POLO-01;Polo;Navy;L;;-5,00",
    ].join("\n");
    const plan = planMatrixImport(csv, { articleSkus: [], variantCombos: [] });
    expect(plan.errors.some((e) => e.row === 1 && /EK/.test(e.message))).toBe(true);
    expect(plan.errors.some((e) => e.row === 2 && /negativ/.test(e.message))).toBe(true);
    expect(plan.rows[0]!.ekCents).toBeNull();
    expect(plan.rows[1]!.ekCents).toBeNull();
    expect(plan.newVariants).toBe(2); // Varianten bleiben anlegbar
  });
});
