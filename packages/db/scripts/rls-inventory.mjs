// RLS-Inventar & Generator (ADR 0004, RLS Slice 3 — Kinder-Tabellen).
//
// Klassifiziert ALLE Prisma-Modelle (aus dem generierten @prisma/client-DMMF) in drei
// Klassen und erzeugt daraus deterministisch die Slice-3-Artefakte:
//
//   root            — die 7 Wurzeln (User, Company, Supplier, Article, Quote, Order,
//                     Invoice): tragen bereits ein `tenantId`-Feld (Slice 1/2). Ausgeschlossen.
//   tenant-scoped   — jedes mandantenbezogene Kind (Belege-Kinder, Positionen, Bewegungen,
//                     Config je Mandant …). Default nach ADR: „im Zweifel tenant-scoped".
//   global/exempt   — bewusst OHNE tenantId/RLS (s. EXEMPT unten, je mit Begründung).
//
// Nutzung:
//   node packages/db/scripts/rls-inventory.mjs              → Klassifikation nach stdout
//   node packages/db/scripts/rls-inventory.mjs --sql <pfad> → Migration-SQL schreiben
//   node packages/db/scripts/rls-inventory.mjs --patch-schema
//                                                          → schema.prisma in place ergänzen
//                                                            (idempotent: überspringt Modelle,
//                                                             die bereits ein tenantId-Feld haben)
//
// Der Generator erzeugt das F12-Wrapping `(SELECT current_setting('app.tenant_id', true))`
// (InitPlan, einmal pro Query) und BEWUSST KEIN `FORCE ROW LEVEL SECURITY` (Slice-2-Schnitt,
// Owner-Bypass hält Dev/Migration/Seed grün; FORCE folgt in Slice 4).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { Prisma } = require(resolve(__dirname, "../generated/client/index.js"));

const SCHEMA_PATH = resolve(__dirname, "../prisma/schema.prisma");
const DEFAULT_TENANT = "tenant_texma";

// ── Global/exempt: bewusst OHNE tenantId — konservativ gehalten (ADR: „im Zweifel
//    tenant-scoped, Ausnahme begründen"). Jeder Eintrag trägt seine Begründung. ───────
const EXEMPT = {
  Tenant:
    "Die Mandanten-Registry selbst — Elterntabelle jedes tenantId-FK. Eine RLS/tenantId " +
    "auf Tenant wäre selbstreferenziell und würde die Isolationskette an der Wurzel kappen.",
  PriceGroup:
    "Enum-gekoppelter, global geteilter Preisgruppen-KATALOG (`kind PriceGroupKind @unique`, " +
    "6 code-definierte Arten). Die MANDANTENINDIVIDUELLEN Preise liegen in den tenant-scoped " +
    "Kindtabellen (PriceGroupPrice/PriceGroupPriceTier/CustomerPriceTier/CustomerSupplierPriceGroup). " +
    "Bliebe PriceGroup tenant-scoped, könnten mehrere Mandanten nicht dieselbe STANDARD-Gruppe " +
    "referenzieren (der Slice-2-Test teilt sie bewusst) und die kind-Eindeutigkeit bräche.",
};

// ── Klassifikation ────────────────────────────────────────────────────────────────────
const models = Prisma.dmmf.datamodel.models;
const tableOf = (m) => m.dbName ?? m.name;
const hasTenantId = (m) => m.fields.some((f) => f.name === "tenantId" && f.kind === "scalar");

const roots = [];
const children = [];
const exempts = [];
for (const m of models) {
  if (hasTenantId(m)) roots.push(m);
  else if (m.name in EXEMPT) exempts.push(m);
  else children.push(m);
}

// ── SQL-Generator (eine gruppierte Section je Kind-Tabelle) ─────────────────────────────
function genSql() {
  const head = `-- RLS Slice 3 — Kinder-Tabellen (ADR 0004). GENERIERT aus dem Prisma-DMMF via
-- packages/db/scripts/rls-inventory.mjs (Klassifikation: packages/db/scripts/rls-inventory.md).
-- Je tenant-scoped Kind: tenantId als Pflichtfeld mit DEFAULT '${DEFAULT_TENANT}' (backfillt
-- bestehende Zeilen in EINEM Schritt und hält alle bestehenden INSERTs grün — Muster wie
-- Slice 2 für die Wurzeln; der Default fällt in Slice 4), FK auf Tenant, Index, dann
-- ENABLE ROW LEVEL SECURITY + Policy tenant_isolation.
--
-- Pflicht-Detail Performance (F12/InitPlan): current_setting MUSS als Skalar-Subquery
-- (SELECT …) gewrappt sein — Postgres evaluiert sie EINMAL pro Query (InitPlan) statt pro
-- Zeile (~18×, Benchmark ADR 0004). Der Generator erzeugt das Wrapping.
--
-- BEWUSST KEIN FORCE ROW LEVEL SECURITY (Slice-2-Schnitt, ADR 0004 Slice 4): der Owner-
-- Bypass (Migrations-/Owner-Rolle, F13) hält Dev/Migration/Seed grün; das Enforcement gilt
-- für die Laufzeit-Rolle texma_app (DATABASE_URL_RUNTIME). FORCE folgt in Slice 4.
--
-- Fail-closed: fehlt der Tenant-Kontext, ist current_setting('app.tenant_id', true) NULL →
-- der Vergleich ist NULL → texma_app sieht 0 Zeilen.
--
-- Global/exempt (bewusst OHNE tenantId): ${exempts.map((m) => m.name).join(", ")}
--   (Begründung s. rls-inventory.md). ${children.length} tenant-scoped Kinder folgen.
`;
  const blocks = children.map((m) => {
    const t = tableOf(m);
    const bar = "─".repeat(Math.max(1, 70 - t.length));
    return `
-- ── ${t} ${bar}
ALTER TABLE "${t}" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT '${DEFAULT_TENANT}';
ALTER TABLE "${t}" ADD CONSTRAINT "${t}_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "${t}_tenantId_idx" ON "${t}"("tenantId");
ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "${t}"
  USING ("tenantId" = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ("tenantId" = (SELECT current_setting('app.tenant_id', true)));`;
  });
  return head + blocks.join("\n") + "\n";
}

// ── Schema-Patcher: fügt tenantId/tenant/@@index je Kind ein + Rückrelationen an Tenant ──
function patchSchema() {
  let src = readFileSync(SCHEMA_PATH, "utf8");
  const childNames = new Set(children.map((m) => m.name));

  // 1) Je Kind-Modellblock: Felder + @@index einfügen (idempotent).
  src = src.replace(/model (\w+) \{\n([\s\S]*?)\n\}/g, (full, name, body) => {
    if (!childNames.has(name)) return full;
    if (/\btenantId\b/.test(body)) return full; // schon gepatcht
    const fieldLines =
      `  // Mandant (ADR 0004, Slice 3) — Pflichtfeld mit Default: hält bestehende create-\n` +
      `  // Aufrufe grün (kein Call-Site-Refactor); der Default fällt in Slice 4.\n` +
      `  tenantId String @default("${DEFAULT_TENANT}")\n` +
      `  tenant   Tenant @relation(fields: [tenantId], references: [id])`;
    const lines = body.split("\n");
    const firstAttr = lines.findIndex((l) => /^\s*@@/.test(l));
    if (firstAttr === -1) {
      // keine Block-Attribute: Felder + Index ans Ende
      return `model ${name} {\n${body}\n${fieldLines}\n\n  @@index([tenantId])\n}`;
    }
    const before = lines.slice(0, firstAttr);
    const attrs = lines.slice(firstAttr);
    return (
      `model ${name} {\n` +
      before.join("\n") +
      `\n${fieldLines}\n\n` +
      attrs.join("\n") +
      `\n  @@index([tenantId])\n}`
    );
  });

  // 2) Rückrelationen an das Tenant-Modell (Prisma verlangt beide Seiten). Unbenannt —
  //    genau eine Relation je (Tenant, Kind) → eindeutig über die Typen. Feldname =
  //    camelCase(Modellname), garantiert eindeutig (Modellnamen sind eindeutig).
  const backrefs = children
    .map((m) => `  ${m.name[0].toLowerCase() + m.name.slice(1)} ${m.name}[]`)
    .join("\n");
  src = src.replace(/model Tenant \{\n([\s\S]*?)\n\}/, (full, body) => {
    if (/\/\/ Slice-3-Rückrelationen/.test(body)) return full; // idempotent
    return (
      `model Tenant {\n${body}\n` +
      `  // Slice-3-Rückrelationen (ADR 0004): Prisma verlangt die Gegenseite jeder\n` +
      `  // tenantId-Relation. Generiert via scripts/rls-inventory.mjs --patch-schema.\n` +
      `${backrefs}\n}`
    );
  });

  writeFileSync(SCHEMA_PATH, src);
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const sqlIdx = args.indexOf("--sql");

const list = (arr) => arr.map((m) => `  ${m.name.padEnd(28)} → ${tableOf(m)}`).join("\n");
console.log(`RLS-Inventar (ADR 0004, Slice 3) — ${models.length} Modelle gesamt\n`);
console.log(`root (${roots.length}, bereits tenantId — Slice 1/2, ausgeschlossen):\n${list(roots)}\n`);
console.log(`tenant-scoped child (${children.length}):\n${list(children)}\n`);
console.log(`global/exempt (${exempts.length}):\n${list(exempts)}\n`);
console.log(`Begründung exempt:`);
for (const [k, v] of Object.entries(EXEMPT)) console.log(`  - ${k}: ${v}`);

if (sqlIdx !== -1) {
  const out = resolve(process.cwd(), args[sqlIdx + 1]);
  writeFileSync(out, genSql());
  console.log(`\n[--sql] Migration geschrieben: ${out} (${children.length} Tabellen)`);
}
if (args.includes("--patch-schema")) {
  patchSchema();
  console.log(`\n[--patch-schema] schema.prisma ergänzt (${children.length} Kinder + Tenant-Rückrelationen)`);
}
