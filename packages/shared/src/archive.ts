// GoBD-Belegarchiv — reine Domänenlogik (Kap. 10). Inhalts-Adressierung (SHA-256),
// Aufbewahrungsfristen je Belegart (6/10 Jahre), WORM-Prüfung und der GoBD/GDPdU-
// „Z3"-Datenträger-Export (index.xml + manifest.csv). IO-frei und testbar; das
// tatsächliche Speichern (Objektspeicher) liegt in apps/api.

import { createHash } from "node:crypto";

/** Belegarten mit unterschiedlichen Aufbewahrungsfristen (Kap. 10.1). */
export type Belegart =
  | "RECHNUNG"
  | "GUTSCHRIFT"
  | "EINGANGSRECHNUNG"
  | "BUCHUNGSBELEG"
  | "LIEFERSCHEIN"
  | "AUFTRAGSBESTAETIGUNG"
  | "ANGEBOT"
  | "MAHNUNG"
  | "GESCHAEFTSBRIEF"
  | "LOGO"
  | "SONSTIGES";

export type RetentionClass = "BOOKING_10Y" | "BUSINESS_6Y";

/** 10 Jahre für Buchungsbelege/Rechnungen, sonst 6 Jahre (Geschäftsbriefe). */
export function retentionClassFor(belegart: Belegart): RetentionClass {
  switch (belegart) {
    case "RECHNUNG":
    case "GUTSCHRIFT":
    case "EINGANGSRECHNUNG":
    case "BUCHUNGSBELEG":
      return "BOOKING_10Y";
    default:
      return "BUSINESS_6Y";
  }
}

export function retentionYears(cls: RetentionClass): number {
  return cls === "BOOKING_10Y" ? 10 : 6;
}

/** Frühestes Löschdatum (Ende der Aufbewahrungsfrist) — steuerrelevant → sperren statt löschen. */
export function earliestDeletionDate(archivedAt: Date, belegart: Belegart): Date {
  const d = new Date(archivedAt);
  d.setFullYear(d.getFullYear() + retentionYears(retentionClassFor(belegart)));
  return d;
}

/** SHA-256 (hex) der Bytes — dient als inhaltsadressierter, unveränderbarer Speicher-Schlüssel. */
export function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export class WormViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WormViolationError";
  }
}

/**
 * WORM-Prüfung beim erneuten Ablegen unter demselben Speicher-Schlüssel: Inhalt MUSS
 * identisch sein (gleicher Hash). Abweichung ⇒ Verstoß (kein Überschreiben).
 */
export function assertWormConsistent(storageKey: string, existingSha: string | null, incomingSha: string): void {
  if (existingSha !== null && existingSha !== incomingSha) {
    throw new WormViolationError(
      `GoBD-Verstoß: Speicher-Schlüssel ${storageKey} ist belegt und unveränderbar (WORM, Kap. 10.1).`
    );
  }
}

/** Ein archivierter Beleg (Metadaten) für Listen und den GoBD-Export. */
export interface ArchivedDocMeta {
  id: string;
  belegart: Belegart;
  sourceEntity: string;
  sourceId: string;
  fileName: string;
  contentType: string;
  sha256: string;
  size: number;
  version: number;
  retentionClass: RetentionClass;
  archivedAt: Date;
  earliestDeletion: Date;
  legalHold: boolean;
}

function csvField(v: string): string {
  // Semikolon-CSV (DE), Felder mit Trennzeichen/Anführungszeichen werden gequotet.
  if (/[;"\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

const MANIFEST_COLUMNS = [
  "id",
  "belegart",
  "quelle",
  "quellId",
  "dateiname",
  "sha256",
  "groesse",
  "version",
  "aufbewahrung",
  "archiviertAm",
  "loeschbarAb",
] as const;

/** GoBD/GDPdU-Manifest als Semikolon-CSV (eine Zeile je Beleg, mit Kopfzeile). */
export function buildGobdManifestCsv(docs: readonly ArchivedDocMeta[]): string {
  const header = MANIFEST_COLUMNS.join(";");
  const rows = docs.map((d) =>
    [
      d.id,
      d.belegart,
      d.sourceEntity,
      d.sourceId,
      d.fileName,
      d.sha256,
      String(d.size),
      String(d.version),
      d.retentionClass,
      d.archivedAt.toISOString(),
      d.earliestDeletion.toISOString(),
    ]
      .map(csvField)
      .join(";")
  );
  return [header, ...rows].join("\r\n");
}

/**
 * GDPdU-Beschreibungsstandard `index.xml` (Z3-Datenträgerüberlassung): beschreibt die
 * Manifest-Tabelle (Spalten/Format), damit ein Prüfer (IDEA) den Export einlesen kann.
 */
export function buildGobdIndexXml(opts: { manifestFile: string; rowCount: number; createdAt: Date }): string {
  const cols = MANIFEST_COLUMNS.map(
    (name) => `        <VariableColumn>\n          <Name>${name}</Name>\n          <Description>${name}</Description>\n          <Alpha/>\n        </VariableColumn>`
  ).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE DataSet SYSTEM "gdpdu-01-09-2004.dtd">',
    "<DataSet>",
    "  <Version>1.0</Version>",
    "  <DataSupplier>",
    "    <Name>TEXMA Textilveredelung GmbH</Name>",
    "    <Location>Deutschland</Location>",
    "    <Comment>GoBD-Belegarchiv-Export (Z3)</Comment>",
    "  </DataSupplier>",
    "  <Media>",
    `    <Name>Belegarchiv ${opts.createdAt.toISOString().slice(0, 10)}</Name>`,
    "    <Table>",
    "      <URL>" + opts.manifestFile + "</URL>",
    "      <Name>Belegarchiv</Name>",
    "      <Description>Inhaltsadressiertes GoBD-Belegarchiv (WORM)</Description>",
    "      <Validity><Range><From/><To/></Range></Validity>",
    "      <UTF8/>",
    "      <DecimalSymbol>,</DecimalSymbol>",
    "      <DigitGroupingSymbol>.</DigitGroupingSymbol>",
    "      <Variable-Length>",
    "        <ColumnDelimiter>;</ColumnDelimiter>",
    "        <RecordDelimiter>&#13;&#10;</RecordDelimiter>",
    "        <TextEncapsulator>&quot;</TextEncapsulator>",
    cols,
    "      </Variable-Length>",
    `      <!-- ${opts.rowCount} Datensatz/Datensätze -->`,
    "    </Table>",
    "  </Media>",
    "</DataSet>",
  ].join("\n");
}
