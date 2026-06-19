// Produktionszettel (T-11): Basisfelder + vorlagenspezifische Eingaben → PDF;
// fehlende Pflichtfelder → Fehler. In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { ProductionSheetIncompleteError } from "@texma/shared";
import { InMemoryProductionSheetRepository } from "../../repositories/in-memory-production-sheet.repository.js";
import { ProductionSheetService } from "./production-sheet.service.js";

function setup() {
  const repo = new InMemoryProductionSheetRepository({
    pa: { orderNumber: "AB-1", articleName: "Polo", farbe: "Blau", groesse: "XL", qty: 50, logoLabel: "Logo v3" },
  });
  return new ProductionSheetService(repo);
}

describe("ProductionSheetService.render (T-11)", () => {
  it("rendert den internen Zettel mit Maschinenparametern als PDF", async () => {
    const res = await setup().render({
      productionId: "pa",
      kind: "INTERN",
      extra: { maschine: "DTF-1", temperaturC: 160, presszeitSek: 15 },
    });
    expect(res.fileName).toBe("Produktionszettel-AB-1-INTERN.pdf");
    expect(res.title).toContain("intern");
    expect(Buffer.from(res.pdfBase64, "base64").subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("wirft ProductionSheetIncompleteError bei fehlenden EXTERN-Feldern", async () => {
    await expect(setup().render({ productionId: "pa", kind: "EXTERN", extra: {} })).rejects.toBeInstanceOf(
      ProductionSheetIncompleteError
    );
  });

  it("behandelt einen unbekannten Produktionsauftrag als unvollständig", async () => {
    await expect(setup().render({ productionId: "x", kind: "INTERN", extra: {} })).rejects.toBeInstanceOf(
      ProductionSheetIncompleteError
    );
  });
});
