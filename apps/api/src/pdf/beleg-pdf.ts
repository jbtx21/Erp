// Beleg-PDF-Renderer (Lieferschein/Rechnung/Angebot/AB). Modell → A4-PDF (pdf-lib, pure-JS).
// Zwei Pfade: das TEXMA-Briefformat (wenn `firma` gesetzt: Briefkopf/Logo, Ansprechpartner,
// Kommissions-/Kunden-Nr., Art-Nr.-Spalte, mehrzeilige Positionen, Fußzeile mit Bankdaten) und
// das schlanke Tabellen-Layout als Fallback (Rückwärtskompatibilität, z. B. Stammblätter/Tests).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { BelegDokument, FirmenProfil } from "@texma/shared";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const GREEN = rgb(0.42, 0.71, 0.20);
const DARK = rgb(0.12, 0.12, 0.12);
const GREY = rgb(0.45, 0.45, 0.45);
const HEAD = rgb(0.93, 0.93, 0.93);
const LIGHT = rgb(0.90, 0.96, 0.86);

export async function renderBelegPdf(beleg: BelegDokument): Promise<Uint8Array> {
  return beleg.firma ? renderTexmaLetter(beleg, beleg.firma) : renderSimple(beleg);
}

// ── TEXMA-Briefformat ──────────────────────────────────────────────────────────
async function renderTexmaLetter(beleg: BelegDokument, firma: FirmenProfil): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${beleg.titel} ${beleg.nummer}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo: PDFImage | null = null;
  if (beleg.logoB64) { try { logo = await doc.embedJpg(Buffer.from(beleg.logoB64, "base64")); } catch { logo = null; } }

  const cols = { art: MARGIN, menge: MARGIN + 92, bez: MARGIN + 134, preis: A4.width - MARGIN - 150, summe: A4.width - MARGIN - 62 };
  let page!: PDFPage;
  let y = 0;
  const newPage = (): void => { page = doc.addPage([A4.width, A4.height]); y = A4.height - 60; };
  const tableHeader = (): void => {
    page.drawRectangle({ x: MARGIN - 5, y: y - 4, width: A4.width - 2 * (MARGIN - 5), height: 18, color: HEAD });
    page.drawText("Art-Nr.", { x: cols.art, y, size: 9, font: bold });
    page.drawText("Menge", { x: cols.menge, y, size: 9, font: bold });
    page.drawText("Artikelbezeichnung", { x: cols.bez, y, size: 9, font: bold });
    if (beleg.zeigePreise) { page.drawText("Preis EUR", { x: cols.preis, y, size: 9, font: bold }); page.drawText("Summe", { x: cols.summe, y, size: 9, font: bold }); }
    y -= 22;
  };
  const ensure = (need: number): void => { if (y - need < 96) { footerBand(page, font, bold, firma); newPage(); tableHeader(); } };

  newPage();
  // Logo bzw. Wortmarke oben rechts
  if (logo) { const w = 130, h = (logo.height / logo.width) * w; page.drawImage(logo, { x: A4.width - MARGIN - w, y: y - h + 18, width: w, height: h }); }
  else wordmark(page, A4.width - MARGIN - 120, y - 8, bold, 30);
  y -= 44;
  // Absenderzeile + Empfänger + Ansprechpartner
  page.drawText(`${firma.name}   ${firma.street}   ${firma.zipCity}`, { x: MARGIN, y, size: 7, font, color: GREY });
  y -= 16;
  let ry = y;
  for (const l of beleg.empfaenger) { page.drawText(l, { x: MARGIN, y: ry, size: 11, font }); ry -= 14; }
  if (beleg.ansprechpartner) {
    const ax = A4.width - MARGIN - 200;
    const rows: Array<[string, string]> = [["Ihr Ansprechpartner:", beleg.ansprechpartner.name], ["Tel.:", beleg.ansprechpartner.tel], ["E-Mail:", beleg.ansprechpartner.mail]];
    rows.forEach(([l, v], i) => { page.drawText(l, { x: ax, y: y - i * 11, size: 8, font, color: GREY }); page.drawText(v, { x: ax + 95, y: y - i * 11, size: 8, font }); });
  }
  y = ry - 38;
  // Titel + Nummer
  page.drawText(beleg.titel, { x: MARGIN, y, size: 22, font: bold, color: DARK });
  page.drawText(beleg.nummer, { x: MARGIN + bold.widthOfTextAtSize(beleg.titel + " ", 22), y: y + 1, size: 22, font, color: GREY });
  y -= 30;
  // Meta-Block
  const meta: Array<[string, string, string, string]> = [
    ...(beleg.kommissionsNr ? [["Kommissions-Nr.:", beleg.kommissionsNr, "Datum:", beleg.datum] as [string, string, string, string]] : [["", "", "Datum:", beleg.datum] as [string, string, string, string]]),
    ...(beleg.kundenNr ? [["Kunden-Nr.:", beleg.kundenNr, "", ""] as [string, string, string, string]] : []),
    ...(beleg.metaExtra ?? []).map((m) => [m.label, m.value, m.rLabel ?? "", m.rValue ?? ""] as [string, string, string, string]),
  ];
  for (const [lL, lV, rL, rV] of meta) {
    if (lL) { page.drawText(lL, { x: MARGIN, y, size: 8.5, font, color: GREY }); page.drawText(lV, { x: MARGIN + 100, y, size: 8.5, font }); }
    if (rL) { page.drawText(rL, { x: 330, y, size: 8.5, font, color: GREY }); page.drawText(rV, { x: 410, y, size: 8.5, font }); }
    y -= 13;
  }
  y -= 8;
  // Anrede + Einleitung
  if (beleg.anrede) { page.drawText(beleg.anrede, { x: MARGIN, y, size: 10, font }); y -= 18; }
  if (beleg.einleitung) { for (const l of wrap(beleg.einleitung, font, 10, A4.width - 2 * MARGIN)) { page.drawText(l, { x: MARGIN, y, size: 10, font }); y -= 13; } }
  y -= 10;
  tableHeader();
  // Positionen
  for (const p of beleg.positionen) {
    // Interne Position im Beleg-PDF ausblenden (Xentral „im PDF ausblenden").
    if (p.imPdfAusblenden) continue;
    // Strukturzeile (Xentral-Spezialfeld): Gruppenüberschrift bzw. Zwischen-/Gruppensumme.
    if (p.strukturTyp) {
      if (p.strukturTyp === "GRUPPE") {
        ensure(22);
        y -= 4;
        page.drawText(p.bezeichnung.slice(0, 60), { x: cols.art, y, size: 10.5, font: bold, color: DARK });
        y -= 16;
      } else {
        ensure(18);
        page.drawLine({ start: { x: cols.preis - 10, y: y + 9 }, end: { x: A4.width - MARGIN, y: y + 9 }, thickness: 0.3, color: GREY });
        page.drawText(p.bezeichnung, { x: cols.preis, y, size: 9, font: bold, color: DARK });
        if (beleg.zeigePreise && p.strukturBetrag) page.drawText(p.strukturBetrag, { x: cols.summe, y, size: 9, font: bold });
        y -= 16;
      }
      continue;
    }
    // Platzierung (Brust/Rücken) als erste Zusatzzeile unter der Bezeichnung.
    const detailSrc = [...(p.platzierung ? [`Platzierung: ${p.platzierung}`] : []), ...(p.detail ?? [])];
    const detail = detailSrc.flatMap((d) => wrap(d, font, 9, cols.preis - cols.bez - 8));
    // Kundenseitige Mengenstaffel (nur VK) als eigener Zusatzblock unter der Position.
    const staffel = p.staffel ?? [];
    ensure(14 + detail.length * 11 + (staffel.length > 0 ? (staffel.length + 1) * 11 : 0) + (p.alternativ ? 12 : 0) + 8);
    if (p.alternativ) { page.drawText("Alternativ :", { x: cols.art, y, size: 8.5, font: bold, color: GREY }); y -= 12; }
    // Spaltenbreiten respektieren, damit Art-Nr./Bezeichnung nicht in die Nachbarspalte laufen.
    if (p.artNr) page.drawText(fit(p.artNr, font, 9, cols.menge - cols.art - 6), { x: cols.art, y, size: 9, font });
    page.drawText(String(p.menge), { x: cols.menge, y, size: 9, font });
    page.drawText(fit(p.bezeichnung, bold, 9.5, cols.preis - cols.bez - 8), { x: cols.bez, y, size: 9.5, font: bold });
    // Alternativtext („nach Aufwand") überdruckt den Euro-Betrag; sonst Einzelpreis + Summe.
    if (beleg.zeigePreise && p.altPreisText) {
      page.drawText(fit(p.altPreisText, font, 9, cols.summe - cols.preis - 4), { x: cols.preis, y, size: 9, font, color: GREY });
    } else {
      if (beleg.zeigePreise && p.einzelpreis) page.drawText(p.einzelpreis, { x: cols.preis, y, size: 9, font });
      if (beleg.zeigePreise && p.gesamt) page.drawText(p.gesamt, { x: cols.summe, y, size: 9, font });
    }
    y -= 12;
    for (const d of detail) { page.drawText(d, { x: cols.bez, y, size: 9, font, color: rgb(0.25, 0.25, 0.25) }); y -= 11; }
    // Mengenstaffel: „ab N Stück: P €/Stück" je Stufe (Kunde sieht nur den VK).
    if (beleg.zeigePreise && staffel.length > 0) {
      page.drawText("Mengenstaffel (Preis je Stück):", { x: cols.bez, y, size: 8.5, font: bold, color: GREY });
      y -= 11;
      for (const st of staffel) {
        page.drawText(`ab ${st.abMenge} Stück`, { x: cols.bez + 6, y, size: 8.5, font, color: rgb(0.3, 0.3, 0.3) });
        page.drawText(st.preis, { x: cols.preis, y, size: 8.5, font, color: rgb(0.3, 0.3, 0.3) });
        y -= 11;
      }
    }
    y -= 8;
  }
  // Summenblock
  if (beleg.summen.length > 0) {
    ensure(60);
    page.drawLine({ start: { x: cols.preis - 10, y: y + 4 }, end: { x: A4.width - MARGIN, y: y + 4 }, thickness: 0.5, color: GREY });
    for (const s of beleg.summen) {
      const end = s.label === "Brutto";
      page.drawText(end ? "Endbetrag  EUR" : s.label === "Netto" ? "Nettowert" : s.label, { x: cols.preis, y, size: end ? 10 : 9, font: end ? bold : font });
      page.drawText(s.value, { x: cols.summe, y, size: end ? 10 : 9, font: end ? bold : font });
      y -= end ? 16 : 14;
    }
  }
  // Hinweise (Schlussformel)
  y -= 8; ensure(70);
  for (const h of beleg.hinweise) { page.drawText(h, { x: MARGIN, y, size: 9, font }); y -= 12; }
  footerBand(page, font, bold, firma);
  return doc.save();
}

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

// Text auf eine Spaltenbreite kürzen (mit „…"), damit er nicht in die Nachbarspalte läuft.
function fit(txt: string, font: PDFFont, size: number, max: number): string {
  const s = String(txt);
  if (font.widthOfTextAtSize(s, size) <= max) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(s.slice(0, mid) + "…", size) <= max) lo = mid; else hi = mid - 1;
  }
  return s.slice(0, lo).trimEnd() + "…";
}

function wrap(txt: string, font: PDFFont, size: number, max: number): string[] {
  const out: string[] = [];
  for (const para of String(txt).split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const t = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(t, size) > max && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}

// ── Schlankes Tabellen-Layout (Fallback, unverändert) ──────────────────────────
async function renderSimple(beleg: BelegDokument): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${beleg.titel} ${beleg.nummer}`);
  const page = doc.addPage([A4.width, A4.height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.05, 0.11, 0.21);
  const grey = rgb(0.4, 0.4, 0.4);

  let y = A4.height - MARGIN;
  for (const line of beleg.absender) { page.drawText(line, { x: MARGIN, y, size: 8, font, color: grey }); y -= 11; }
  y -= 14;
  for (const line of beleg.empfaenger) { page.drawText(line, { x: MARGIN, y, size: 11, font }); y -= 14; }

  y -= 16;
  page.drawText(beleg.titel, { x: MARGIN, y, size: 20, font: bold, color: navy });
  page.drawText(`Nr. ${beleg.nummer}`, { x: A4.width - MARGIN - 180, y: y + 6, size: 11, font: bold });
  page.drawText(`Datum: ${beleg.datum}`, { x: A4.width - MARGIN - 180, y: y - 8, size: 10, font });
  y -= 32;

  const xMenge = MARGIN, xBez = MARGIN + 50, xEinzel = A4.width - MARGIN - 230, xRabatt = A4.width - MARGIN - 140, xGesamt = A4.width - MARGIN - 70;
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

  y -= 20;
  for (const h of beleg.hinweise) { page.drawText(h, { x: MARGIN, y, size: 8, font, color: grey }); y -= 11; }
  return doc.save();
}
