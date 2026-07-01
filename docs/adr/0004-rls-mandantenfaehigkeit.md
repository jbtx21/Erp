# ADR 0004 — Mandantenfähigkeit über Postgres Row-Level-Security (RLS)

- **Status:** akzeptiert (Design) — Umsetzung phasenweise, Slice 1 als Nächstes
- **Kontext-Leitplanken:** ADR 0003 (modularer Monolith, Strangler), CLAUDE.md (handgeschriebene Migrationen)
- **Entscheidung TEXMA:** „RLS voll umfänglich" (nicht nur dünne `tenantId`-Naht)

## Kontext

Cloud/SaaS in der EU erfordert echte Mandantentrennung. Heute ist der ERP **ein Mandant**
(112 Modelle, kein `tenantId`). „Voll umfänglich" heißt: **Datenbank-erzwungene** Isolation
(nicht nur Anwendungsfilter) — ein Fehler im Anwendungscode darf **niemals** Fremdmandanten-Daten
offenlegen. Das leistet **Postgres Row-Level-Security**: die DB filtert jede Query gegen den
aktiven Mandanten, unabhängig vom ORM-Code.

## Entscheidung

**Mandant = `Tenant`-Zeile.** Jede mandantenbezogene Tabelle bekommt `tenantId`, RLS-Policies
erzwingen `tenantId = current_setting('app.tenant_id')`. Der Mandant wird **pro Request** als
Session-Variable gesetzt, nicht als Query-Filter — so ist die Isolation DB-seitig garantiert.

### Mechanismus (Prisma + RLS)

1. **`Tenant`-Modell** + Default-Tenant („TEXMA") für den Bestand.
2. **`tenantId String`** auf allen mandantenbezogenen Tabellen (Ausnahmen: globale Stammdaten
   ohne Mandantenbezug — s. u.). FK auf `Tenant`, Index `@@index([tenantId])`.
3. **RLS aktivieren** je Tabelle: `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` +
   `CREATE POLICY tenant_isolation ON … USING (tenantId = current_setting('app.tenant_id', true)) WITH CHECK (…)`.
   Der App-DB-Rolle wird RLS **nicht** per `BYPASSRLS` erlassen (Superuser/Migrations-Rolle schon).
4. **Tenant-Kontext pro Request:** Prisma-**Client-Extension**/Middleware, die jede Operation in
   `prisma.$transaction` mit vorangestelltem `SET LOCAL app.tenant_id = '<tenantId>'` ausführt
   (`SET LOCAL` = transaktionslokal, kein Leak über Connection-Pool). Der `tenantId` kommt aus dem
   authentifizierten `ctx.user.tenantId` (Auth/Session).
5. **Schreiben:** `tenantId` wird serverseitig aus dem Kontext gesetzt (nie vom Client), `WITH CHECK`
   verhindert das Einschleusen fremder `tenantId`.

### Was NICHT `tenantId` bekommt (global)

Preisgruppen-Katalog-Enums, Kontenrahmen, Länder/Steuersätze-Referenz, reine Config-Lookups —
sofern nicht mandantenindividuell. Wird je Tabelle beim Rollout entschieden (Default: **mit**
`tenantId`, Ausnahme begründen).

## Phasenweiser Rollout (Strangler, nach jeder Scheibe grün)

- **Slice 1 — Fundament (zuerst):** `Tenant`-Modell + Migration; `tenantId` **additiv/nullable** auf
  den Wurzel-Entitäten (`Company`, `Supplier`, `Article`, `Order`, `Quote`, `Invoice`, …) + Backfill
  auf Default-Tenant; Prisma-Tenant-Context-Extension (Setzen von `app.tenant_id`); Auth-Kontext um
  `tenantId` erweitern; Seed setzt Default-Tenant. **Noch keine erzwingenden Policies** → Bestand
  bleibt grün (Unit-Tests nutzen In-Memory-Repos, sind RLS-neutral).
- **Slice 2 — Enforcement Wurzeln:** `tenantId` NOT NULL, RLS-Policies auf den Wurzel-Tabellen
  aktivieren; DB-Integrationstests (`RUN_DB_TESTS`) um Tenant-Kontext erweitern; Negativtest
  „Mandant A sieht Mandant B nicht".
- **Slice 3 — Kinder-Tabellen:** `tenantId` + Policy auf alle abhängigen Tabellen (Positionen,
  Bewegungen, Belege-Kinder …). Generierbar per Skript über die Prisma-DMMF (alle Modelle mit
  Mandantenbezug), damit „10→N Tabellen ohne proportionalen Aufwand".
- **Slice 4 — Härtung:** eigene DB-App-Rolle ohne `BYPASSRLS`; Migrations-/Seed-Rolle getrennt;
  Tenant-Auflösung über Subdomain/Claim; Tests, dass jede tRPC-Query ohne gesetzten Tenant leer/ablehnt.

## Konsequenzen

- **+** Isolation DB-erzwungen — Anwendungsfehler können keine Fremddaten leaken (stärker als
  Query-Filter). Skaliert auf viele Mandanten in EINER DB (kein Schema-/DB-per-Tenant-Overhead).
- **+** Orthogonal zur Domänenlogik (`packages/shared` bleibt tenant-agnostisch; nur Repo-/DB-Schicht
  betroffen) — passt zu ADR 0003.
- **−** Jede DB-Query braucht den Tenant-Kontext (Extension); vergessener Kontext → leere Ergebnisse
  (fail-closed, gewollt). Migrations-/Wartungsjobs laufen unter der BYPASSRLS-Rolle.
- **−** `$transaction`-Wrapping je Request kostet etwas Latenz (vernachlässigbar bei Pooling).

## Risiken / offene Punkte

- **Connection-Pooling + `SET LOCAL`:** nur transaktionslokal sicher — die Extension MUSS jede
  Operation in eine Transaktion hüllen (kein bloßes `SET` auf gepoolter Connection).
- **1.232 Tests:** Unit-Tests (In-Memory) bleiben unberührt; DB-Integrationstests brauchen einen
  Tenant-Fixture-Kontext. Seed + Dev-Login setzen den Default-Tenant.
- **Bestehende Daten:** Backfill-Migration ordnet alles dem Default-Tenant zu (verlustfrei).

## Umsetzungshinweis

Slice 1 ist bewusst **additiv und grün-haltend** (nullable `tenantId` + Backfill, Extension aktiv,
aber Policies noch nicht erzwingend). Enforcement (Slice 2+) folgt als eigene, verifizierte Scheibe —
so bleibt „nach jeder Schicht grün" (CLAUDE.md) auch bei einem 112-Tabellen-Rollout gewahrt.
