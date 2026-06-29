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
