import { describe, expect, it } from "vitest";
import {
  IMPORT_TARGETS, importTargetById, autoMapColumns, applyMapping, normalizeHeader,
} from "./import-mapping.js";

describe("normalizeHeader", () => {
  it("löst Umlaute auf und entfernt Sonderzeichen", () => {
    expect(normalizeHeader("Größe")).toBe("groesse");
    expect(normalizeHeader("EK netto (€)")).toBe("eknetto");
    expect(normalizeHeader("Artikel-Nr.")).toBe("artikelnr");
  });
});

describe("autoMapColumns", () => {
  it("erkennt Zielfelder über Label und Synonyme, jede Spalte nur einmal", () => {
    const target = importTargetById("MATRIX");
    const headers = ["Art-Nr", "Produktname", "Color", "Size", "Lieferanten-Nr", "EK-Preis"];
    const m = autoMapColumns(headers, target.fields);
    expect(m.sku).toEqual({ kind: "column", index: 0 });      // Art-Nr → Artikelnummer
    expect(m.name).toEqual({ kind: "column", index: 1 });     // Produktname → Bezeichnung
    expect(m.farbe).toEqual({ kind: "column", index: 2 });    // Color → Farbe
    expect(m.groesse).toEqual({ kind: "column", index: 3 });  // Size → Größe
    expect(m.supplierSku).toEqual({ kind: "column", index: 4 });
    expect(m.ek).toEqual({ kind: "column", index: 5 });
  });

  it("lässt unerkannte Felder als none", () => {
    const target = importTargetById("ARTICLE");
    const m = autoMapColumns(["Irgendwas", "Noch was"], target.fields);
    expect(m.sku).toEqual({ kind: "none" });
    expect(m.name).toEqual({ kind: "none" });
  });
});

describe("applyMapping", () => {
  const target = importTargetById("MATRIX");

  it("baut die kanonische CSV mit den Zielfeld-Labels als Kopfzeile", () => {
    const headers = ["Art-Nr", "Produktname", "Color", "Size", "Lieferanten-Nr", "EK-Preis"];
    const rows = [
      ["POLO-01", "Premium Polo", "Navy", "M", "SS-100", "9,90"],
      ["POLO-01", "Premium Polo", "Navy", "L", "SS-101", "9,90"],
    ];
    const m = autoMapColumns(headers, target.fields);
    const res = applyMapping(target, rows, m);
    expect(res.missingRequired).toEqual([]);
    expect(res.records).toHaveLength(2);
    expect(res.records[0]).toMatchObject({ sku: "POLO-01", farbe: "Navy", groesse: "M", ek: "9,90" });
    const firstLine = res.csv.split("\r\n")[0];
    expect(firstLine).toContain("Artikelnummer");
    expect(firstLine).toContain("Farbe");
    expect(firstLine).toContain("Größe");
  });

  it("meldet fehlende Pflichtfelder und unterstützt feste Werte", () => {
    const headers = ["Nr", "Farbe", "Größe"];
    const rows = [["A-1", "Rot", "M"]];
    const mapping = autoMapColumns(headers, target.fields);
    // 'name' (Bezeichnung) ist im Matrix-Ziel nicht Pflicht; 'sku'/'farbe'/'groesse' schon.
    expect(mapping.sku).toEqual({ kind: "column", index: 0 });
    // Fester Wert für die Bezeichnung setzen.
    mapping.name = { kind: "fixed", value: "Sammel-Polo" };
    const res = applyMapping(target, rows, mapping);
    expect(res.missingRequired).toEqual([]);
    expect(res.records[0]!.name).toBe("Sammel-Polo");
  });

  it("verwirft komplett leere Zeilen", () => {
    const headers = ["Nr", "Farbe", "Größe"];
    const rows = [["A-1", "Rot", "M"], ["", "", ""]];
    const m = autoMapColumns(headers, target.fields);
    const res = applyMapping(target, rows, m);
    expect(res.records).toHaveLength(1);
  });

  it("registriert für jede Entität ein Ziel mit Pflichtfeldern", () => {
    expect(IMPORT_TARGETS.map((t) => t.id).sort()).toEqual(["ARTICLE", "COMPANY", "MATRIX", "SUPPLIER"]);
    for (const t of IMPORT_TARGETS) expect(t.fields.some((f) => f.required)).toBe(true);
  });
});
