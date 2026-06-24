// Beleg-PDF-Renderer (Lieferschein/Rechnung). Setzt das reine Inhaltsmodell
// (@texma/shared BelegDokument) in ein A4-PDF um. pdf-lib (pure-JS, keine native
// Abhängigkeit). IO-frei: Modell → Bytes.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { BelegDokument } from "@texma/shared";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;

export async function renderBelegPdf(beleg: BelegDokument): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${beleg.titel} ${beleg.nummer}`);
  const page = doc.addPage([A4.width, A4.height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.05, 0.11, 0.21);
  const grey = rgb(0.4, 0.4, 0.4);

  let y = A4.height - MARGIN;

  // Absender (klein) + Empfängerblock
  for (const line of beleg.absender) {
    page.drawText(line, { x: MARGIN, y, size: 8, font, color: grey });
    y -= 11;
  }
  y -= 14;
  for (const line of beleg.empfaenger) {
    page.drawText(line, { x: MARGIN, y, size: 11, font });
    y -= 14;
  }

  // Titel + Nummer/Datum
  y -= 16;
  page.drawText(beleg.titel, { x: MARGIN, y, size: 20, font: bold, color: navy });
  page.drawText(`Nr. ${beleg.nummer}`, { x: A4.width - MARGIN - 180, y: y + 6, size: 11, font: bold });
  page.drawText(`Datum: ${beleg.datum}`, { x: A4.width - MARGIN - 180, y: y - 8, size: 10, font });
  y -= 32;

  // Tabellenkopf
  const xMenge = MARGIN;
  const xBez = MARGIN + 50;
  const xEinzel = A4.width - MARGIN - 230;
  const xRabatt = A4.width - MARGIN - 140;
  const xGesamt = A4.width - MARGIN - 70;
  // Rabatt-Spalte nur einblenden, wenn mindestens eine Position einen Positionsrabatt trägt.
  const zeigeRabatt = beleg.zeigePreise && beleg.positionen.some((p) => p.rabatt);
  page.drawText("Menge", { x: xMenge, y, size: 9, font: bold, color: navy });
  page.drawText("Bezeichnung", { x: xBez, y, size: 9, font: bold, color: navy });
  if (beleg.zeigePreise) {
    page.drawText("Einzel", { x: xEinzel, y, size: 9, font: bold, color: navy });
    if (zeigeRabatt) page.drawText("Rabatt", { x: xRabatt, y, size: 9, font: bold, color: navy });
    page.drawText("Gesamt", { x: xGesamt, y, size: 9, font: bold, color: navy });
  }
  y -= 4;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.width - MARGIN, y }, thickness: 0.5, color: grey });
  y -= 14;

  for (const p of beleg.positionen) {
    page.drawText(String(p.menge), { x: xMenge, y, size: 10, font });
    page.drawText(p.bezeichnung.slice(0, 60), { x: xBez, y, size: 10, font });
    if (beleg.zeigePreise) {
      if (p.einzelpreis) page.drawText(p.einzelpreis, { x: xEinzel, y, size: 10, font });
      if (zeigeRabatt && p.rabatt) page.drawText(p.rabatt, { x: xRabatt, y, size: 10, font });
      if (p.gesamt) page.drawText(p.gesamt, { x: xGesamt, y, size: 10, font });
    }
    y -= 15;
    if (y < MARGIN + 120) { y = A4.height - MARGIN; doc.addPage([A4.width, A4.height]); }
  }

  // Summen (rechtsbündig)
  if (beleg.summen.length > 0) {
    y -= 6;
    page.drawLine({ start: { x: xEinzel, y }, end: { x: A4.width - MARGIN, y }, thickness: 0.5, color: grey });
    y -= 14;
    for (const s of beleg.summen) {
      const isBrutto = s.label === "Brutto";
      page.drawText(`${s.label}:`, { x: xEinzel, y, size: isBrutto ? 11 : 10, font: isBrutto ? bold : font });
      page.drawText(s.value, { x: xGesamt, y, size: isBrutto ? 11 : 10, font: isBrutto ? bold : font });
      y -= 15;
    }
  }

  // Hinweise (Fuß)
  y -= 20;
  for (const h of beleg.hinweise) {
    page.drawText(h, { x: MARGIN, y, size: 8, font, color: grey });
    y -= 11;
  }

  return doc.save();
}
