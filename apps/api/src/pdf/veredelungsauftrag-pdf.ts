// Veredelungsauftrag-PDF (Werkstattblatt an den Veredler / Inhouse-Veredelung).
// KEIN Brief: Kopf (Logo + zentrierter Titel + Datum), Meta (Veredler/Auftrags-Nr./
// Kunde) mit Veredelungsart-Ankreuzfeldern, Beistellung als Größen-MATRIX und
// Veredelungspositionen als Karten mit Kleidungs-Skizze + grünem Positionsmarker.
// Layout 1:1 übernommen aus dem TEXMA-Veredlungsauftrag-Generator (Renderer-Vorlage,
// TEXMA Navy #0E1C36 + Grün). Pure-JS-Rendering mit pdf-lib, A4. Modell baut @texma/shared.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import {
  canonicalSize,
  POSITION_POINTS,
  resolveGarmentPlacement,
  type FirmenProfil,
  type GarmentType,
  type VeredelungMotivLine,
  type VeredelungsauftragDokument,
} from "@texma/shared";
import {
  CAP_FRONT_B64,
  CAP_HINTEN_B64,
  CAP_LINKS_B64,
  CAP_RECHTS_B64,
  HOSE_FRONT_B64,
  SHIRT_BACK_B64,
  SHIRT_FRONT_B64,
} from "@texma/shared/garment-assets";

const PW = 595, PH = 841, ML = 40, MR = 40, CW = PW - ML - MR;
const P = 12; // globales Padding (wie in der Vorlage)

// TEXMA-Palette (Navy #0E1C36 + Grün), aus der Renderer-Vorlage.
const C = {
  black: rgb(0, 0, 0),
  white: rgb(1, 1, 1),
  grey: rgb(0.055, 0.11, 0.212), // Labels: Navy hochgesetzt für Lesbarkeit
  lgrey: rgb(0.82, 0.82, 0.82),
  green: rgb(0.29, 0.57, 0.17),
  darkgreen: rgb(0.18, 0.42, 0.1),
  lightgreen: rgb(0.9, 0.96, 0.88),
  navy: rgb(0.055, 0.11, 0.212),
};

function datum(d: Date | null): string {
  return d ? d.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" }) : "";
}

export async function renderVeredelungsauftragPdf(doc: VeredelungsauftragDokument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Veredelungsauftrag ${doc.nummer}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);

  const b64ToBytes = (b64: string): Uint8Array => Buffer.from(b64, "base64");
  const embedJpg = async (b64?: string): Promise<PDFImage | null> => {
    if (!b64) return null;
    try { return await pdf.embedJpg(b64ToBytes(b64)); } catch { return null; }
  };
  const embedPng = async (b64: string): Promise<PDFImage | null> => {
    try { return await pdf.embedPng(b64ToBytes(b64)); } catch { return null; }
  };

  // Logo (Firmenprofil, JPEG) + Kleidungs-Skizzen (Shirt JPEG, Cap/Hose PNG).
  const logoImg = await embedJpg(doc.logoB64);
  const frontImg = await embedJpg(SHIRT_FRONT_B64);
  const backImg = await embedJpg(SHIRT_BACK_B64);
  const capImg: Record<string, PDFImage | null> = {
    front: await embedPng(CAP_FRONT_B64),
    links: await embedPng(CAP_LINKS_B64),
    rechts: await embedPng(CAP_RECHTS_B64),
    hinten: await embedPng(CAP_HINTEN_B64),
  };
  const hoseImg = await embedPng(HOSE_FRONT_B64);

  const f = doc.firma;

  // ── Low-level Zeichen-Helfer (aus der Vorlage) ──────────────────────────────
  function sanitize(text: unknown): string {
    return String(text ?? "").replace(/[^\x20-\x7EÀ-ž]/g, "");
  }
  function T(page: PDFPage, text: unknown, x: number, y: number, size: number, fnt?: PDFFont, color?: ReturnType<typeof rgb>): void {
    const s = sanitize(text);
    if (!s.trim()) return;
    try { page.drawText(s, { x, y, size, font: fnt ?? font, color: color ?? C.black }); } catch { /* ignore */ }
  }
  function wrapText(text: unknown, size: number, fnt: PDFFont, maxWidth: number): string[] {
    const raw = String(text ?? "").replace(/\\n/g, "\n");
    const lines: string[] = [];
    for (const para of raw.split("\n")) {
      const words = sanitize(para).split(" ");
      let current = "";
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (fnt.widthOfTextAtSize(test, size) <= maxWidth) current = test;
        else { if (current) lines.push(current); current = word; }
      }
      if (current || para.trim()) lines.push(current);
    }
    return lines.length ? lines : [""];
  }
  function L(page: PDFPage, x1: number, y1: number, x2: number, y2: number, w?: number, color?: ReturnType<typeof rgb>): void {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: w ?? 0.4, color: color ?? C.lgrey });
  }
  function R(page: PDFPage, x: number, y: number, w: number, h: number, fill?: ReturnType<typeof rgb>, stroke?: ReturnType<typeof rgb>, sw?: number): void {
    page.drawRectangle({ x, y, width: w, height: h, color: fill, borderColor: stroke, borderWidth: sw ?? 0 });
  }

  const newPage = (): PDFPage => pdf.addPage([PW, PH]);

  // ── Kopf (je Seite): Logo links · Titel zentriert · Datum rechts ────────────
  function drawHeader(page: PDFPage): void {
    const HDR_H = 100;
    R(page, 0, PH - HDR_H, PW, HDR_H, C.white);
    if (logoImg) {
      let lw = 110;
      let lh = (logoImg.height / logoImg.width) * lw;
      const maxH = 52;
      if (lh > maxH) { lh = maxH; lw = (logoImg.width / logoImg.height) * lh; }
      try { page.drawImage(logoImg, { x: ML, y: PH - HDR_H / 2 - lh / 2, width: lw, height: lh }); } catch { /* ignore */ }
    } else {
      // Fallback-Wortmarke TE·X·MA
      let cx = ML;
      for (const [t, col] of [["TE", C.navy], ["X", C.green], ["MA", C.navy]] as Array<[string, ReturnType<typeof rgb>]>) {
        T(page, t, cx, PH - HDR_H / 2 - 6, 22, fontB, col);
        cx += fontB.widthOfTextAtSize(t, 22);
      }
    }
    const titleSize = 16;
    const titleW = fontB.widthOfTextAtSize("VEREDLUNGSAUFTRAG", titleSize);
    T(page, "VEREDLUNGSAUFTRAG", (PW - titleW) / 2, PH - HDR_H / 2 - titleSize / 2 + 2, titleSize, fontB, C.navy);
    T(page, "Datum:", PW - MR - 74, PH - HDR_H / 2 + 6, 7, font, C.grey);
    T(page, datum(doc.datum), PW - MR - 74, PH - HDR_H / 2 - 6, 9, font, C.navy);
  }

  // ── Meta (Seite 1): Veredler · Auftrags-Nr. · Kunde [· Kommission] + Arten ──
  function drawMeta(page: PDFPage): number {
    let y = PH - 108;
    T(page, "Veredler", ML, y + 10, 7, font, C.grey);
    T(page, "Auftrags-Nr.", ML + 130, y + 10, 7, font, C.grey);
    T(page, "Kunde", ML + 260, y + 10, 7, font, C.grey);
    T(page, doc.veredler, ML, y, 9.5, fontB, C.navy);
    T(page, doc.nummer, ML + 130, y, 9.5, fontB, C.navy);
    T(page, doc.kunde, ML + 260, y, 9.5, fontB, C.navy);
    if (doc.kommission) {
      T(page, "Kommission", ML + 410, y + 10, 7, font, C.grey);
      T(page, doc.kommission, ML + 410, y, 9.5, fontB, C.navy);
    }

    y -= 18;
    L(page, ML, y, PW - MR, y, 0.5, C.lgrey);
    y -= 14;

    T(page, "Veredelungsart:", ML, y, 7.5, font, C.grey);
    const arten: Array<[string, boolean]> = [
      ["Bestickt", doc.arten.bestickt], ["Bedruckt", doc.arten.bedruckt], ["Beflockt", doc.arten.beflockt],
      ["Transfer", doc.arten.transfer], ["Plott", doc.arten.plott],
    ];
    let cx = ML + 88;
    for (const [label, on] of arten) {
      R(page, cx, y - 7, 9, 9, on ? C.green : rgb(0.94, 0.94, 0.94), C.lgrey, 0.6);
      if (on) T(page, "x", cx + 1.5, y - 5.5, 7, fontB, C.white);
      T(page, label, cx + 12, y - 1, 8, font, C.black);
      cx += 78;
    }
    y -= 14;
    L(page, ML, y, PW - MR, y, 0.5, C.lgrey);
    return y - 6;
  }

  // ── Beistellung: Artikel × Größen-Matrix ────────────────────────────────────
  function drawArtikelTable(pageIn: PDFPage, startY: number): { page: PDFPage; y: number } {
    let page = pageIn;
    let y = startY - 2;

    // Größenspalten kanonisch (XXL→2XL) und dedupliziert, in fachlicher Reihenfolge.
    const allSizes: string[] = [];
    for (const s of doc.groessen) {
      const c = canonicalSize(s);
      if (!allSizes.includes(c)) allSizes.push(c);
    }

    const artnrW = 90, nameW = 90, farbeW = 60;
    const sizeStartX = ML + artnrW + nameW + farbeW;
    const gesamtX = PW - MR - 30;
    const sizeAreaW = gesamtX - sizeStartX - 4;
    const sizeW = Math.min(26, sizeAreaW / Math.max(allSizes.length, 1));

    const drawRowGridLines = (yTop: number, rowH: number): void => {
      const vlines = [ML + artnrW, ML + artnrW + nameW, ML + artnrW + nameW + farbeW];
      for (let i = 1; i < allSizes.length; i++) vlines.push(sizeStartX + i * sizeW);
      if (allSizes.length > 0) vlines.push(gesamtX - 4);
      L(page, ML, yTop, ML, yTop - rowH, 0.5, C.lgrey);
      L(page, PW - MR, yTop, PW - MR, yTop - rowH, 0.5, C.lgrey);
      for (const vx of vlines) L(page, vx, yTop, vx, yTop - rowH, 0.3, C.lgrey);
    };

    const ROW_H = 22 + P;
    const drawHeaderRow = (): void => {
      R(page, ML, y - ROW_H, CW, ROW_H, C.lightgreen);
      T(page, "Art.", ML + 4, y - P - 4, 8, fontB, C.darkgreen);
      T(page, "Bezeichnung", ML + artnrW + 4, y - P - 4, 8, fontB, C.darkgreen);
      T(page, "Farbe", ML + artnrW + nameW + 4, y - P - 4, 8, fontB, C.darkgreen);
      allSizes.forEach((s, i) => {
        const tw = font.widthOfTextAtSize(s, 7.5);
        T(page, s, sizeStartX + i * sizeW + sizeW / 2 - tw / 2, y - P - 4, 7.5, fontB, C.darkgreen);
      });
      const gesLabelW = fontB.widthOfTextAtSize("Ges.", 8);
      T(page, "Ges.", gesamtX + 15 - gesLabelW, y - P - 4, 8, fontB, C.darkgreen);
      L(page, ML, y - ROW_H + 0.5, PW - MR, y - ROW_H + 0.5, 0.8, rgb(0.5, 0.5, 0.5));
      drawRowGridLines(y, ROW_H);
      y -= ROW_H;
    };
    drawHeaderRow();

    if (doc.matrix.length === 0) {
      T(page, "— keine Textil-Beistellung verknüpft —", ML + 4, y - 14, 8, font, C.grey);
      y -= 22;
    }

    const ART_ROW_H = 20 + P;
    for (const row of doc.matrix) {
      const nameLines = wrapText(row.bezeichnung, 8.5, font, nameW - 8);
      const farbLines = wrapText(row.farbe, 8.5, font, farbeW - 8);
      const rowLines = Math.max(nameLines.length, farbLines.length, 1);
      const dynRowH = Math.max(ART_ROW_H, rowLines * 12 + P * 2);

      // Seitenumbruch mit Kopf-Wiederholung, falls die Zeile nicht mehr passt.
      if (y - dynRowH < 70) {
        L(page, ML, y - 2, PW - MR, y - 2, 0.7, rgb(0.5, 0.5, 0.5));
        drawFooter(page);
        page = newPage();
        drawHeader(page);
        y = PH - 70;
        drawHeaderRow();
      }

      const blockH = rowLines * 12;
      const blockTopY = y - dynRowH / 2 + blockH / 2 - 4;
      T(page, row.artNr, ML + 4, blockTopY, 8.5, font, C.black);
      nameLines.forEach((l, li) => T(page, l, ML + artnrW + 4, blockTopY - li * 12, 8.5, font, C.black));
      farbLines.forEach((l, li) => T(page, l, ML + artnrW + nameW + 4, blockTopY - li * 12, 8.5, font, C.black));

      allSizes.forEach((s, si) => {
        let v = row.mengen[s] ?? 0;
        if (!v) {
          for (const k of Object.keys(row.mengen)) {
            if (canonicalSize(k) === s && row.mengen[k]) { v = row.mengen[k]!; break; }
          }
        }
        if (v) {
          const tw = font.widthOfTextAtSize(String(v), 8.5);
          T(page, String(v), sizeStartX + si * sizeW + sizeW / 2 - tw / 2, blockTopY, 8.5, font, C.black);
        }
      });
      if (row.gesamt) {
        const tw = fontB.widthOfTextAtSize(String(row.gesamt), 8.5);
        T(page, String(row.gesamt), gesamtX + 14 - tw, blockTopY, 8.5, fontB, C.darkgreen);
      }

      L(page, ML, y - dynRowH + 0.5, PW - MR, y - dynRowH + 0.5, 0.3, C.lgrey);
      drawRowGridLines(y, dynRowH);
      y -= dynRowH;
    }

    L(page, ML, y - 2, PW - MR, y - 2, 0.7, rgb(0.5, 0.5, 0.5));
    y -= 8;
    T(page, `Gesamt beigestellt: ${doc.beistellGesamt} Stück`, ML + artnrW + 4, y, 8.5, fontB, C.darkgreen);
    return { page, y: y - 6 };
  }

  // ── Veredelungspositionen (Karten mit Kleidungs-Skizze + Marker) ────────────
  function garmentImage(type: GarmentType, side: string): PDFImage | null {
    if (type === "shirt") return side === "back" ? backImg : frontImg;
    if (type === "hose") return hoseImg;
    return capImg[side] ?? capImg.front ?? null;
  }

  function drawVpos(pageIn: PDFPage, startY: number): { page: PDFPage; y: number } {
    let page = pageIn;
    let y = startY - 4;

    const sectionTitle = (p: PDFPage, ty: number): number => {
      R(p, ML, ty - 15, CW, 16, C.navy);
      T(p, "VEREDELUNGSPOSITIONEN", ML + 6, ty - 11, 9, fontB, C.white);
      return ty - 22;
    };
    y = sectionTitle(page, y);

    if (doc.positionen.length === 0) {
      T(page, "— keine Veredelungspositionen —", ML, y, 8, font, C.grey);
      return { page, y: y - 14 };
    }

    const LABEL = 6.5, VAL = 8.5, LH = VAL * 1.5, LAB_H = 10, PAD = P;
    const IMG_W = 68, IMG_H = Math.round((IMG_W * 293) / 220);
    const TXT_W = CW - IMG_W - 14;
    const TXT_X = ML + 6;
    const C1W = Math.round(TXT_W * 0.3);
    const C2W = Math.round(TXT_W * 0.22);
    const C3W = TXT_W - C1W - C2W - 8;

    doc.positionen.forEach((vp: VeredelungMotivLine, i) => {
      const titel = vp.platzierung || vp.motiv || vp.description || `Position ${i + 1}`;
      const motivVal = vp.motiv || vp.description;
      const bezL = wrapText(titel, 9.5, fontB, TXT_W - 20);
      const motL = wrapText(motivVal, VAL, font, C1W);
      const grL = wrapText(vp.motivGroesse, VAL, font, C2W);
      const fbL = wrapText(vp.farbton, VAL, font, C3W);
      const detail = vp.platzierungsdetails || vp.platzierung || "";
      const plL = wrapText(detail, VAL, font, TXT_W);
      const soL = wrapText(vp.sonstiges, VAL, font, TXT_W);
      const dtL = wrapText(vp.druckdatei, VAL, font, TXT_W);

      const bezH = bezL.length * 14;
      const row2H = Math.max(motL.length, grL.length, fbL.length) * LH + LAB_H + 4;
      const row3H = detail ? plL.length * LH + LAB_H + 4 : 0;
      const row4H = vp.sonstiges ? soL.length * LH + LAB_H + 4 : 0;
      const row5H = vp.druckdatei ? dtL.length * LH + LAB_H + 4 : 0;
      const txtH = bezH + 10 + row2H + row3H + row4H + row5H + PAD * 2 + 6;
      const boxH = Math.max(IMG_H + PAD * 2 + 8, txtH);

      if (y - boxH < 55) {
        drawFooter(page);
        page = newPage();
        drawHeader(page);
        y = PH - 70;
        y = sectionTitle(page, y);
      }

      R(page, ML, y - boxH, CW, boxH, C.white, C.lgrey, 0.3);
      const textBlockOffset = Math.max(0, (boxH - txtH) / 2);

      // Kleidungs-Skizze rechts + grüner Positionsmarker.
      const placement = resolveGarmentPlacement(vp);
      const imgX = ML + CW - IMG_W - 4;
      const imgY = y - PAD - IMG_H;
      const img = garmentImage(placement.type, placement.side);
      if (img) {
        try { page.drawImage(img, { x: imgX, y: imgY, width: IMG_W, height: IMG_H }); } catch { /* ignore */ }
      } else {
        R(page, imgX, imgY, IMG_W, IMG_H, C.white, C.lgrey, 0.5);
      }
      if (placement.pointId) {
        const pt = POSITION_POINTS[placement.type]?.[placement.side]?.find((p) => p.id === placement.pointId);
        if (pt) page.drawCircle({ x: imgX + pt.xPct * IMG_W, y: imgY + IMG_H - pt.yPct * IMG_H, size: 5, color: C.green, borderColor: C.darkgreen, borderWidth: 1.5 });
      }

      // Text links.
      let ty = y - PAD - textBlockOffset;
      R(page, ML + PAD, ty - 11, 13, 11, C.green);
      T(page, String(i + 1), ML + PAD + 3, ty - 10, 7, fontB, C.white);
      bezL.forEach((l, li) => T(page, l, ML + PAD + 18, ty - li * 13, 9.5, fontB, C.black));
      if (vp.menge) {
        const mengeStr = `${vp.menge}x`;
        const mengeW = fontB.widthOfTextAtSize(mengeStr, 9.5);
        T(page, mengeStr, ML + CW - IMG_W - 20 - mengeW, ty, 9.5, fontB, C.darkgreen);
      }
      ty -= bezH + 8;

      // Zeile 2: Motiv | Größe | Farbton.
      T(page, "Motiv", TXT_X, ty, LABEL, font, C.grey);
      T(page, "Größe", TXT_X + C1W + 4, ty, LABEL, font, C.grey);
      T(page, "Farbton", TXT_X + C1W + C2W + 8, ty, LABEL, font, C.grey);
      ty -= LAB_H;
      motL.forEach((l, li) => T(page, l, TXT_X, ty - li * LH, VAL, font, C.black));
      grL.forEach((l, li) => T(page, l, TXT_X + C1W + 4, ty - li * LH, VAL, font, C.black));
      fbL.forEach((l, li) => T(page, l, TXT_X + C1W + C2W + 8, ty - li * LH, VAL, font, C.black));
      ty -= row2H - LAB_H + 2;

      if (detail) {
        T(page, "Platzierungsdetails", TXT_X, ty, LABEL, font, C.grey);
        ty -= LAB_H;
        plL.forEach((l, li) => T(page, l, TXT_X, ty - li * LH, VAL, font, C.black));
        ty -= row3H - LAB_H + 2;
      }
      if (vp.sonstiges) {
        T(page, "Sonstiges", TXT_X, ty, LABEL, font, C.grey);
        ty -= LAB_H;
        soL.forEach((l, li) => T(page, l, TXT_X, ty - li * LH, VAL, font, C.black));
        ty -= row4H - LAB_H + 2;
      }
      if (vp.druckdatei) {
        T(page, "Druckdatei", TXT_X, ty, LABEL, font, C.grey);
        ty -= LAB_H;
        dtL.forEach((l, li) => T(page, l, TXT_X, ty - li * LH, VAL, font, C.darkgreen));
      }

      L(page, ML, y - boxH, PW - MR, y - boxH, 0.3, C.lgrey);
      y -= boxH + 4;
    });
    return { page, y };
  }

  // ── Termine / Bemerkungen ───────────────────────────────────────────────────
  function drawDates(page: PDFPage, startY: number): void {
    let y = startY - P;
    L(page, ML, y + P, PW - MR, y + P, 0.5, C.lgrey);
    const rows: Array<[string, string]> = [
      ["Voraussichtl. Anlieferung", datum(doc.anlieferung)],
      ["Tatsächliche Anlieferung", ""],
      ["Fertigstellung", datum(doc.fertigstellung)],
      ["Bemerkungen", doc.hinweise.join("  ·  ")],
    ];
    for (const [label, val] of rows) {
      T(page, label, ML, y - P, 7.5, font, C.grey);
      if (val) T(page, val, ML + 170, y - P, 8.5, font, C.navy);
      y -= P * 2 + 2;
      L(page, ML, y, PW - MR, y, 0.3, C.lgrey);
    }
  }

  // ── Fuß (je Seite) ──────────────────────────────────────────────────────────
  function drawFooter(page: PDFPage): void {
    L(page, ML, 36, PW - MR, 36, 0.4, C.lgrey);
    const line = [f.name, f.street, f.zipCity, `Tel. ${f.tel}`].filter(Boolean).join("  ·  ");
    T(page, line, ML, 24, 7, font, C.darkgreen);
    R(page, ML, 35, CW, 1, C.green);
  }

  // ── Dokument aufbauen ───────────────────────────────────────────────────────
  let page = newPage();
  drawHeader(page);
  const afterMeta = drawMeta(page);
  const tableRes = drawArtikelTable(page, afterMeta - 2);
  page = tableRes.page;
  const vposRes = drawVpos(page, tableRes.y - 10);
  page = vposRes.page;
  drawDates(page, vposRes.y - 4);
  drawFooter(page);

  return pdf.save();
}
