// Produktionszettel-PDF-Renderer (T-11). Setzt das reine Inhaltsmodell
// (@texma/shared ProductionSheet) in ein druckbereites PDF um. pdf-lib ist pure-JS
// (keine native Abhängigkeit, gut für SaaS/Bus-Faktor). IO-frei: Modell → Bytes.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ProductionSheet } from "@texma/shared";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;

/** Rendert den Produktionszettel als A4-PDF (Bytes). */
export async function renderProductionSheetPdf(sheet: ProductionSheet): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(sheet.title);
  const page = doc.addPage([A4.width, A4.height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.05, 0.11, 0.21);

  let y = A4.height - MARGIN;
  page.drawText(sheet.title, { x: MARGIN, y, size: 18, font: bold, color: navy });
  y -= 30;

  for (const section of sheet.sections) {
    page.drawText(section.label, { x: MARGIN, y, size: 12, font: bold, color: navy });
    y -= 18;
    for (const row of section.rows) {
      page.drawText(`${row.label}:`, { x: MARGIN + 10, y, size: 10, font: bold });
      page.drawText(row.value, { x: MARGIN + 160, y, size: 10, font });
      y -= 15;
    }
    y -= 10;
  }

  return doc.save();
}
