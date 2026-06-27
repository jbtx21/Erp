// Veredelungsauftrag-PDF (Werkstattblatt an den Veredler / Inhouse-Veredelung).
// KEIN Brief: Kopf (Veredler/Auftrags-Nr./Kunde), Veredelungsart-Ankreuzfelder,
// Beistellung als Größen-MATRIX und Veredelungspositionen (Motiv/Größe/Farbton/
// Platzierung). Pure-JS-Rendering mit pdf-lib, A4. Modell baut @texma/shared.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { FirmenProfil, VeredelungsauftragDokument } from "@texma/shared";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const GREEN = rgb(0.42, 0.71, 0.20);
const DARK = rgb(0.12, 0.12, 0.12);
const GREY = rgb(0.45, 0.45, 0.45);
const HEAD = rgb(0.93, 0.93, 0.93);
const LIGHT = rgb(0.90, 0.96, 0.86);
const LINE = rgb(0.75, 0.75, 0.75);

function wordmark(page: PDFPage, x: number, y: number, bold: PDFFont, size: number): void {
  let cx = x;
  for (const [t, col] of [["TE", DARK], ["X", GREEN], ["MA", DARK]] as Array<[string, ReturnType<typeof rgb>]>) {
    page.drawText(t, { x: cx, y, size, font: bold, color: col });
    cx += bold.widthOfTextAtSize(t, size);
  }
}

function footerBand(page: PDFPage, font: PDFFont, bold: PDFFont, f: FirmenProfil): void {
  const top = 28, h = 52;
  page.drawRectangle({ x: MARGIN - 5, y: top, width: A4.width - 2 * (MARGIN - 5), height: h, color: LIGHT });
  wordmark(page, MARGIN + 6, top + 20, bold, 13);
  const cols: Array<[string[], number]> = [
    [[f.name, f.street, f.zipCity], 138],
    [[`Telefon: ${f.tel}`, `Mail: ${f.mail}`, `Internet: ${f.web}`], 250],
    [["Geschäftsführer:", f.gf, `Ust.-IdNr.: ${f.ustId}`], 360],
    [["Bankverbindung:", f.bankName, `IBAN: ${f.iban}`, `BIC: ${f.bic}`], 468],
  ];
  for (const [lines, x] of cols) {
    let yy = top + h - 12;
    for (const l of lines) { page.drawText(l, { x, y: yy, size: 5.6, font, color: GREY }); yy -= 8; }
  }
}

function datum(d: Date | null): string {
  return d ? d.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" }) : "______________";
}

function clip(s: string, font: PDFFont, size: number, max: number): string {
  if (font.widthOfTextAtSize(s, size) <= max) return s;
  let out = s;
  while (out.length > 1 && font.widthOfTextAtSize(out + "…", size) > max) out = out.slice(0, -1);
  return out + "…";
}

export async function renderVeredelungsauftragPdf(doc: VeredelungsauftragDokument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Veredelungsauftrag ${doc.nummer}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo: PDFImage | null = null;
  if (doc.logoB64) { try { logo = await pdf.embedJpg(Buffer.from(doc.logoB64, "base64")); } catch { logo = null; } }

  const f = doc.firma;
  let page!: PDFPage;
  let y = 0;
  const newPage = (): void => { page = pdf.addPage([A4.width, A4.height]); y = A4.height - 60; };
  const ensure = (need: number): void => { if (y - need < 96) { footerBand(page, font, bold, f); newPage(); } };

  newPage();
  // Logo / Wortmarke oben rechts
  if (logo) { const w = 120, h = (logo.height / logo.width) * w; page.drawImage(logo, { x: A4.width - MARGIN - w, y: y - h + 18, width: w, height: h }); }
  else wordmark(page, A4.width - MARGIN - 110, y - 6, bold, 28);

  // Titel
  page.drawText("Veredelungsauftrag", { x: MARGIN, y, size: 20, font: bold, color: DARK });
  page.drawText(doc.nummer, { x: MARGIN + bold.widthOfTextAtSize("Veredelungsauftrag ", 20), y: y + 1, size: 20, font, color: GREY });
  y -= 16;
  page.drawText(doc.inhouse ? "Inhouse-Veredelung (kein externer Lohnveredler)" : "Lohnveredelung — Arbeitsblatt an den Veredler", { x: MARGIN, y, size: 8, font, color: GREY });
  y -= 22;

  // Kopf-Block (Veredler / Kunde / Datum / Kommission)
  const kopf: Array<[string, string, string, string]> = [
    ["Veredler:", doc.veredler, "Datum:", datum(doc.datum)],
    ["Kunde:", doc.kunde, "Kommissions-Nr.:", doc.kommission ?? "—"],
    ["Anlieferung:", datum(doc.anlieferung), "Fertigstellung:", datum(doc.fertigstellung)],
  ];
  for (const [lL, lV, rL, rV] of kopf) {
    page.drawText(lL, { x: MARGIN, y, size: 9, font, color: GREY });
    page.drawText(lV, { x: MARGIN + 78, y, size: 9, font: bold });
    page.drawText(rL, { x: A4.width / 2 + 20, y, size: 9, font, color: GREY });
    page.drawText(rV, { x: A4.width / 2 + 120, y, size: 9, font: bold });
    y -= 15;
  }
  y -= 8;

  // Veredelungsart-Ankreuzfelder
  page.drawText("Veredelungsart:", { x: MARGIN, y, size: 9, font: bold });
  const arten: Array<[string, boolean]> = [
    ["Bestickt", doc.arten.bestickt], ["Bedruckt", doc.arten.bedruckt], ["Beflockt", doc.arten.beflockt],
    ["Transfer", doc.arten.transfer], ["Plott", doc.arten.plott],
  ];
  let ax = MARGIN + 86;
  for (const [label, on] of arten) {
    page.drawRectangle({ x: ax, y: y - 1, width: 9, height: 9, borderColor: DARK, borderWidth: 0.8, color: on ? GREEN : undefined });
    if (on) page.drawText("X", { x: ax + 1.4, y: y - 0.2, size: 8, font: bold, color: rgb(1, 1, 1) });
    page.drawText(label, { x: ax + 13, y, size: 8.5, font });
    ax += 13 + font.widthOfTextAtSize(label, 8.5) + 16;
  }
  y -= 24;

  // ── Beistellung: Größen-Matrix ──────────────────────────────────────────────
  page.drawText("Beistellung (Textilien)", { x: MARGIN, y, size: 10, font: bold, color: DARK });
  y -= 16;
  const sizeCols = doc.groessen;
  const tableW = A4.width - 2 * MARGIN;
  const artW = 50, bezW = 150, farbeW = 70, gesW = 36;
  const sizesW = Math.max(0, tableW - artW - bezW - farbeW - gesW);
  const sizeW = sizeCols.length > 0 ? sizesW / sizeCols.length : 0;
  const xArt = MARGIN, xBez = xArt + artW, xFarbe = xBez + bezW, xSizes = xFarbe + farbeW, xGes = xSizes + sizesW;

  const matrixHeader = (): void => {
    page.drawRectangle({ x: MARGIN - 3, y: y - 4, width: tableW + 6, height: 16, color: HEAD });
    page.drawText("Art-Nr.", { x: xArt, y, size: 8, font: bold });
    page.drawText("Bezeichnung", { x: xBez, y, size: 8, font: bold });
    page.drawText("Farbe", { x: xFarbe, y, size: 8, font: bold });
    sizeCols.forEach((s, i) => page.drawText(clip(s, bold, 7.5, sizeW - 2), { x: xSizes + i * sizeW + 2, y, size: 7.5, font: bold }));
    page.drawText("Ges.", { x: xGes + 4, y, size: 8, font: bold });
    y -= 16;
  };
  matrixHeader();
  if (doc.matrix.length === 0) {
    page.drawText("— keine Textil-Beistellung verknüpft —", { x: xArt, y, size: 8, font, color: GREY });
    y -= 14;
  }
  for (const row of doc.matrix) {
    ensure(16);
    if (y > A4.height - 70) { /* neue Seite hat keinen Tabellenkopf gezeichnet */ }
    page.drawText(clip(row.artNr, font, 8, artW - 2), { x: xArt, y, size: 8, font });
    page.drawText(clip(row.bezeichnung, font, 8, bezW - 4), { x: xBez, y, size: 8, font });
    page.drawText(clip(row.farbe, font, 8, farbeW - 4), { x: xFarbe, y, size: 8, font });
    sizeCols.forEach((s, i) => {
      const v = row.mengen[s];
      if (v) page.drawText(String(v), { x: xSizes + i * sizeW + 2, y, size: 8, font });
    });
    page.drawText(String(row.gesamt), { x: xGes + 4, y, size: 8, font: bold });
    y -= 5;
    page.drawLine({ start: { x: MARGIN - 3, y }, end: { x: MARGIN + tableW + 3, y }, thickness: 0.4, color: LINE });
    y -= 9;
  }
  // Gesamtzeile
  page.drawText(`Gesamt beigestellt: ${doc.beistellGesamt} Stück`, { x: xBez, y, size: 8.5, font: bold });
  y -= 22;

  // ── Veredelungspositionen ───────────────────────────────────────────────────
  ensure(40);
  page.drawText("Veredelungspositionen", { x: MARGIN, y, size: 10, font: bold, color: DARK });
  y -= 16;
  const pMotivW = 250, pPlatzW = 120, pGroesseW = 70;
  const pxMotiv = MARGIN, pxPlatz = pxMotiv + pMotivW, pxGroesse = pxPlatz + pPlatzW, pxFarbton = pxGroesse + pGroesseW;
  page.drawRectangle({ x: MARGIN - 3, y: y - 4, width: tableW + 6, height: 16, color: HEAD });
  page.drawText("Motiv / Leistung", { x: pxMotiv, y, size: 8, font: bold });
  page.drawText("Platzierung", { x: pxPlatz, y, size: 8, font: bold });
  page.drawText("Motivgröße", { x: pxGroesse, y, size: 8, font: bold });
  page.drawText("Farbton", { x: pxFarbton, y, size: 8, font: bold });
  y -= 16;
  if (doc.positionen.length === 0) {
    page.drawText("— keine Veredelungspositionen —", { x: pxMotiv, y, size: 8, font, color: GREY });
    y -= 14;
  }
  for (const p of doc.positionen) {
    ensure(18);
    const motiv = p.bezugPosition != null ? `${p.description}  (zu Pos. ${p.bezugPosition})` : p.description;
    page.drawText(clip(motiv, font, 8, pMotivW - 4), { x: pxMotiv, y, size: 8, font });
    page.drawText(clip(p.platzierung ?? "", font, 8, pPlatzW - 4), { x: pxPlatz, y, size: 8, font });
    page.drawText(clip(p.motivGroesse ?? "", font, 8, pGroesseW - 4), { x: pxGroesse, y, size: 8, font });
    page.drawText(clip(p.farbton ?? "", font, 8, tableW - (pxFarbton - MARGIN) - 4), { x: pxFarbton, y, size: 8, font });
    y -= 5;
    page.drawLine({ start: { x: MARGIN - 3, y }, end: { x: MARGIN + tableW + 3, y }, thickness: 0.4, color: LINE });
    y -= 9;
  }
  y -= 12;

  // Hinweise
  if (doc.hinweise.length > 0) {
    ensure(20 + doc.hinweise.length * 11);
    page.drawText("Hinweise:", { x: MARGIN, y, size: 8.5, font: bold }); y -= 12;
    for (const h of doc.hinweise) { page.drawText(clip(`• ${h}`, font, 8, tableW), { x: MARGIN, y, size: 8, font, color: GREY }); y -= 11; }
    y -= 6;
  }

  // Unterschriftszeile
  ensure(40);
  page.drawLine({ start: { x: MARGIN, y: y - 2 }, end: { x: MARGIN + 180, y: y - 2 }, thickness: 0.6, color: DARK });
  page.drawLine({ start: { x: A4.width - MARGIN - 180, y: y - 2 }, end: { x: A4.width - MARGIN, y: y - 2 }, thickness: 0.6, color: DARK });
  page.drawText("Bearbeiter / Datum", { x: MARGIN, y: y - 12, size: 7.5, font, color: GREY });
  page.drawText("Fertig geprüft / Datum", { x: A4.width - MARGIN - 180, y: y - 12, size: 7.5, font, color: GREY });

  footerBand(page, font, bold, f);
  return pdf.save();
}
