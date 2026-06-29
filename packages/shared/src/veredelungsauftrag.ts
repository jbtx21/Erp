// Veredelungsauftrag (Lohnveredelung) — Arbeitsblatt an den Veredler bzw. die Inhouse-
// Veredelung (Kap. 5.3/5.4, T-04). KEIN Brief, sondern ein Werkstatt-Formular: Kopf
// (Veredler/Auftrags-Nr./Kunde), Veredelungsart-Ankreuzfelder, Beistellung als Größen-
// MATRIX (Art./Bezeichnung/Farbe/Größen/Gesamt) und Veredelungspositionen
// (Motiv/Größe/Farbton/Platzierung). Reine, IO-freie Aufbereitung (testbar ohne DB).

import { FIRMA_DEFAULT, type FirmenProfil } from "./beleg.js";

/** Eine beigestellte Textilzeile (eine Größe je Zeile, ab Auftragsbestätigung). */
export interface VeredelungTextilLine {
  /** Auftrags-Positionsnummer (Veredelungsbezug). */
  position: number;
  artNr: string;
  bezeichnung: string;
  farbe: string;
  groesse: string;
  menge: number;
}

/** Eine Veredelungsleistung (Motiv) am Textil — eine Karte je Veredelung auf dem Werkstattblatt. */
export interface VeredelungMotivLine {
  /** Leistungs-/Motivbeschreibung (z. B. „Logo Brust links, 2-farbig Siebdruck"). */
  description: string;
  /** Bezogene Textilpositionen (Auftrags-Positionsnummern); [] = unspezifisch. */
  bezugPositionen: number[];
  /** Platzierung als Karten-Titel (z. B. „Brust rechts"). */
  platzierung?: string;
  /** Motivname/Logo (z. B. „Logo Autohaus Weeber"); Fallback = description. */
  motiv?: string;
  /** Stückzahl dieser Veredelung (Karten-Menge „5x"). */
  menge?: number;
  farbton?: string;
  /** Motivgröße (z. B. „8 x 2 cm"). */
  motivGroesse?: string;
  /** Ausführliche Platzierungsbeschreibung (z. B. „Brust rechts linksbündig unter dem Logo"). */
  platzierungsdetails?: string;
  /** Sonstiges (z. B. Einzelname, Sondertext). */
  sonstiges?: string;
  /** Dateiname der Druck-/Stickdatei (Kartenfeld „Druckdatei"). */
  druckdatei?: string;
  /** Kleidungstyp für die Platzierungs-Skizze; default heuristisch aus Text (T-04). */
  positionType?: GarmentType;
  /** Ansicht der Skizze (front/back bzw. cap-Seiten); default heuristisch aus Text. */
  positionSide?: string;
  /** Markerpunkt-Id (z. B. „bl" = Brust links); default heuristisch aus Text. */
  positionId?: string;
}

export interface VeredelungsauftragInput {
  nummer: string;
  datum: Date;
  /** Veredler-Name; null/leer = Inhouse-Veredelung. */
  veredler: string | null;
  /** Kunde/Kommission (interne Referenz auf dem Werkstattblatt). */
  kunde: string;
  /** Auftrags-/Kommissions-Nr. */
  kommission?: string;
  textilien: VeredelungTextilLine[];
  motive: VeredelungMotivLine[];
  anlieferung?: Date | null;
  fertigstellung?: Date | null;
  hinweise?: string[];
  firma?: FirmenProfil;
  logoB64?: string;
  absender?: string[];
}

/** Eine Matrixzeile der Beistellung (ein Artikel/Farbe über alle Größenspalten). */
export interface VeredelungMatrixRow {
  artNr: string;
  bezeichnung: string;
  farbe: string;
  /** Menge je Größe (Spaltenschlüssel = Größe). */
  mengen: Record<string, number>;
  gesamt: number;
}

/** Fertiges Werkstattblatt-Modell (Render-Eingabe). */
export interface VeredelungsauftragDokument {
  nummer: string;
  datum: Date;
  veredler: string;
  inhouse: boolean;
  kunde: string;
  kommission: string | null;
  /** Angekreuzte Veredelungsarten (Bestickt/Bedruckt/…). */
  arten: VeredelungsartFlags;
  /** Größenspalten in fachlicher Reihenfolge. */
  groessen: string[];
  matrix: VeredelungMatrixRow[];
  /** Beigestellte Gesamtmenge (Summe der Matrix). */
  beistellGesamt: number;
  positionen: VeredelungMotivLine[];
  anlieferung: Date | null;
  fertigstellung: Date | null;
  hinweise: string[];
  firma: FirmenProfil;
  logoB64?: string;
  absender?: string[];
}

export interface VeredelungsartFlags {
  bestickt: boolean;
  bedruckt: boolean;
  beflockt: boolean;
  transfer: boolean;
  plott: boolean;
}

/** Kleidungstypen für die Platzierungs-Skizze (Werkstattblatt, T-04). */
export type GarmentType = "shirt" | "cap" | "hose";

/** Ein Markerpunkt auf der Kleidungs-Skizze (relative Koordinaten 0..1, y von oben). */
export interface GarmentPoint {
  id: string;
  label: string;
  xPct: number;
  yPct: number;
}

/**
 * Platzierungs-Koordinaten je Kleidungstyp und Ansicht (übernommen aus dem TEXMA-
 * Veredlungsauftrag-Generator). Der PDF-Renderer zeichnet anhand dieser Punkte den
 * grünen Positionsmarker auf die Kleidungs-Skizze.
 */
export const POSITION_POINTS: Record<GarmentType, Record<string, GarmentPoint[]>> = {
  shirt: {
    front: [
      { id: "bl", label: "Brust links", xPct: 0.64, yPct: 0.34 },
      { id: "br", label: "Brust rechts", xPct: 0.36, yPct: 0.34 },
      { id: "bm", label: "Brust Mitte", xPct: 0.5, yPct: 0.34 },
      { id: "kl", label: "Kragen links", xPct: 0.6, yPct: 0.16 },
      { id: "kr", label: "Kragen rechts", xPct: 0.4, yPct: 0.16 },
      { id: "ba", label: "Bauch", xPct: 0.5, yPct: 0.55 },
      { id: "al", label: "Aermel links", xPct: 0.82, yPct: 0.42 },
      { id: "ar", label: "Aermel rechts", xPct: 0.18, yPct: 0.42 },
      { id: "ml", label: "Manschette links", xPct: 0.88, yPct: 0.82 },
      { id: "mr", label: "Manschette rechts", xPct: 0.12, yPct: 0.82 },
    ],
    back: [
      { id: "rg", label: "Ruecken mitte", xPct: 0.5, yPct: 0.444 },
      { id: "ro", label: "Ruecken oben", xPct: 0.5, yPct: 0.307 },
      { id: "ru", label: "Ruecken unten", xPct: 0.5, yPct: 0.683 },
      { id: "na", label: "Nacken", xPct: 0.5, yPct: 0.205 },
      { id: "al", label: "Aermel links", xPct: 0.18, yPct: 0.42 },
      { id: "ar", label: "Aermel rechts", xPct: 0.82, yPct: 0.42 },
    ],
  },
  cap: {
    front: [
      { id: "cf", label: "Front mittig", xPct: 0.5, yPct: 0.41 },
      { id: "cfl", label: "Front links", xPct: 0.35, yPct: 0.41 },
      { id: "cfr", label: "Front rechts", xPct: 0.65, yPct: 0.41 },
    ],
    links: [{ id: "csl", label: "Seite links", xPct: 0.591, yPct: 0.341 }],
    rechts: [{ id: "csr", label: "Seite rechts", xPct: 0.409, yPct: 0.341 }],
    hinten: [
      { id: "ch", label: "Hinten mittig", xPct: 0.5, yPct: 0.239 },
      { id: "cv", label: "Verschluss", xPct: 0.5, yPct: 0.382 },
    ],
  },
  hose: {
    front: [
      { id: "htl", label: "Tasche links", xPct: 0.3, yPct: 0.35 },
      { id: "htr", label: "Tasche rechts", xPct: 0.7, yPct: 0.35 },
      { id: "hbl", label: "Bein links", xPct: 0.273, yPct: 0.512 },
      { id: "hbr", label: "Bein rechts", xPct: 0.705, yPct: 0.512 },
    ],
  },
};

/** Alias-Map: alte XX-Schreibweise → kanonische Form (2XL/3XL-Konvention). */
export const SIZE_ALIASES: Record<string, string> = {
  XXL: "2XL",
  XXXL: "3XL",
  XXXXL: "4XL",
  XXXXXL: "5XL",
  XXXXXXL: "6XL",
};

/** Kanonisiert eine Größenangabe (XXL→2XL, XXXL→3XL …); Unbekanntes nur getrimmt. */
export function canonicalSize(s: string): string {
  const u = String(s).toUpperCase().trim();
  return SIZE_ALIASES[u] ?? u;
}

/** Ergebnis der Platzierungsauflösung: Kleidungstyp, Ansicht und (optional) Markerpunkt. */
export interface GarmentPlacement {
  type: GarmentType;
  side: string;
  pointId?: string;
}

/** Faltet Umlaute/ß für robustes Text-Matching ("Ärmel"→"aermel", "Rücken"→"ruecken"). */
function foldText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

// Markerpunkt-Erkennung je Typ+Ansicht (spezifischste Regel zuerst). Mappt freien
// Platzierungstext auf eine Punkt-Id aus POSITION_POINTS (T-04).
const POINT_RULES: Record<string, ReadonlyArray<readonly [RegExp, string]>> = {
  "shirt:front": [
    [/brust\s*links/, "bl"],
    [/brust\s*rechts/, "br"],
    [/kragen\s*links/, "kl"],
    [/kragen\s*rechts/, "kr"],
    [/manschette\s*links/, "ml"],
    [/manschette\s*rechts/, "mr"],
    [/(aermel|arm)\D*links/, "al"],
    [/(aermel|arm)\D*rechts/, "ar"],
    [/bauch/, "ba"],
    [/brust/, "bm"],
  ],
  "shirt:back": [
    [/nacken/, "na"],
    [/ruecken\s*oben/, "ro"],
    [/ruecken\s*unten/, "ru"],
    [/(aermel|arm)\D*links/, "al"],
    [/(aermel|arm)\D*rechts/, "ar"],
    [/rueck/, "rg"],
  ],
  "cap:front": [
    [/front\s*links|links/, "cfl"],
    [/front\s*rechts|rechts/, "cfr"],
    [/.*/, "cf"],
  ],
  "cap:links": [[/.*/, "csl"]],
  "cap:rechts": [[/.*/, "csr"]],
  "cap:hinten": [
    [/verschluss/, "cv"],
    [/.*/, "ch"],
  ],
  "hose:front": [
    [/tasche\s*links/, "htl"],
    [/tasche\s*rechts/, "htr"],
    [/bein\s*links/, "hbl"],
    [/bein\s*rechts/, "hbr"],
    [/tasche/, "htl"],
    [/bein/, "hbl"],
  ],
};

/**
 * Bestimmt für eine Veredelungsposition die Kleidungs-Skizze (Typ/Ansicht/Markerpunkt).
 * Explizit gesetzte Felder (positionType/positionSide/positionId) haben Vorrang; sonst
 * wird heuristisch aus Platzierung/Motiv/Beschreibung abgeleitet (T-04). Pure, testbar.
 */
export function resolveGarmentPlacement(line: VeredelungMotivLine): GarmentPlacement {
  const txt = foldText(
    [line.platzierung, line.platzierungsdetails, line.motiv, line.description].filter(Boolean).join(" ")
  );

  const type: GarmentType =
    line.positionType ??
    (/\b(cap|kappe|muetze|beanie|basecap)\b/.test(txt)
      ? "cap"
      : /\b(hose|jeans|bein|short|pants)\b/.test(txt)
        ? "hose"
        : "shirt");

  let side = line.positionSide;
  if (!side) {
    if (type === "shirt") side = /rueck|nacken/.test(txt) ? "back" : "front";
    else if (type === "cap") side = /hinten|verschluss/.test(txt) ? "hinten" : /links/.test(txt) ? "links" : /rechts/.test(txt) ? "rechts" : "front";
    else side = "front";
  }
  // Ansicht auf eine vorhandene Skizze begrenzen, sonst Default-Ansicht des Typs.
  if (!POSITION_POINTS[type]?.[side]) side = Object.keys(POSITION_POINTS[type])[0]!;

  let pointId = line.positionId;
  if (!pointId) {
    const rules = POINT_RULES[`${type}:${side}`] ?? [];
    for (const [re, id] of rules) {
      if (re.test(txt)) {
        pointId = id;
        break;
      }
    }
  }
  // Marker nur, wenn die Id auf der gewählten Ansicht existiert.
  const valid = POSITION_POINTS[type]?.[side]?.some((p) => p.id === pointId);
  return valid ? { type, side, pointId } : { type, side };
}

/** Fachliche Größenreihenfolge (Konfektion); Unbekanntes hinten, dann alphabetisch. */
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"];
const SIZE_RANK = new Map(SIZE_ORDER.map((s, i) => [s.toUpperCase(), i]));
function sizeRank(size: string): number {
  const r = SIZE_RANK.get(size.toUpperCase());
  return r === undefined ? SIZE_ORDER.length : r;
}

/** Sortiert Größen fachlich (XS<S<M<…), Unbekanntes alphabetisch dahinter. */
export function sortSizes(sizes: Iterable<string>): string[] {
  return [...new Set(sizes)].sort((a, b) => {
    const ra = sizeRank(a), rb = sizeRank(b);
    return ra !== rb ? ra - rb : a.localeCompare(b, "de");
  });
}

/** Erkennt die Veredelungsarten aus den Motiv-/Leistungstexten (Ankreuzfelder). */
export function detectVeredelungsarten(motive: ReadonlyArray<VeredelungMotivLine>): VeredelungsartFlags {
  const text = motive.map((m) => m.description.toLowerCase()).join(" ");
  return {
    bestickt: /stick|emb|stich/.test(text),
    bedruckt: /druck|print|dtg|dtf/.test(text),
    beflockt: /flock/.test(text),
    transfer: /transfer/.test(text),
    plott: /plott|plot|folie/.test(text),
  };
}

/** Aggregiert Textilzeilen (je Größe) zur Beistell-Größenmatrix (Artikel/Farbe × Größe). */
export function buildBeistellMatrix(
  textilien: ReadonlyArray<VeredelungTextilLine>
): { groessen: string[]; matrix: VeredelungMatrixRow[]; gesamt: number } {
  const groessen = sortSizes(textilien.map((t) => t.groesse).filter(Boolean));
  const byKey = new Map<string, VeredelungMatrixRow>();
  const order: string[] = [];
  for (const t of textilien) {
    const key = `${t.artNr}|${t.bezeichnung}|${t.farbe}`;
    let row = byKey.get(key);
    if (!row) {
      row = { artNr: t.artNr, bezeichnung: t.bezeichnung, farbe: t.farbe, mengen: {}, gesamt: 0 };
      byKey.set(key, row);
      order.push(key);
    }
    const g = t.groesse || "—";
    row.mengen[g] = (row.mengen[g] ?? 0) + t.menge;
    row.gesamt += t.menge;
  }
  const matrix = order.map((k) => byKey.get(k)!);
  const gesamt = matrix.reduce((s, r) => s + r.gesamt, 0);
  return { groessen, matrix, gesamt };
}

/**
 * Baut das Werkstattblatt-Modell aus den Auftragsdaten (reine Aufbereitung):
 * Größenmatrix der Beistellung, erkannte Veredelungsarten, Motivpositionen.
 */
export function veredelungsauftragDokument(input: VeredelungsauftragInput): VeredelungsauftragDokument {
  const { groessen, matrix, gesamt } = buildBeistellMatrix(input.textilien);
  return {
    nummer: input.nummer,
    datum: input.datum,
    veredler: input.veredler && input.veredler.trim() ? input.veredler.trim() : "Inhouse-Veredelung",
    inhouse: !(input.veredler && input.veredler.trim()),
    kunde: input.kunde,
    kommission: input.kommission ?? null,
    arten: detectVeredelungsarten(input.motive),
    groessen,
    matrix,
    beistellGesamt: gesamt,
    positionen: input.motive,
    anlieferung: input.anlieferung ?? null,
    fertigstellung: input.fertigstellung ?? null,
    hinweise: input.hinweise ?? [],
    firma: input.firma ?? FIRMA_DEFAULT,
    ...(input.logoB64 ? { logoB64: input.logoB64 } : {}),
    ...(input.absender ? { absender: input.absender } : {}),
  };
}
