// CSV-Feld-Escaping nach RFC 4180: Felder mit Trennzeichen, Anführungszeichen oder
// Zeilenumbruch werden in "" gesetzt, innere " verdoppelt — verlustfrei. Eine
// gemeinsame Regel für alle CSV-Exporte (DSFinV-K, Offline-Bundle).

export function csvField(s: string): string {
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Serialisiert Kopfzeile + Datenzeilen zu CSV (Trennzeichen `;` = deutsches
 * Excel-Default, Zeilenende CRLF). Jede Zelle wird per `csvField` escaped.
 */
export function serializeCsv(headers: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
  const line = (cells: readonly string[]): string => cells.map((c) => csvField(c)).join(";");
  return [line(headers), ...rows.map(line)].join("\r\n");
}

/**
 * Parst CSV (Trennzeichen `;` oder `,` automatisch erkannt an der Kopfzeile) zu
 * Zeilen aus Zellen. RFC-4180-Quoting ("" = inneres "). Leerzeilen werden
 * übersprungen. Erste Zeile ist die Kopfzeile.
 */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^﻿/, ""); // BOM entfernen
  const delimiter = (clean.split("\n")[0]?.includes(";") ?? false) ? ";" : ",";
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let started = false;
  const pushField = (): void => { record.push(field); field = ""; };
  const pushRecord = (): void => { pushField(); records.push(record); record = []; started = false; };
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    started = true;
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) pushField();
    else if (ch === "\n") pushRecord();
    else if (ch === "\r") { /* ignorieren; CRLF */ }
    else field += ch;
  }
  if (started || field.length > 0 || record.length > 0) pushRecord();
  // Vollständig leere Zeilen verwerfen
  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ""));
  const headers = nonEmpty.shift() ?? [];
  return { headers: headers.map((h) => h.trim()), rows: nonEmpty };
}
