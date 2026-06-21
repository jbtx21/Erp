import { describe, expect, it } from "vitest";
import {
  buildProductionSheet,
  ProductionSheetIncompleteError,
  validateProductionSheet,
  type ProductionSheetInput,
} from "./production-sheet.js";

const base: ProductionSheetInput = {
  orderNumber: "AB-1",
  articleName: "Polo",
  farbe: "Blau",
  groesse: "XL",
  qty: 50,
  logoLabel: "ACME v3",
};

const extern: ProductionSheetInput = {
  ...base,
  dienstleister: "Siebdruck-Partner",
  positionierung: "Brust links",
  anlieferDatum: new Date(Date.UTC(2026, 5, 1)),
  fertigstellDatum: new Date(Date.UTC(2026, 5, 8)),
};

const intern: ProductionSheetInput = { ...base, maschine: "DTF-1", temperaturC: 160, presszeitSek: 15 };

describe("validateProductionSheet (T-11)", () => {
  it("meldet fehlende EXTERN-Pflichtfelder", () => {
    expect(validateProductionSheet(base, "EXTERN")).toEqual([
      "Dienstleister",
      "Positionierung",
      "Anliefertermin",
      "Fertigstellungstermin",
    ]);
  });

  it("ist vollständig, wenn alle Felder gesetzt sind", () => {
    expect(validateProductionSheet(extern, "EXTERN")).toEqual([]);
    expect(validateProductionSheet(intern, "INTERN")).toEqual([]);
  });

  it("meldet Menge ≤ 0 und leere Felder", () => {
    expect(validateProductionSheet({ ...extern, qty: 0, farbe: "  " }, "EXTERN")).toEqual(
      expect.arrayContaining(["Farbe", "Menge"])
    );
  });
});

describe("buildProductionSheet (T-11)", () => {
  it("baut den externen Zettel mit allen Pflicht-Abschnitten", () => {
    const sheet = buildProductionSheet(extern, "EXTERN");
    expect(sheet.title).toContain("extern");
    const dl = sheet.sections.find((s) => s.label === "Dienstleister");
    expect(dl?.rows.map((r) => r.label)).toEqual([
      "Dienstleister",
      "Positionierung",
      "Anliefertermin",
      "Fertigstellungstermin",
    ]);
    expect(dl?.rows.find((r) => r.label === "Anliefertermin")?.value).toBe("2026-06-01");
  });

  it("baut den internen Zettel mit Maschinenparametern", () => {
    const sheet = buildProductionSheet(intern, "INTERN");
    const mp = sheet.sections.find((s) => s.label === "Maschinenparameter");
    expect(mp?.rows.find((r) => r.label === "Temperatur")?.value).toBe("160 °C");
  });

  it("wirft bei fehlenden Pflichtfeldern", () => {
    expect(() => buildProductionSheet(base, "EXTERN")).toThrow(ProductionSheetIncompleteError);
  });
});
