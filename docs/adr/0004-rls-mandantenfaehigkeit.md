# ADR 0004 — Mandantenfähigkeit über Postgres Row-Level-Security (RLS)

- **Status:** akzeptiert — Slice 1–4 umgesetzt (Migration 0125): Slice 1 (Fundament,
  Commit 2605b2f), Slice 2 (Enforcement Wurzeln: Migration 0122, Tenant-RLS-Client-
  Verdrahtung, DB-Isolationstests), Slice 3 (Kinder-Tabellen: 105 tenant-scoped Kinder
  per DMMF-Inventar `packages/db/scripts/rls-inventory.mjs` → Migration 0124, DB-Isolationstest
  `rls-slice3.db.test.ts`; 112 RLS-Tabellen gesamt). **Slice 4 (Härtung):** Auth-Bootstrap
  (SECURITY-DEFINER-Funktionen `auth_resolve_session`/`auth_resolve_login`, Migration 0125)
  löst den Produktions-Blocker „Tenant-Auflösung vor Auth" — real erzwungen + verdrahtet
  (Session-Pfad) + verifiziert (`rls-slice4.db.test.ts`, Runtime-Smoke). FORCE, Default-Abbau
  und Multi-Tenant-Login-Verdrahtung sind **bewusst verschoben** (grün-haltend) — s.
  „Slice-4-Protokoll" unten.
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
   `CREATE POLICY tenant_isolation ON … USING ("tenantId" = (SELECT current_setting('app.tenant_id', true))) WITH CHECK (…)`.
   Der App-DB-Rolle wird RLS **nicht** per `BYPASSRLS` erlassen (Superuser/Migrations-Rolle schon).
   **Pflicht-Detail Performance (Research F12):** der `current_setting`-Aufruf MUSS als
   Skalar-Subquery `(SELECT …)` gewrappt sein — Postgres evaluiert ihn dann einmal pro Query
   (InitPlan) statt pro Zeile (Funktionsergebnisse werden in Policies NICHT gecacht). Öffentlich
   reproduzierter Benchmark (PlanetScale, 1 Mio. Zeilen / 10 Tenants): ~105 ms ungefiltert vs.
   ~1,96 s mit ungewrapptem Policy-Funktionsaufruf (~18×). Gilt für JEDE Policy, auch die
   skriptgenerierten in Slice 3 — der Generator erzeugt das Wrapping mit.
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
  `tenantId` erweitern; Seed setzt Default-Tenant. **Bereits in Slice 1: getrennte DB-Rollen**
  (Migrations-Rolle = Table Owner für `prisma migrate`; Laufzeit-Rolle ohne Ownership/`BYPASSRLS`
  mit eigener `DATABASE_URL` für den App-Client) — s. Sicherheits-Fallstrick unten; die Trennung
  ist grün-haltend, weil noch keine Policies erzwingen, und sie MUSS stehen, bevor Slice 2 startet.
  **Noch keine erzwingenden Policies** → Bestand bleibt grün (Unit-Tests nutzen In-Memory-Repos,
  sind RLS-neutral).
- **Slice 2 — Enforcement Wurzeln:** `tenantId` NOT NULL, RLS-Policies auf den Wurzel-Tabellen
  aktivieren (mit `(SELECT …)`-Wrapping, s. o.); DB-Integrationstests (`RUN_DB_TESTS`) um
  Tenant-Kontext erweitern; Negativtest „Mandant A sieht Mandant B nicht" — ausgeführt unter der
  **Laufzeit-Rolle** (unter der Owner-Rolle wäre der Test wertlos, s. Fallstrick unten).
- **Slice 3 — Kinder-Tabellen:** `tenantId` + Policy auf alle abhängigen Tabellen (Positionen,
  Bewegungen, Belege-Kinder …). Generierbar per Skript über die Prisma-DMMF (alle Modelle mit
  Mandantenbezug), damit „10→N Tabellen ohne proportionalen Aufwand".
- **Slice 4 — Härtung (umgesetzt, Migration 0125):** Auth-Bootstrap (SECURITY-DEFINER-Funktionen,
  löst die Tenant-Auflösung VOR Auth — der eigentliche Produktions-Blocker); Test, dass ohne
  gesetzten Tenant leer/abgelehnt wird (`rls-slice4.db.test.ts`). Tenant-Auflösung über
  Subdomain/Claim als Stub. `FORCE ROW LEVEL SECURITY`, Default-Abbau, Multi-Tenant-Login und
  Unique-Constraints je Mandant sind grün-haltend VERSCHOBEN — s. „Slice-4-Protokoll". (Die
  Rollentrennung selbst ist nach Slice 1 vorgezogen.)

## Konsequenzen

- **+** Isolation DB-erzwungen — Anwendungsfehler können keine Fremddaten leaken (stärker als
  Query-Filter). Skaliert auf viele Mandanten in EINER DB (kein Schema-/DB-per-Tenant-Overhead).
- **+** Orthogonal zur Domänenlogik (`packages/shared` bleibt tenant-agnostisch; nur Repo-/DB-Schicht
  betroffen) — passt zu ADR 0003.
- **−** Jede DB-Query braucht den Tenant-Kontext (Extension); vergessener Kontext → leere Ergebnisse
  (fail-closed, gewollt). Migrations-/Wartungsjobs laufen unter der BYPASSRLS-Rolle.
- **−** `$transaction`-Wrapping je Request kostet etwas Latenz (vernachlässigbar bei Pooling).

## Risiken / offene Punkte

- **Stiller Owner-/Superuser-Bypass (Research F13, Pflicht statt Härtung):** Postgres umgeht RLS
  für die **tabellenbesitzende Rolle** und Superuser **ohne Fehlermeldung**. Im Prisma-Standard-Setup
  (EINE `DATABASE_URL` für `migrate` und Client) ist die App-Rolle zugleich Table Owner → **null
  Tenant-Isolation**, obwohl Policies existieren und alles grün aussieht. Deshalb ist die Trennung
  Migrations-Rolle (Owner) / Laufzeit-Rolle (ohne Ownership, ohne `BYPASSRLS`) von Slice 4 nach
  **Slice 1 vorgezogen**; der Isolations-Negativtest läuft zwingend unter der Laufzeit-Rolle.
- **Per-Row-Policy-Evaluation (Research F12):** ungewrappte Funktionsaufrufe in Policies kosten
  ~18× (Benchmark s. Mechanismus Punkt 3) — Policies immer mit `(SELECT current_setting(…))`
  schreiben/generieren; bei Slice-2/3-Abnahme per `EXPLAIN` prüfen, dass ein InitPlan erscheint.
- **Connection-Pooling + `SET LOCAL`:** nur transaktionslokal sicher — die Extension MUSS jede
  Operation in eine Transaktion hüllen (kein bloßes `SET` auf gepoolter Connection).
- **1.232 Tests:** Unit-Tests (In-Memory) bleiben unberührt; DB-Integrationstests brauchen einen
  Tenant-Fixture-Kontext. Seed + Dev-Login setzen den Default-Tenant.
- **Bestehende Daten:** Backfill-Migration ordnet alles dem Default-Tenant zu (verlustfrei).

## Umsetzungshinweis

Slice 1 ist bewusst **additiv und grün-haltend** (nullable `tenantId` + Backfill, Extension aktiv,
aber Policies noch nicht erzwingend). Enforcement (Slice 2+) folgt als eigene, verifizierte Scheibe —
so bleibt „nach jeder Schicht grün" (CLAUDE.md) auch bei einem 112-Tabellen-Rollout gewahrt.

## Slice-4-Protokoll (Härtung) — real erzwungen vs. bewusst verschoben

**Oberste Regel dieser Scheibe: grün-haltend.** Dev/Tests/CI/Seed laufen als DB-Owner und
bleiben unverändert grün (`pnpm typecheck`/`test`/`build` ohne `RUN_DB_TESTS`). Jede Härtung,
die das gebrochen hätte, ist dokumentiert-verschoben statt erzwungen.

### Real erzwungen

- **Auth-Bootstrap (Priorität 1, der eigentliche Produktions-Blocker).** Unter `texma_app`
  (RLS scharf) lief der Session-/Login-Lookup in `createContext`, BEVOR der Tenant bekannt war
  → ohne `app.tenant_id` liefert jede Policy NULL → 0 Zeilen (fail-closed) → niemand konnte
  sich einloggen. Gelöst über zwei **SECURITY-DEFINER**-Funktionen (Migration 0125, Owner-eigen,
  `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO texma_app`, `SET search_path`):
  - `auth_resolve_session(p_token_hash text) → (user_id, tenant_id)` — nur gültige (nicht
    abgelaufene) Sessions; Parameter ist der SHA-256-HASH (Hash-Bildung bleibt in der App).
  - `auth_resolve_login(p_email text) → (user_id, tenant_id)` — E-Mail → Tenant für den Login.
  Beide geben NUR IDs/Tenant zurück (keine Passwort-Hashes/Secrets). Verdrahtet in
  `apps/api/src/db/tenant-auth.ts` (`resolveTenantForSession`, `resolveTenantForLogin`,
  `resolveSessionWithTenant`): erst Tenant tenant-übergreifend auflösen, dann Session/User im
  gesetzten `runWithTenant(tenantId, …)`-Kontext regulär laden. **Session-Pfad** ist in
  `server.ts` (createContext + `/logos`-Route) verdrahtet. Unter der Owner-URL liefern dieselben
  Funktionen dasselbe → KEINE Regression (Owner-/Runtime-Smoke identisch grün).
- **„Ohne Tenant → abgelehnt/leer" (Priorität 2).** `rls-slice4.db.test.ts` (`RUN_DB_TESTS`)
  weist unter `texma_app` nach: direkte SELECT/INSERT auf User/Session/Company sind
  leer/abgelehnt (fail-closed); die Bootstrap-Funktionen lösen den Tenant korrekt auf; mit dem
  aufgelösten Kontext wird der Zugriff möglich; EXPLAIN zeigt weiterhin den InitPlan (F12).

### Bewusst verschoben (Grund je Punkt)

- **FORCE ROW LEVEL SECURITY (Priorität 3) — verschoben.** `FORCE` hebt den Owner-Bypass auf.
  Empirisch verifiziert: unter `FORCE` sieht der Owner OHNE Tenant-Kontext 0 Zeilen. Der Seed
  UND ~40 owner-laufende Integrationstests (`*.int.test.ts`) schreiben/lesen Order/Invoice/
  Payment o. Ä. ohne gesetzten Tenant-Kontext → `FORCE` auf diesen Tabellen färbt sie rot.
  Grün-verträglich wäre nur, den kompletten owner-laufenden Test-/Seed-Pfad in Tenant-Kontext
  zu hüllen (invasiv, eigener Schnitt). **Zusätzlich** darf `FORCE` NIE auf User/Session liegen,
  sonst laufen die SECURITY-DEFINER-Auth-Funktionen selbst unter RLS ins Leere. → „grün-haltend
  vor vollständig": FORCE bleibt offen (Defense-in-Depth-Rest).
- **Default-Abbau `@default("tenant_texma")` (Priorität 4) — verschoben.** Sauberer wäre, die
  tenant-prisma-Extension setzt `tenantId` bei CREATE serverseitig aus `currentTenantId()`. Aber
  Seed und owner-laufende Tests schreiben OHNE Tenant-Kontext und verlassen sich auf den
  DB-Default; ein Fallenlassen würde sie rot färben. Default BLEIBT die Single-Tenant-Krücke.
- **Multi-Tenant-Login-Verdrahtung — verschoben (TODO).** Der Single-Tenant-Login läuft heute
  korrekt über den Default-Tenant der `withTenant`-Middleware (publicProcedure). `auth_resolve_login`
  + `resolveTenantForLogin` sind fertig + getestet, aber NICHT in die Login-Procedure verdrahtet:
  das würde die DB-freien Router-Unit-Tests brechen. 1-Tenant-Annahme: `User.email` ist heute
  global eindeutig; echte Multi-Tenancy braucht E-Mail-Eindeutigkeit je Tenant + Auflösung über
  Subdomain/Claim.
- **Tenant-Auflösung Subdomain/Claim — Stub.** `resolveTenantFromRequest(req)` (tenant-auth.ts)
  liefert heute den Default-Tenant (Kommentar/TODO). Keine echte Subdomain-Infra — Design/Stub
  genügt (ADR-Vorgabe).
- **Unique-Constraints je Mandant — offen** (aus dem ursprünglichen Slice-4-Umriss; kein
  aktueller Bedarf im Single-Tenant, mit Default-Abbau zusammen anzugehen).

## Referenzen

Die beiden RLS-Fallstricke (InitPlan-Wrapping, Owner-Bypass → Rollentrennung ab Slice 1) sind
extern verifizierte Findings F12/F13 aus `docs/deep-research-vorsprung-2026.md` (je 3-0-Votum,
Quellen dort verlinkt: u. a. PlanetScale-Benchmark, Postgres-Doku zu Owner/`BYPASSRLS`).
