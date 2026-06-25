// Client-Export der Auswertungen: CSV (im Browser erzeugt) und PDF-Download aus
// base64 (vom Server gerendert). Keine externen Abhängigkeiten.

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

/** Lädt ein base64-kodiertes PDF (vom Server) als Datei herunter. */
export function downloadBase64Pdf(fileName: string, base64: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  triggerDownload(new Blob([bytes], { type: "application/pdf" }), fileName);
}
