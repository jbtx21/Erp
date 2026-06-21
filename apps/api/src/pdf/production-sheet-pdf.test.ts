// Renderer-Test (T-11): erzeugt ein gültiges, wieder ladbares PDF aus dem Inhaltsmodell.

import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildProductionSheet, type ProductionSheetInput } from "@texma/shared";
import { renderProductionSheetPdf } from "./production-sheet-pdf.js";

const extern: ProductionSheetInput = {
  orderNumber: "AB-1",
  articleName: "Polo",
  farbe: "Blau",
  groesse: "XL",
  qty: 50,
  logoLabel: "ACME v3",
  dienstleister: "Siebdruck-Partner",
  positionierung: "Brust links",
  anlieferDatum: new Date(Date.UTC(2026, 5, 1)),
  fertigstellDatum: new Date(Date.UTC(2026, 5, 8)),
};

describe("renderProductionSheetPdf (T-11)", () => {
  it("erzeugt ein gültiges PDF (%PDF-Header, wieder ladbar)", async () => {
    const bytes = await renderProductionSheetPdf(buildProductionSheet(extern, "EXTERN"));
    expect(bytes.length).toBeGreaterThan(500);
    expect(Buffer.from(bytes.slice(0, 5)).toString("ascii")).toBe("%PDF-");

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toContain("extern");
  });
});
