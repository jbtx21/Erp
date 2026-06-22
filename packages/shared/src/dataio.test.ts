import { describe, expect, it } from "vitest";
import { parseCsv, serializeCsv } from "./csv.js";
import { ARTICLE_COLUMNS, csvToRecords, recordsToCsv, type ArticleImport } from "./dataio.js";

describe("CSV serialize/parse", () => {
  it("Roundtrip mit Sonderzeichen (Semikolon, Anführungszeichen, Zeilenumbruch)", () => {
    const csv = serializeCsv(["a", "b"], [["x;y", 'er sagte "hi"'], ["zeile1\nzeile2", "ok"]]);
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(["a", "b"]);
    expect(rows[0]).toEqual(["x;y", 'er sagte "hi"']);
    expect(rows[1]).toEqual(["zeile1\nzeile2", "ok"]);
  });

  it("erkennt Komma-Trennung und ignoriert Leerzeilen + BOM", () => {
    const { headers, rows } = parseCsv("﻿a,b\n1,2\n\n3,4\n");
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([["1", "2"], ["3", "4"]]);
  });
});

describe("dataio: csvToRecords / recordsToCsv (Artikel)", () => {
  it("exportiert nur definierte Spalten in Reihenfolge", () => {
    const csv = recordsToCsv(ARTICLE_COLUMNS, [
      { sku: "A-1", name: "Polo", description: "", brand: "TX", materialComposition: "", careInstructions: "", hsCode: "", originCountry: "" } as ArticleImport,
    ]);
    expect(csv.split("\r\n")[0]).toContain("Artikelnummer;Bezeichnung");
    expect(csv.split("\r\n")[1]?.startsWith("A-1;Polo")).toBe(true);
  });

  it("ordnet Spalten über die Überschrift zu (Reihenfolge egal)", () => {
    const { records, errors } = csvToRecords(ARTICLE_COLUMNS, "Bezeichnung;Artikelnummer\nPolo;A-1");
    expect(errors).toHaveLength(0);
    expect(records[0]).toMatchObject({ sku: "A-1", name: "Polo" });
  });

  it("meldet fehlende Pflichtwerte je Zeile und überspringt sie", () => {
    const { records, errors } = csvToRecords(ARTICLE_COLUMNS, "Artikelnummer;Bezeichnung\nA-1;Polo\n;Ohne SKU");
    expect(records).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ row: 2 });
  });

  it("meldet fehlende Pflichtspalten gesamthaft", () => {
    const { records, errors } = csvToRecords(ARTICLE_COLUMNS, "Bezeichnung\nPolo");
    expect(records).toHaveLength(0);
    expect(errors[0]?.message).toContain("Artikelnummer");
  });
});
