// HAKRO-Pricat (.xlsx) → TEXMA EAN-Import-CSV.
// Mappt die HAKRO-Spalten auf das Format der EAN-Listen-Import-Seite:
//   EAN;Artikelnummer;Bezeichnung;Marke;Material;Pflegehinweis;Zolltarifnummer;Ursprungsland;Gewicht (g);EK (EUR)
// Reines Node (kein npm-Paket): die .xlsx ist ein ZIP — SharedStrings + Sheet-XML werden direkt geparst.
//
// Nutzung:  node scripts/pricat/hakro-to-ean-csv.mjs <pricat.xlsx> [out.csv]
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const src = process.argv[2];
const out = process.argv[3] ?? "hakro-ean-import.csv";
if (!src) { console.error("Pfad zur Pricat-.xlsx fehlt."); process.exit(1); }

const dir = mkdtempSync(join(tmpdir(), "pricat-"));
// execFileSync (Argument-Array, keine Shell) — kein Shell-Injection-Risiko über den Pfad.
execFileSync("unzip", ["-o", "-q", src, "-d", dir]);

const ss = readFileSync(join(dir, "xl/sharedStrings.xml"), "utf8");
const unesc = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#10;/g, " ");
const strings = [];
for (const m of ss.matchAll(/<si>(.*?)<\/si>/gs)) {
  let txt = ""; for (const t of m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)) txt += t[1];
  strings.push(unesc(txt));
}
const sheet = readFileSync(join(dir, "xl/worksheets/sheet1.xml"), "utf8");
const col = (ref) => ref.match(/^[A-Z]+/)[0];
function rowCells(rowXml) {
  const out = {};
  for (const c of rowXml.matchAll(/<c [^>]*?(?:\/>|>.*?<\/c>)/gs)) {
    const cx = c[0]; const r = cx.match(/r="([A-Z]+\d+)"/); if (!r) continue;
    const isStr = /t="s"/.test(cx); const vm = cx.match(/<v>(.*?)<\/v>/s);
    let v = vm ? vm[1] : ""; if (isStr && v !== "") v = strings[Number(v)] ?? "";
    out[col(r[1])] = v;
  }
  return out;
}

// Spalten-Mapping HAKRO → EAN-Import
const grams = (kg) => { const n = parseFloat(kg); return Number.isFinite(n) ? String(Math.round(n * 1000)) : ""; };
const csvField = (s) => { const v = String(s ?? "").trim(); return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
const HEADER = ["EAN", "Artikelnummer", "Bezeichnung", "Marke", "Material", "Pflegehinweis", "Zolltarifnummer", "Ursprungsland", "Gewicht (g)", "EK (EUR)"];
// TEXMA hat bei HAKRO immer den besten Preis → niedrigsten Staffel-EK nehmen
// (NetPrice / _H1 / _H2 / _H3 = Menge 1 / 10 / 100 / 500); leere/ungültige ignorieren.
const bestEk = (c) => {
  const vals = [c.N, c.P, c.R, c.T].map((x) => parseFloat(x)).filter((n) => Number.isFinite(n) && n > 0);
  return vals.length ? String(Math.min(...vals)) : (c.N ?? "");
};

const rows = [...sheet.matchAll(/<row[^>]*>.*?<\/row>/gs)].map((m) => m[0]);
let total = 0, skipped = 0;
const lines = [HEADER.join(";")];
for (let i = 1; i < rows.length; i++) { // Zeile 0 = Kopf
  const c = rowCells(rows[i]);
  if (!c.B || !/^\d{8,14}$/.test(c.B.replace(/\D/g, ""))) { skipped++; continue; } // ohne gültige GTIN-Länge
  total++;
  lines.push([
    c.B,                                   // GTIN → EAN
    c.A,                                   // ItemCode → Artikelnummer (Varianten-SKU)
    `${c.E ?? ""}${c.F ? ` (${c.F})` : ""}`, // Description (+ Farbe, Größe)
    "HAKRO",                               // Marke (konstant)
    c.H ?? "",                             // Mixture → Material
    c.AL ?? "",                            // WashingTemperature → Pflegehinweis
    c.AN ?? "",                            // HarmonizedCode → Zolltarifnummer
    c.AM ?? "",                            // CountryOfOrigin → Ursprungsland
    grams(c.AS),                           // ItemWeight (kg) → Gewicht (g)
    bestEk(c),                             // bester Staffel-EK → EK (EUR)
  ].map(csvField).join(";"));
}
writeFileSync(out, "﻿" + lines.join("\n"), "utf8");
console.log(`Geschrieben: ${out}`);
console.log(`Artikel/Varianten: ${total}  ·  übersprungen (ohne EAN): ${skipped}`);
console.log("Beispielzeilen:");
console.log(lines.slice(0, 4).join("\n"));
