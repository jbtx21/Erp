// EAN-Listen-Import (B16/B18): parst eine Lieferanten-/Hersteller-EAN-Liste (CSV) und
// gleicht sie automatisch gegen den Variantenbestand ab — primär per EAN/GTIN, ersatzweise
// per Artikelnummer (SKU). Reine, IO-freie Logik; Persistenz/Anlage liegt im API-Service.
// Liefert einen Vorschauplan (Treffer/Nicht-Treffer/ungültige EAN), bevor geschrieben wird.

import { csvToRecords, type ColumnDef, type RowError } from "./dataio.js";
import { eurToCents } from "./money.js";
import { isValidGtin, normalizeGtin } from "./ean.js";

interface EanRowRaw {
  gtin: string;
  sku: string;
  name: string;
  brand: string;
  materialComposition: string;
  careInstructions: string;
  hsCode: string;
  originCountry: string;
  weightGrams: string;
  ekEur: string;
}

/** Spalten der EAN-Liste (deutsche Überschriften; Reihenfolge egal, nur „EAN" ist Pflicht). */
export const EAN_IMPORT_COLUMNS: ReadonlyArray<ColumnDef<EanRowRaw>> = [
  { key: "gtin", header: "EAN", required: true },
  { key: "sku", header: "Artikelnummer" },
  { key: "name", header: "Bezeichnung" },
  { key: "brand", header: "Marke" },
  { key: "materialComposition", header: "Material" },
  { key: "careInstructions", header: "Pflegehinweis" },
  { key: "hsCode", header: "Zolltarifnummer" },
  { key: "originCountry", header: "Ursprungsland" },
  { key: "weightGrams", header: "Gewicht (g)" },
  { key: "ekEur", header: "EK (EUR)" },
];

/** Geparste, typisierte Felder einer Importzeile (PIM + EK). */
export interface EanImportFields {
  name: string;
  brand: string;
  materialComposition: string;
  careInstructions: string;
  hsCode: string;
  originCountry: string;
  weightGrams: number | null;
  ekCents: number | null;
}

export interface EanImportRow {
  /** 1-basierte Nummer der gültigen Datenzeile (zur Anzeige). */
  line: number;
  /** Normalisierte EAN (nur Ziffern). */
  gtin: string;
  gtinValid: boolean;
  sku: string;
  fields: EanImportFields;
}

/** Bestandseintrag für den Abgleich (eine Variante). */
export interface VariantIndexEntry {
  variantId: string;
  articleId: string;
  sku: string;
  gtin: string | null;
  articleName: string;
}

export type EanMatchKind = "EAN" | "SKU" | "NONE";

export interface EanPlanRow extends EanImportRow {
  match: EanMatchKind;
  variantId: string | null;
  articleId: string | null;
  /** Anzeigename des Treffers (Artikelname + SKU), null bei Nicht-Treffer. */
  matchLabel: string | null;
}

export interface EanImportCounts {
  total: number;
  matchedEan: number;
  matchedSku: number;
  unmatched: number;
  invalidGtin: number;
}

export interface EanImportPlan {
  rows: EanPlanRow[];
  counts: EanImportCounts;
  errors: RowError[];
}

function intOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const v = Number.parseInt(t.replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(v) ? null : v;
}

function centsOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  try {
    return eurToCents(t);
  } catch {
    return null;
  }
}

/** CSV → typisierte Importzeilen (+ Zeilenfehler aus der Spaltenprüfung). */
export function parseEanList(csv: string): { rows: EanImportRow[]; errors: RowError[] } {
  const { records, errors } = csvToRecords(EAN_IMPORT_COLUMNS, csv);
  const rows: EanImportRow[] = records.map((r, i) => ({
    line: i + 1,
    gtin: normalizeGtin(r.gtin),
    gtinValid: isValidGtin(r.gtin),
    sku: r.sku.trim(),
    fields: {
      name: r.name.trim(),
      brand: r.brand.trim(),
      materialComposition: r.materialComposition.trim(),
      careInstructions: r.careInstructions.trim(),
      hsCode: r.hsCode.trim(),
      originCountry: r.originCountry.trim(),
      weightGrams: intOrNull(r.weightGrams),
      ekCents: centsOrNull(r.ekEur),
    },
  }));
  return { rows, errors };
}

/** Gleicht geparste Zeilen gegen den Bestand ab: EAN zuerst, sonst SKU. */
export function planEanImport(rows: ReadonlyArray<EanImportRow>, index: ReadonlyArray<VariantIndexEntry>): EanImportPlan {
  const byGtin = new Map<string, VariantIndexEntry>();
  const bySku = new Map<string, VariantIndexEntry>();
  for (const e of index) {
    if (e.gtin) byGtin.set(normalizeGtin(e.gtin), e);
    if (e.sku) bySku.set(e.sku, e);
  }

  const counts: EanImportCounts = { total: rows.length, matchedEan: 0, matchedSku: 0, unmatched: 0, invalidGtin: 0 };
  const planRows: EanPlanRow[] = rows.map((r) => {
    if (!r.gtinValid) counts.invalidGtin += 1;
    let match: EanMatchKind = "NONE";
    let hit: VariantIndexEntry | undefined;
    if (r.gtinValid && byGtin.has(r.gtin)) {
      match = "EAN";
      hit = byGtin.get(r.gtin);
    } else if (r.sku && bySku.has(r.sku)) {
      match = "SKU";
      hit = bySku.get(r.sku);
    }
    if (match === "EAN") counts.matchedEan += 1;
    else if (match === "SKU") counts.matchedSku += 1;
    else counts.unmatched += 1;
    return {
      ...r,
      match,
      variantId: hit?.variantId ?? null,
      articleId: hit?.articleId ?? null,
      matchLabel: hit ? `${hit.articleName} (${hit.sku})` : null,
    };
  });

  return { rows: planRows, counts, errors: [] };
}
