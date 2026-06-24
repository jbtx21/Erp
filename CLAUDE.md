# TEXMA ERP — Projektkonventionen für Claude

TEXMA-Textilveredelung **und -handel**. Eigener ERP (kein Odoo/Frappe): TypeScript-Monorepo,
modularer Monolith. Diese Datei kodiert die verbindlichen Konventionen — folge ihnen statt
generischer ERP-/Landingpage-Muster.

## Architektur / Monorepo (pnpm + turbo)
- `apps/web` — React + **Mantine** + Vite, tRPC-Client. UI-Schicht.
- `apps/api` — Fastify + **tRPC** + Prisma. Hexagonal: **Services** mit **Repository-Interfaces**; je eine Prisma- und eine In-Memory-Implementierung (Tests).
- `packages/shared` — **reine, IO-freie Domänenlogik** + zod (preise, money, statemachine, mapping …). Hier gehören Berechnungen/Validierungen hin, testbar ohne DB.
- `packages/db` — Prisma-Schema + **handgeschriebene SQL-Migrationen**.
- `packages/audit` — GoBD-Audit-Trail.
- `services/workers` — Connectoren (WooCommerce/Shopify/Supplier) + **Outbox-Relay** (BullMQ/Redis).

## Harte Regeln
- **Geld immer in Cent (Int), niemals Float.** Anzeige via `euro(cents)`; Eingabe via `eurToCents`. Feldsuffix `…Cents`.
- **GoBD/Audit:** jede Mutation hängt einen Audit-Eintrag an (`buildEntry` + `AuditSink`). **Append-only-Ledger** für Bestand (`StockMove`) — kein direktes Setzen, Korrekturen sind Bewegungen. Keine stillen Überschreiber.
- **RBAC:** `roleProcedure("ADMIN","BUERO",…)` / `protectedProcedure`. Rollen ADMIN/BUERO/BUCHHALTUNG/PRODUKTION. PRODUKTION sieht keine Preise → `redactOrderForRole`.
- **USt zentral** über die Einstellungen (`settings.defaultTaxRate`), **nicht** je Position.
- **Externe Syncs** laufen über das **Outbox-Pattern** (`OutboxEvent` `order.status.update`) + Worker-Relay — nicht synchron im Request. Secrets verschlüsselt (`…Enc`, `SecretsProvider`).

## UI-Konventionen (ERPNext-/List→Form-Muster)
- **Listen** mit `DocListHeader` (Modul-Breadcrumb + fetter Titel + Aktion + Filterzeile), Tabellen via `AutoTable`.
- **Formulare/Details** mit `DocFormShell` (Breadcrumb + Titel + Statusabzeichen + Aktionsleiste) + Mantine-`Tabs`.
- **Status** in Listen als `StatusDot` (farbiger Punkt). Bausteine: `apps/web/src/doc-layout.tsx`.
- Deutsche Labels. Klare, Nielsen-konforme Beschriftungen; konsistente Muster über Module.

## Migrationen
- Neuer Ordner `packages/db/prisma/migrations/NNNN_name/migration.sql` (fortlaufende Nummer), **SQL handgeschrieben**. Danach `pnpm --filter @texma/db exec prisma validate` + `… generate`. CI wendet via `prisma migrate deploy` an (erstellt **keine** Migrationen automatisch).
- Datenmigrationen (Backfill) in dieselbe SQL-Datei. Strangler bevorzugen (additive Spalten, alte Struktur grün halten), dann umstellen.

## Tests & Checks
- `pnpm build` · `pnpm typecheck` · `pnpm test` (vitest). Nach jeder Schicht grün halten.
- Integrationstests sind hinter `RUN_DB_TESTS` / `RUN_REDIS_TESTS` gated.
- Neue Services/Mapper bekommen Unit-Tests (Repo ist test-heavy). Bei tRPC-Context-Erweiterung die Test-Contexts in `router.test.ts` mitpflegen.

## Stil
- Code wie der Code drumherum: gleiche Idiome, Kommentar-Dichte, Namensgebung. Kommentare referenzieren Kapitel (`Kap. X`) / Anforderungs-IDs (`B16`, `T-01`, `F4` …).
- Lieber kleine, feature-spezifische Dateien als Monolithen.
- Vor großen Modulen: Abhängigkeiten/Geschäftsregeln klären, nicht raten.

## Commits
- Auf dem Feature-Branch entwickeln; nach `main` nur auf Aufforderung. Footer an Commit-Messages:
  `Co-Authored-By: Claude …` + `Claude-Session: …`.
- **Keine** PRs ohne ausdrückliche Bitte.

## Wichtige Referenzdocs
`docs/` — u. a. `bauplan.md`, `domänenmodell.md`, `erp-ui-design.md`, `lager-artikel-bewertung.md`, `stammdaten-feldanalyse.md`, `openxe-lueckenanalyse.md`. ADRs unter `docs/adr/`.
