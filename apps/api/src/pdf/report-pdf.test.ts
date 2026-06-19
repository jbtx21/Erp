// Report-PDF-Renderer (Kap. 29): erzeugt gültige PDF-Bytes aus dem Berichtsmodell.

import { describe, expect, it } from "vitest";
import { renderReportPdf } from "./report-pdf.js";
import type { ReportDocument } from "../modules/reporting/report-document.js";

const doc: ReportDocument = {
  title: "TEXMA — Umsatz-Auswertung",
  subtitle: "Granularität: Monat · erstellt 19.06.2026",
  sections: [
    {
      heading: "Umsatz & Aufträge je Monat",
      table: {
        columns: ["Periode", "Umsatz (Netto)", "Rechnungen", "Aufträge", "Auftragswert"],
        rows: [["2026-06", "300,00 €", "2", "3", "500,00 €"]],
      },
    },
    { heading: "Umsatz nach Shop", table: { columns: ["Bezeichnung", "Umsatz"], rows: [] } },
  ],
};

describe("renderReportPdf", () => {
  it("erzeugt ein gültiges PDF (Magic Bytes %PDF-)", async () => {
    const bytes = await renderReportPdf(doc);
    expect(Buffer.from(bytes).subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(500);
  });
});
