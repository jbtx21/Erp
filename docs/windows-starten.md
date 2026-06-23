# Windows-Schnellstart (PowerShell)

Den ERP unter Windows lokal laufen lassen und durchklicken. Voraussetzungen:
**Node ≥ 22**, **pnpm**, **Docker Desktop** (für Postgres). Alle Befehle in PowerShell,
**einzeln** eingeben (nicht mit `&&` verketten).

## 1. Repo holen

```powershell
cd C:\Users\<DU>\Documents
git clone https://github.com/jbtx21/erp.git
cd erp
git log --oneline -1        # Kontrolle: zeigt den aktuellen Commit
```

## 2. Abhängigkeiten + Build

```powershell
pnpm install                # WARTEN bis "Done" — sonst gibt es kein dist/ und kein prisma
pnpm build
```

## 3. Postgres starten (Docker Desktop muss laufen)

```powershell
docker run --rm -d -p 5432:5432 -e POSTGRES_USER=texma -e POSTGRES_PASSWORD=texma -e POSTGRES_DB=texma postgres:16
docker ps                   # Kontrolle: eine Zeile postgres:16, Port 5432
```

> `Bind for 0.0.0.0:5432 failed: port is already allocated` heißt: es läuft schon ein
> Postgres auf 5432. Dann **keinen zweiten** starten — der vorhandene reicht (`docker ps`).

## 4. DB-Verbindung (.env) anlegen — PFLICHT

`packages\db\.env` ist gitignored und NICHT im Clone. Einmalig aus der Vorlage kopieren
(sonst: `Error: Environment variable not found: DATABASE_URL`):

```powershell
Copy-Item packages\db\.env.example packages\db\.env
```

## 5. Schema + Demo-Daten

```powershell
pnpm db:setup               # prisma generate + migrate deploy + seed
```

Erwartet am Ende: `Seed fertig: …`.

## 6. Starten — zwei PowerShell-Fenster (beide im erp-Ordner)

```powershell
pnpm dev:api                # Fenster 1 → API  http://localhost:3000 (Demo-ADMIN, kein Login)
```
```powershell
pnpm dev:web                # Fenster 2 → UI   http://localhost:5173
```

Dann **http://localhost:5173** im Browser öffnen.

## 7. Optional: testen

```powershell
pnpm test                   # Unit-/Logik-Tests (ohne DB)

# Integrationstests gegen echtes Postgres (Schritt 3 muss laufen):
$env:DATABASE_URL="postgresql://texma:texma@localhost:5432/texma"
$env:RUN_DB_TESTS="1"
pnpm --filter "@texma/api" test -- --no-file-parallelism
```

## Reihenfolge ist Pflicht — typische Fehler

| Fehler | Ursache |
|---|---|
| `Cannot find module …\dist\scripts\dev-server.js` | `pnpm install` / `pnpm build` übersprungen |
| `prisma … konnte nicht gefunden werden` | `pnpm install` fehlt (kein node_modules) |
| `Environment variable not found: DATABASE_URL` | Schritt 4 (`.env` kopieren) fehlt |
| HTTP **500** bei allen Daten-Abfragen | DB nicht migriert/`.env` fehlte; nach Fix `pnpm dev:api` **neu starten** |
| `port is already allocated` | Postgres läuft schon — keinen zweiten Container starten |
