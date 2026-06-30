// Generischer Stammdaten-Im-/Export (CSV): spaltenbasierte, validierende Abbildung
// zwischen Datensätzen und CSV-Zeilen. Rein und IO-frei — die Persistenz (Upsert über
// den natürlichen Schlüssel) liegt im Service/Repository. Pro Entität eine Spaltenliste.

import { parseCsv, serializeCsv } from "./csv.js";

export interface ColumnDef<T> {
  /** Feldname im Datensatz. */
  key: keyof T & string;
  /** Spaltenüberschrift in der CSV (deutsch). */
  header: string;
  /** Pflichtfeld? Leerwert → Zeilenfehler. */
  required?: boolean;
}

export interface RowError {
  /** 1-basierte Datenzeile (ohne Kopfzeile). */
  row: number;
  message: string;
}

export interface ParseResult<T> {
  records: T[];
  errors: RowError[];
}

/** Datensätze → CSV-Text (nur die definierten Spalten, in Reihenfolge). */
export function recordsToCsv<T>(columns: ReadonlyArray<ColumnDef<T>>, records: ReadonlyArray<T>): string {
  const headers = columns.map((c) => c.header);
  const rows = records.map((rec) =>
    columns.map((c) => {
      const v = rec[c.key];
      return v === null || v === undefined ? "" : String(v);
    })
  );
  return serializeCsv(headers, rows);
}

/**
 * CSV-Text → Datensätze. Spalten werden über die Überschrift zugeordnet (Reihenfolge
 * egal, unbekannte Spalten ignoriert). Fehlende Pflichtspalten/-werte → Zeilenfehler;
 * fehlerhafte Zeilen liefern KEINEN Datensatz (werden übersprungen, aber gemeldet).
 */
export function csvToRecords<T>(columns: ReadonlyArray<ColumnDef<T>>, text: string): ParseResult<T> {
  const { headers, rows } = parseCsv(text);
  const errors: RowError[] = [];
  const records: T[] = [];

  // Überschrift → Spaltenindex (case-insensitive, getrimmt)
  const idxByHeader = new Map<string, number>();
  headers.forEach((h, i) => idxByHeader.set(h.trim().toLowerCase(), i));

  const missingCols = columns.filter((c) => c.required && !idxByHeader.has(c.header.toLowerCase()));
  if (missingCols.length > 0) {
    errors.push({ row: 0, message: `Pflichtspalten fehlen: ${missingCols.map((c) => c.header).join(", ")}` });
    return { records, errors };
  }

  rows.forEach((cells, r) => {
    const rec: Record<string, string> = {};
    const rowErrors: string[] = [];
    for (const c of columns) {
      const idx = idxByHeader.get(c.header.toLowerCase());
      const raw = idx === undefined ? "" : (cells[idx] ?? "").trim();
      if (c.required && raw === "") rowErrors.push(`${c.header} ist Pflicht`);
      rec[c.key] = raw;
    }
    if (rowErrors.length > 0) errors.push({ row: r + 1, message: rowErrors.join("; ") });
    else records.push(rec as unknown as T);
  });

  return { records, errors };
}

// ── Entitäts-Spalten ────────────────────────────────────────────────────────
// Schlüssel = interne Feldnamen (englisch), Header = deutsche CSV-Überschriften.

export interface ArticleImport {
  sku: string;
  name: string;
  description: string;
  // Pflicht-Stammpreise (Roh-CSV-Zellen in €; werden beim Import zu Cent geparst).
  ekCents: string;
  vkCents: string;
  brand: string;
  materialComposition: string;
  careInstructions: string;
  hsCode: string;
  originCountry: string;
}
export const ARTICLE_COLUMNS: ReadonlyArray<ColumnDef<ArticleImport>> = [
  { key: "sku", header: "Artikelnummer", required: true },
  { key: "name", header: "Bezeichnung", required: true },
  { key: "description", header: "Beschreibung", required: true },
  { key: "ekCents", header: "EK (€)", required: true },
  { key: "vkCents", header: "VK (€)", required: true },
  { key: "brand", header: "Marke" },
  { key: "materialComposition", header: "Material" },
  { key: "careInstructions", header: "Pflegehinweis" },
  { key: "hsCode", header: "Zolltarifnummer" },
  { key: "originCountry", header: "Ursprungsland" },
];

export interface CompanyImport {
  name: string;
  branche: string;
  zahlungszielTage: string;
  priceGroupKind: string;
}
export const COMPANY_COLUMNS: ReadonlyArray<ColumnDef<CompanyImport>> = [
  { key: "name", header: "Firmenname", required: true },
  { key: "branche", header: "Branche" },
  { key: "zahlungszielTage", header: "Zahlungsziel (Tage)" },
  { key: "priceGroupKind", header: "Preisgruppe" },
];

export interface SupplierImport {
  name: string;
  vatId: string;
  iban: string;
  bic: string;
}
export const SUPPLIER_COLUMNS: ReadonlyArray<ColumnDef<SupplierImport>> = [
  { key: "name", header: "Lieferantenname", required: true },
  { key: "vatId", header: "USt-IdNr." },
  { key: "iban", header: "IBAN" },
  { key: "bic", header: "BIC" },
];
