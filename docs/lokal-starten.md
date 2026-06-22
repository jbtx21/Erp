# Lokal starten — den vollen Stack durchklicken

Ziel: das ERP **echt** laufen lassen (Postgres + tRPC-API + React-UI) mit Demo-Daten,
nicht nur grüne Tests. Verifiziert am 2026-06-22 gegen PostgreSQL 16 (alle 37 Migrationen
sauber eingespielt, Seed + HTTP-Abfragen erfolgreich).

## 1. Postgres bereitstellen

**Normalfall (Docker):**
```bash
docker run --rm -d -p 5432:5432 \
  -e POSTGRES_USER=texma -e POSTGRES_PASSWORD=texma -e POSTGRES_DB=texma \
  postgres:16
```

**Ohne Docker** (z. B. Cloud-Ausführungsumgebung ohne Daemon — nutzt das installierte
`postgresql-16`-Paket, Cluster unter `/tmp/texma-pg`):
```bash
bash scripts/dev-db-up.sh
```

Beide Wege ergeben dieselbe Verbindung wie in `packages/db/.env`:
`postgresql://texma:texma@localhost:5432/texma?schema=public`.

## 2. Schema + Demo-Daten

```bash
pnpm db:setup    # = prisma generate + migrate:deploy + seed
```

Der Seed (`apps/api/src/scripts/seed.ts`, idempotent) legt an: Preisgruppen, 2 Firmen,
einen Shop-Connector, Artikel + 3 Varianten, 2 Lieferanten, 4 Aufträge, 3 Produktions-
aufträge inkl. 2 Fremdvergabe-Stufen, 2 Angebote (Ampel), 2 Eingangs-/2 Ausgangsrechnungen.

## 3. API + UI starten

```bash
node apps/api/dist/scripts/dev-server.js   # API auf :3000 (fester Demo-ADMIN, kein Login)
pnpm --filter @texma/web dev               # UI  auf :5173
```

Der Dev-Server (`dev-server.js`) injiziert einen festen **ADMIN**-Demo-Nutzer, damit alle
Module ohne Login-Reibung gegen echte Daten lesen/schreiben. Für Rollen-Tests
(z. B. PRODUKTION-Redaktion) stattdessen den echten Login-Flow nutzen und mit
`apps/api/src/scripts/seed-admin.ts` einen User anlegen.

## 4. Schnelltest ohne UI (tRPC über HTTP)

```bash
curl -s localhost:3000/health                 # {"ok":true}
curl -s localhost:3000/trpc/shopOrders.list   # die geseedeten Aufträge
curl -s localhost:3000/trpc/dashboards.metrics
```

## Hinweise

- **Flüchtiger Container:** In der Cloud-Ausführungsumgebung wird der Cluster nicht
  persistiert — `scripts/dev-db-up.sh` + `pnpm db:setup` bauen ihn jederzeit neu auf.
- **Migrationen** wurden offline (ohne laufende DB) handgeschrieben; dieser Lauf ist der
  erste echte End-to-End-Nachweis, dass `0001…0037` konsistent durchlaufen.
- **Integrationstests** (`*.int.test.ts`) laufen nur mit `RUN_DB_TESTS=1` gegen eine
  `DATABASE_URL`. **Wichtig:** gegen eine *leere* DB (nicht die geseedete Dev-DB — die
  Tests machen globale Abfragen) und **seriell**, da sie sich eine DB teilen:
  ```bash
  createdb texma_test   # bzw. CREATE DATABASE texma_test
  DATABASE_URL=postgresql://texma:texma@localhost:5432/texma_test \
    RUN_DB_TESTS=1 pnpm --filter @texma/api exec vitest run --no-file-parallelism
  ```
  Verifiziert: **301/301 grün**. Unter Datei-Parallelität auf einer gemeinsamen DB
  kollidieren einige Fixtures (global-`@unique` Werte, geteilte Zeilen) → bekannte
  Flakiness; perspektivisch je Testdatei ein eigenes Schema/DB oder Transaktions-Rollback.
