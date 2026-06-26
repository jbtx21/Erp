// Matrixprodukt-Stammdaten-Import (Xentral-Vorbild "Matrix-Produkt-Import"): eine flache
// CSV-Liste je Lieferant, in der jede Zeile einen Hauptartikel + eine Farbe + eine Größe
// (optional EK/Lieferanten-SKU) trägt. Daraus entstehen Hauptartikel (falls neu) und die
// Farbe×Größe-Varianten als Matrix. Rein/IO-frei: Parsen + Abgleichplan; das Anlegen
// (Artikel + generateMatrixVariants + EK) liegt im Service/Repository.
//
// Spalten (Xentral-Variablen ≈ deutsche Header):
//   Artikelnummer        = Hauptartikelnummer (matrixproduktvon)      [Pflicht]
//   Bezeichnung          = Artikelname (nur für neue Artikel relevant)
//   Farbe                = Wert der Gruppe 1 (matrixproduktwert1)     [Pflicht]
//   Größe                = Wert der Gruppe 2 (matrixproduktwert2)     [Pflicht]
//   Lieferantennummer    = Lieferanten-Artikelnummer (supplierSku)
//   EK netto             = Einkaufspreis netto (lieferanteinkaufnetto)

import { csvToRecords, type ColumnDef, type RowError } from "./dataio.js";
import { eurToCents } from "./money.js";
import { skuCode } from "./variants.js";

interface RawMatrixRow {
  sku: string;
  name: string;
  farbe: string;
  groesse: string;
  supplierSku: string;
  ek: string;
}

export const MATRIX_IMPORT_COLUMNS: ReadonlyArray<ColumnDef<RawMatrixRow>> = [
  { key: "sku", header: "Artikelnummer", required: true },
  { key: "name", header: "Bezeichnung" },
  { key: "farbe", header: "Farbe", required: true },
  { key: "groesse", header: "Größe", required: true },
  { key: "supplierSku", header: "Lieferantennummer" },
  { key: "ek", header: "EK netto" },
];

export type RowStatus = "neu" | "vorhanden" | "duplikat";

export interface MatrixPlanRow {
  /** 1-basierte Datenzeile (ohne Kopfzeile). */
  row: number;
  sku: string;
  name: string;
  farbe: string;
  groesse: string;
  /** Voraussichtliche Varianten-SKU (skuCode-Ableitung; der echte SKU-Anhang kann
   *  serverseitig aus dem Achswert-Stamm abweichen). */
  variantSku: string;
  ekCents: number | null;
  supplierSku: string | null;
  /** Ist der Hauptartikel neu (in der CSV/DB noch nicht gesehen)? */
  articleStatus: "neu" | "vorhanden";
  /** Ist die Farbe×Größe-Variante neu, vorhanden (DB) oder Duplikat (in derselben CSV)? */
  variantStatus: RowStatus;
}

export interface MatrixImportPlan {
  rows: MatrixPlanRow[];
  errors: RowError[];
  /** Anzahl eindeutiger neu anzulegender Hauptartikel. */
  newArticles: number;
  /** Anzahl neu anzulegender Varianten. */
  newVariants: number;
  /** Anzahl bereits vorhandener Varianten (DB-Treffer) — werden übersprungen. */
  existingVariants: number;
  /** Anzahl Zeilen mit EK-Preis (für die optionale Lieferantenzuordnung). */
  withEk: number;
}

export interface MatrixExistingIndex {
  /** Bereits vorhandene Hauptartikel (SKU, case-insensitive). */
  articleSkus: Iterable<string>;
  /** Bereits vorhandene Varianten als `sku|farbe|größe` (case-insensitive). */
  variantCombos: Iterable<string>;
}

const norm = (s: string): string => s.trim().toLowerCase();
const comboKey = (sku: string, farbe: string, groesse: string): string => `${norm(sku)}|${norm(farbe)}|${norm(groesse)}`;

/** Parst die Matrix-CSV (Header-basiert, validiert Pflichtspalten/-werte). */
export function parseMatrixCatalog(csv: string): { rows: RawMatrixRow[]; errors: RowError[] } {
  const { records, errors } = csvToRecords(MATRIX_IMPORT_COLUMNS, csv);
  return { rows: records, errors };
}

/**
 * Gleicht die geparsten Zeilen gegen den Bestand ab (schreibt nichts). Klassifiziert je
 * Zeile Artikel (neu/vorhanden) und Variante (neu/vorhanden/duplikat) und berechnet die
 * voraussichtliche Varianten-SKU. EK-Werte werden tolerant geparst (leer → null).
 */
export function planMatrixImport(csv: string, existing: MatrixExistingIndex): MatrixImportPlan {
  const { rows, errors } = parseMatrixCatalog(csv);
  const planRows: MatrixPlanRow[] = [];
  const moreErrors: RowError[] = [];

  const knownArticles = new Set<string>();
  for (const s of existing.articleSkus) knownArticles.add(norm(s));
  const knownCombos = new Set<string>();
  for (const c of existing.variantCombos) knownCombos.add(c.toLowerCase());

  // Innerhalb der CSV neu gesehene Artikel/Kombis, um Duplikate korrekt zu zählen.
  const seenArticles = new Set<string>();
  const seenCombos = new Set<string>();
  let newArticles = 0, newVariants = 0, existingVariants = 0, withEk = 0;

  rows.forEach((raw, i) => {
    const rowNo = i + 1;
    const sku = raw.sku.trim();
    const farbe = raw.farbe.trim();
    const groesse = raw.groesse.trim();

    let ekCents: number | null = null;
    if (raw.ek.trim()) {
      try { ekCents = eurToCents(raw.ek.trim()); }
      catch { moreErrors.push({ row: rowNo, message: `EK netto ungültig: „${raw.ek}“` }); }
    }
    if (ekCents !== null && ekCents < 0) {
      moreErrors.push({ row: rowNo, message: "EK netto darf nicht negativ sein" });
      ekCents = null;
    }
    if (ekCents !== null) withEk++;

    // Artikel-Status: vorhanden in DB oder bereits in dieser CSV gesehen → vorhanden.
    const skuKey = norm(sku);
    const articleKnown = knownArticles.has(skuKey) || seenArticles.has(skuKey);
    const articleStatus: "neu" | "vorhanden" = articleKnown ? "vorhanden" : "neu";
    if (!articleKnown) { newArticles++; seenArticles.add(skuKey); }

    // Varianten-Status: DB-Treffer → vorhanden; in dieser CSV schon dagewesen → duplikat; sonst neu.
    const ck = comboKey(sku, farbe, groesse);
    let variantStatus: RowStatus;
    if (knownCombos.has(ck)) { variantStatus = "vorhanden"; existingVariants++; }
    else if (seenCombos.has(ck)) { variantStatus = "duplikat"; }
    else { variantStatus = "neu"; newVariants++; seenCombos.add(ck); }

    planRows.push({
      row: rowNo, sku, name: raw.name.trim(), farbe, groesse,
      variantSku: `${sku}-${skuCode(farbe)}-${skuCode(groesse)}`,
      ekCents, supplierSku: raw.supplierSku.trim() || null,
      articleStatus, variantStatus,
    });
  });

  return {
    rows: planRows,
    errors: [...errors, ...moreErrors].sort((a, b) => a.row - b.row),
    newArticles, newVariants, existingVariants, withEk,
  };
}
