// Stammdatenblatt-Renderer (Kunde/Lieferant). Setzt das reine Inhaltsmodell
// (@texma/shared StammblattDokument) in ein A4-PDF um. pdf-lib (pure-JS). IO-frei.
// Anders als der Beleg-Renderer: thematische Sektionen mit Label/Wert-Zeilen.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { StammblattDokument } from "@texma/shared";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;

export async function renderDataSheetPdf(blatt: StammblattDokument): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${blatt.titel} ${blatt.name}`);
  let page = doc.addPage([A4.width, A4.height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.05, 0.11, 0.21);
  const grey = rgb(0.4, 0.4, 0.4);

  let y = A4.height - MARGIN;
  const newPageIfNeeded = (): void => {
    if (y < MARGIN + 60) { page = doc.addPage([A4.width, A4.height]); y = A4.height - MARGIN; }
  };

  // Absender (klein)
  for (const line of blatt.absender) {
    page.drawText(line, { x: MARGIN, y, size: 8, font, color: grey });
    y -= 11;
  }

  // Titel + Name + Nummer/Datum
  y -= 18;
  page.drawText(blatt.titel, { x: MARGIN, y, size: 20, font: bold, color: navy });
  page.drawText(`Datum: ${blatt.datum}`, { x: A4.width - MARGIN - 180, y: y + 6, size: 10, font });
  if (blatt.nummer) page.drawText(`Nr. ${blatt.nummer}`, { x: A4.width - MARGIN - 180, y: y - 8, size: 11, font: bold });
  y -= 22;
  page.drawText(blatt.name, { x: MARGIN, y, size: 13, font: bold });
  y -= 24;

  // Sektionen: Überschrift + Label/Wert-Zeilen
  const xLabel = MARGIN;
  const xWert = MARGIN + 170;
  for (const sektion of blatt.sektionen) {
    newPageIfNeeded();
    page.drawText(sektion.titel, { x: MARGIN, y, size: 10, font: bold, color: navy });
    y -= 4;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.width - MARGIN, y }, thickness: 0.5, color: grey });
    y -= 15;
    for (const feld of sektion.felder) {
      newPageIfNeeded();
      page.drawText(`${feld.label}:`, { x: xLabel, y, size: 10, font, color: grey });
      page.drawText(feld.wert.slice(0, 70), { x: xWert, y, size: 10, font });
      y -= 15;
    }
    y -= 10;
  }

  // Hinweise (Fuß)
  y -= 10;
  for (const h of blatt.hinweise) {
    newPageIfNeeded();
    page.drawText(h, { x: MARGIN, y, size: 8, font, color: grey });
    y -= 11;
  }

  return doc.save();
}
