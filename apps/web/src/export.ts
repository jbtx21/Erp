// Client-Export der Auswertungen: CSV (im Browser erzeugt), Excel (.xlsx via `xlsx`)
// und PDF-Download aus base64 (vom Server gerendert).

import { utils, write } from "xlsx";

/**
 * Neutralisiert CSV-Formula-Injection (Kap. 28): führende `= + - @`/Tab/CR werden mit
 * `'` entschärft, damit Excel die Zelle nicht als Formel ausführt. Echte Zahlen
 * (auch negative Beträge) bleiben unangetastet.
 */
function neutralizeFormula(value: string): string {
  if (value.length === 0) return value;
  const c = value[0];
  if (c === "=" || c === "@" || c === "\t" || c === "\r") return `'${value}`;
  if ((c === "-" || c === "+") && !/^[-+]?\d+(?:[.,]\d+)?$/.test(value)) return `'${value}`;
  return value;
}

/** Maskiert ein CSV-Feld nach RFC 4180 (Trennzeichen Semikolon für Excel/DE). */
function csvField(value: string): string {
  const safe = neutralizeFormula(value);
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Baut CSV-Text (Semikolon-getrennt, UTF-8) aus Spalten + Zeilen. */
export function toCsv(columns: string[], rows: string[][]): string {
  return [columns, ...rows].map((r) => r.map(csvField).join(";")).join("\r\n");
}

/** Löst einen Datei-Download im Browser aus. */
function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Lädt Spalten/Zeilen als CSV-Datei herunter (BOM für Excel-Umlaute). */
export function downloadCsv(fileName: string, columns: string[], rows: string[][]): void {
  const blob = new Blob(["﻿" + toCsv(columns, rows)], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, fileName);
}

// ── Excel-Export (.xlsx) ──────────────────────────────────────────────────────────
// Zellwert: echte Zahl (Number-Zelle für Excel-Rechnen) oder String (Text). Strings
// werden — wie beim CSV — gegen Formula-Injection entschärft, sonst wäre der xlsx-
// Export eine CSV-Injection-Lücke (Kap. 28).
export type XlsxCell = string | number;

/**
 * Baut die AoA (Array of Arrays) für ein Blatt: String-Zellen (inkl. Kopfzeile) werden
 * gegen Formula-Injection entschärft, Zahlen bleiben echte Number-Zellen. Ausgelagert,
 * damit die Neutralisierung testbar bleibt.
 */
export function toXlsxAoa(columns: string[], rows: XlsxCell[][]): XlsxCell[][] {
  return [columns, ...rows].map((r) => r.map((c) => (typeof c === "number" ? c : neutralizeFormula(String(c)))));
}

/** Lädt Spalten/Zeilen als .xlsx-Datei herunter (ein Blatt, Formula-Injection-sicher). */
export function downloadXlsx(fileName: string, sheetName: string, columns: string[], rows: XlsxCell[][]): void {
  const ws = utils.aoa_to_sheet(toXlsxAoa(columns, rows));
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)); // Excel-Grenze: 31 Zeichen je Blattname
  const buf = write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  triggerDownload(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName);
}

/** Lädt ein base64-kodiertes PDF (vom Server) als Datei herunter. */
export function downloadBase64Pdf(fileName: string, base64: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  triggerDownload(new Blob([bytes], { type: "application/pdf" }), fileName);
}
