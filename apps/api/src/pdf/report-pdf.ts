// Report-PDF-Renderer (Kap. 29). Setzt das reine Berichtsmodell (ReportDocument) in
// ein druckbereites A4-PDF mit einfachen Tabellen um. pdf-lib ist pure-JS (keine native
// Abhängigkeit). Mehrseitig: bei Seitenende wird automatisch umgebrochen.

import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import type { ReportDocument, ReportTable } from "../modules/reporting/report-document.js";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const BOTTOM = 60;

/** Spaltenbreiten (Anteile der nutzbaren Breite) je Spaltenanzahl. */
function columnXs(count: number): number[] {
  const usable = A4.width - 2 * MARGIN;
  // Erste Spalte breiter (Bezeichnungen), Rest gleich verteilt.
  const firstW = usable * 0.34;
  const restW = (usable - firstW) / Math.max(1, count - 1);
  const xs: number[] = [MARGIN];
  for (let i = 1; i < count; i++) xs.push(MARGIN + firstW + (i - 1) * restW);
  return xs;
}

/** Kürzt einen String, der über die Spaltenbreite hinausragt (grobe Heuristik). */
function clip(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

/** Rendert das Berichtsmodell als A4-PDF (Bytes). */
export async function renderReportPdf(report: ReportDocument): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(report.title);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.05, 0.11, 0.21);
  const grey = rgb(0.4, 0.4, 0.4);

  let page: PDFPage = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  const newPage = (): void => {
    page = doc.addPage([A4.width, A4.height]);
    y = A4.height - MARGIN;
  };
  const ensure = (needed: number): void => {
    if (y - needed < BOTTOM) newPage();
  };

  page.drawText(report.title, { x: MARGIN, y, size: 18, font: bold, color: navy });
  y -= 22;
  for (const line of wrap(report.subtitle, 95)) {
    page.drawText(line, { x: MARGIN, y, size: 9, font, color: grey });
    y -= 13;
  }
  y -= 10;

  for (const section of report.sections) {
    ensure(40);
    page.drawText(section.heading, { x: MARGIN, y, size: 13, font: bold, color: navy });
    y -= 18;
    drawTable(section.table);
    y -= 14;
  }

  function drawTable(table: ReportTable): void {
    const xs = columnXs(table.columns.length);
    const maxChars = 28;
    // Kopfzeile.
    ensure(18);
    table.columns.forEach((c, i) => {
      page.drawText(clip(c, maxChars), { x: xs[i]!, y, size: 9, font: bold, color: navy });
    });
    y -= 4;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.width - MARGIN, y }, thickness: 0.5, color: grey });
    y -= 12;
    // Datenzeilen.
    for (const row of table.rows) {
      ensure(14);
      row.forEach((cell, i) => {
        page.drawText(clip(cell, maxChars), { x: xs[i]!, y, size: 9, font });
      });
      y -= 14;
    }
    if (table.rows.length === 0) {
      ensure(14);
      page.drawText("Keine Daten.", { x: MARGIN, y, size: 9, font, color: grey });
      y -= 14;
    }
  }

  return doc.save();
}

/** Bricht einen langen Text grob auf Zeilen einer maximalen Zeichenanzahl um. */
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars) {
      if (line) lines.push(line.trim());
      line = w;
    } else {
      line = `${line} ${w}`;
    }
  }
  if (line) lines.push(line.trim());
  return lines;
}
