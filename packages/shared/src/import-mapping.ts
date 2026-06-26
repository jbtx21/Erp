// Generisches Import-Mapper-Modul (Xentral-„Import-Vorlagen"/Stammdaten-Import): nimmt eine
// hochgeladene Tabelle (CSV/Excel → Kopfzeile + Datenzeilen) und bildet ihre Spalten auf die
// ERP-Zielfelder ab. Rein/IO-frei: das Parsen der Datei (CSV/Excel) liegt im UI, die fachliche
// Import-Logik in den bestehenden Services (dataIo, matrixImport). Hier nur: Zielfeld-Katalog,
// Auto-Zuordnung (Spaltenüberschrift → Zielfeld) und der Umbau in eine kanonische CSV, die die
// vorhandenen Importer unverändert verstehen.

import { ARTICLE_COLUMNS, COMPANY_COLUMNS, SUPPLIER_COLUMNS, type ColumnDef } from "./dataio.js";
import { MATRIX_IMPORT_COLUMNS } from "./matrix-import.js";
import { serializeCsv } from "./csv.js";

export interface ImportField {
  /** Interner Feldschlüssel. */
  key: string;
  /** Anzeige + kanonische CSV-Überschrift (deutsch). */
  label: string;
  required: boolean;
  /** Synonyme (lowercased, alphanumerisch) für die automatische Erkennung. */
  aliases: string[];
}

export type ImportTargetId = "ARTICLE" | "COMPANY" | "SUPPLIER" | "MATRIX";

export interface ImportTarget {
  id: ImportTargetId;
  label: string;
  /** Ziel-Importer: dataIo (Artikel/Firma/Lieferant) oder matrix (Matrix-Artikel). */
  endpoint: "dataIo" | "matrix";
  /** dataIo-Entitätsart (nur endpoint=dataIo). */
  kind?: "ARTICLE" | "COMPANY" | "SUPPLIER";
  fields: ImportField[];
}

/** Normalisiert Überschriften/Aliase: lowercase, nur Buchstaben/Ziffern (Umlaute aufgelöst). */
export function normalizeHeader(s: string): string {
  return s.trim().toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

// Hand-kuratierte Synonyme je Feldschlüssel (ergänzen die Label-Erkennung).
const ALIASES: Record<string, string[]> = {
  sku: ["artikelnummer", "artnr", "artikelnr", "nummer", "sku", "itemno", "artikelidentnummer"],
  name: ["bezeichnung", "artikelname", "name", "produktname", "title", "namede"],
  description: ["beschreibung", "langtext", "description", "text"],
  brand: ["marke", "hersteller", "brand", "manufacturer"],
  materialComposition: ["material", "materialzusammensetzung", "stoff", "composition"],
  careInstructions: ["pflegehinweis", "pflege", "care"],
  hsCode: ["zolltarifnummer", "zolltarif", "hscode", "tarifnummer"],
  originCountry: ["ursprungsland", "herkunftsland", "origin", "country"],
  branche: ["branche", "industry", "sector"],
  zahlungszielTage: ["zahlungsziel", "zahlungszieltage", "paymentterms", "nettotage"],
  priceGroupKind: ["preisgruppe", "kundengruppe", "pricegroup"],
  vatId: ["ustidnr", "ustid", "umsatzsteuerid", "vatid", "ustidnummer"],
  iban: ["iban"],
  bic: ["bic", "swift"],
  farbe: ["farbe", "color", "colour"],
  groesse: ["groesse", "größe", "size", "groessen"],
  supplierSku: ["lieferantennummer", "lieferantennr", "lieferantensku", "lieferantenartikelnummer", "suppliersku", "lieferantnr", "liefnr"],
  ek: ["eknetto", "ek", "einkaufspreis", "einkaufnetto", "lieferanteinkaufnetto", "purchaseprice", "ekpreis"],
};

function fieldsFrom<T>(columns: ReadonlyArray<ColumnDef<T>>): ImportField[] {
  return columns.map((c) => ({
    key: c.key,
    label: c.header,
    required: !!c.required,
    aliases: [normalizeHeader(c.header), ...(ALIASES[c.key] ?? [])],
  }));
}

export const IMPORT_TARGETS: ImportTarget[] = [
  { id: "ARTICLE", label: "Artikel", endpoint: "dataIo", kind: "ARTICLE", fields: fieldsFrom(ARTICLE_COLUMNS) },
  { id: "COMPANY", label: "Kunden / Firmen", endpoint: "dataIo", kind: "COMPANY", fields: fieldsFrom(COMPANY_COLUMNS) },
  { id: "SUPPLIER", label: "Lieferanten", endpoint: "dataIo", kind: "SUPPLIER", fields: fieldsFrom(SUPPLIER_COLUMNS) },
  { id: "MATRIX", label: "Matrix-Artikel (Farbe×Größe)", endpoint: "matrix", fields: fieldsFrom(MATRIX_IMPORT_COLUMNS) },
];

export function importTargetById(id: ImportTargetId): ImportTarget {
  const t = IMPORT_TARGETS.find((x) => x.id === id);
  if (!t) throw new Error(`Unbekanntes Import-Ziel: ${id}`);
  return t;
}

export type FieldSource =
  | { kind: "column"; index: number }
  | { kind: "fixed"; value: string }
  | { kind: "none" };

/** Zuordnung Feldschlüssel → Quelle (CSV-Spalte / fester Wert / nichts). */
export type ColumnMapping = Record<string, FieldSource>;

/**
 * Automatische Spalten→Feld-Zuordnung: pro Zielfeld die am besten passende Überschrift
 * (exakter Label-/Alias-Treffer vor enthält-Treffer). Jede Quellspalte wird höchstens
 * einmal vergeben. Nicht erkannte Felder bleiben „none" (manuell zuzuweisen).
 */
export function autoMapColumns(headers: string[], fields: ImportField[]): ColumnMapping {
  const norm = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: ColumnMapping = {};

  const findExact = (aliases: string[]): number => norm.findIndex((h, i) => !used.has(i) && h.length > 0 && aliases.includes(h));
  const findContains = (aliases: string[]): number =>
    norm.findIndex((h, i) => !used.has(i) && h.length > 0 && aliases.some((a) => a.length >= 3 && (h.includes(a) || a.includes(h))));

  for (const f of fields) {
    let idx = findExact(f.aliases);
    if (idx < 0) idx = findContains(f.aliases);
    if (idx >= 0) { used.add(idx); mapping[f.key] = { kind: "column", index: idx }; }
    else mapping[f.key] = { kind: "none" };
  }
  return mapping;
}

/** Wert eines Feldes für eine Datenzeile auflösen. */
function valueFor(src: FieldSource | undefined, cells: string[]): string {
  if (!src) return "";
  if (src.kind === "column") return (cells[src.index] ?? "").trim();
  if (src.kind === "fixed") return src.value;
  return "";
}

export interface MappingApplyResult {
  /** Kanonische CSV (Feld-Labels als Kopfzeile) für die bestehenden Importer. */
  csv: string;
  /** Abgebildete Datensätze (key→Wert) für die Live-Vorschau. */
  records: Array<Record<string, string>>;
  /** Pflichtfelder ohne Quelle (blockieren den Import). */
  missingRequired: string[];
  /** Zugeordnete Felder (Quelle ≠ none). */
  mappedCount: number;
}

/**
 * Wendet die Zuordnung auf die Datenzeilen an und baut die kanonische CSV. Reihen, in denen
 * alle Felder leer sind, werden verworfen. Validierung/Upsert bleibt dem Ziel-Importer.
 */
export function applyMapping(target: ImportTarget, rows: string[][], mapping: ColumnMapping): MappingApplyResult {
  const records: Array<Record<string, string>> = [];
  const csvRows: string[][] = [];
  for (const cells of rows) {
    const rec: Record<string, string> = {};
    let anyValue = false;
    const line: string[] = [];
    for (const f of target.fields) {
      const v = valueFor(mapping[f.key], cells);
      rec[f.key] = v;
      line.push(v);
      if (v) anyValue = true;
    }
    if (!anyValue) continue;
    records.push(rec);
    csvRows.push(line);
  }
  const missingRequired = target.fields.filter((f) => f.required && (mapping[f.key]?.kind ?? "none") === "none").map((f) => f.label);
  const mappedCount = target.fields.filter((f) => (mapping[f.key]?.kind ?? "none") !== "none").length;
  const csv = serializeCsv(target.fields.map((f) => f.label), csvRows);
  return { csv, records, missingRequired, mappedCount };
}
