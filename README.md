# TEXMA ERP

ERP für die TEXMA Textilveredelung — Ablösung von CDH Office. **Teil-Make** (Lastenheft Kap. 24.1):
gekaufter/integrierter Standard-Block, Eigenbau nur an den vier Differenzierern.
TypeScript, modularer Monolith + separate Connector-Schicht, Cloud/SaaS (EU).

Vollständige fachliche Grundlage: [`docs/lastenheft.md`](docs/lastenheft.md) (v3.4, 39 Kapitel).
Strategie & Architektur (**Teil-Make**): [`docs/make-or-buy-leitplanken.md`](docs/make-or-buy-leitplanken.md)
und die ADRs unter [`docs/adr/`](docs/adr/) (0001 Auth/OIDC, 0002 Buy-Stack: Entra ID · Key Vault · finAPI · DATEV).
Internes UI/UX (Tokens, Tabellen, Status/Ampel): [`docs/erp-ui-design.md`](docs/erp-ui-design.md) · `apps/web/src/theme.ts`.

## Architektur (Kurzfassung)

- **Modularer Monolith** (`apps/api`, NestJS-Ziel) statt Microservices — passend zu
  ≤10 Usern / ~2.015 Aufträgen pro Jahr (Kap. 27) und minimiert den Bus-Faktor (Kap. 24.2).
- **Connector/Worker-Schicht** (`services/workers`) als separat deploybare Middleware —
  ein hängender Shop/Lieferant blockiert nie die Office-UI (Kap. 13, 32).
- **PostgreSQL + Prisma**, Geldbeträge in Cent (Integer), GoBD-Audit append-only (Kap. 10).
- ERP ist **Preis- und Rechnungsnummern-Master** (Kap. 3.2/19).

## Monorepo-Struktur

| Pfad | Inhalt | Kapitel |
|------|--------|---------|
| `packages/db` | Prisma-Kerndatenmodell (Firma/Kontakt/Lieferadresse, Artikel/echte Varianten, Angebot→Auftrag→PA→Unter-PA, Rechnung/OP, ShopConnector→Firma) | 2/4/5/8/9/11 |
| `packages/shared` | Geld-/Preislogik (Stick VK = EK × 1,88), WooCommerce-Mapping (T-01) | 4.4/3 |
| `packages/audit` | GoBD Audit-Trail + WORM/Aufbewahrungs-Primitive | 10 |
| `apps/api` | Anwendungslogik, u. a. Shop-Order-Import (Woo→Mapping→Persistenz→Audit) | 3/12/14 |
| `services/workers` | Connectoren (WooCommerce, Lieferanten, Banking, DPD, DATEV) | 3/6/9/13 |
| `docs/verfahrensdokumentation` | GoBD-Pflichtdokumentation (versioniert) | 10.5 |

## Make-or-break-Entscheidungen (umgesetzt & getestet)

- **Echte Variantenstruktur** Farbe×Größe statt CDH-Duplikate — `Article` 1:n `Variant` (Kap. 2.1 / T-02).
- **T-01 Firmenkunde-Mapping**: Shop-Bestellungen werden der **Firma** zugeordnet, nie dem
  einkaufenden Mitarbeiter — keine Phantom-Kunden. Reine Logik in
  `packages/shared/src/woocommerce.ts`, Ende-zu-Ende in
  `apps/api/src/modules/shop-import/` (Kap. 3.2/8.2 / T-01).
- **GoBD-Unveränderbarkeit**: finalisierte Belege sind WORM; Korrektur nur via Storno/Gutschrift
  (`packages/audit`, Kap. 10).
- **Positions-/Kalkulationstiefe je Zeile** (Kap. 4.4): EK-Pflicht bei Inline-Artikelanlage,
  **EK je Staffelstufe** (`VariantEkTier` — mengenrichtiger EK → Deckungsbeitrag), VK-Mengenstaffel
  im Angebots-PDF (ab Auftrag feste, aus den Textilpositionen abgeleitete Menge), sowie
  **Veredler und Platzierung je Position** → gruppierte Fremdvergabe-Unteraufträge + Werkstattblätter
  (T-15/T-16).

## Entwicklung

```bash
pnpm install
pnpm --filter @texma/db generate   # Prisma-Client erzeugen
pnpm build                         # alle Pakete (turbo, in Abhängigkeitsreihenfolge)
pnpm typecheck
pnpm test                          # inkl. Abnahme-Test T-01
```

Datenbank: `cp packages/db/.env.example packages/db/.env` und `DATABASE_URL` setzen
(Postgres, EU-Hosting). Migrationen: `pnpm --filter @texma/db migrate`.

### Vollen Stack lokal durchklicken (Docker)

Echte Postgres + tRPC-API + React-UI mit Demo-Daten — Schritt-für-Schritt-Anleitungen:
[`docs/lokal-testen.md`](docs/lokal-testen.md) (Windows + Docker Desktop, reine Klick-Anleitung)
bzw. [`docs/lokal-starten.md`](docs/lokal-starten.md) (Details/CLI). Kurzform:

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres 16 (Demo-Zugang aus .env.example)
cp packages/db/.env.example packages/db/.env      # einmalig (gitignored)
pnpm install && pnpm build
pnpm db:setup                                     # prisma generate + migrate:deploy + seed
pnpm dev:api                                       # API :3000 (fester Demo-ADMIN, kein Login)
pnpm dev:web                                        # UI  :5173  (zweites Terminal)
```

### Differenzierer-Durchstich ohne DB (Demo)

Die vier Moat-Module lassen sich ohne Postgres vorführen — ein Demo-Server seedet
In-Memory-Repos und erzwingt einen Demo-Nutzer (BUERO):

```bash
pnpm --filter @texma/api build && pnpm --filter @texma/api demo   # API mit Seed auf :3000
pnpm --filter @texma/web dev                                       # UI auf :5173 (proxyt /trpc → :3000)
```

Dann `http://localhost:5173` öffnen → Tab **Differenzierer**. Seed-PA-ID für Fremdvergabe
und Nachkalkulation: `PA-DEMO`. Der Stickerei-Vergleich läuft auch ohne Seed (reine Eingabe).

CI (`.github/workflows/ci.yml`): install → prisma generate/validate → typecheck → test.
Der Merge-Gate-Plan koppelt die Testfälle T-01…T-14 an die CI (Kap. 15).

## Status

Fundament + Differenzierer stehen und sind end-to-end durchklickbar: Monorepo, validiertes
Kerndatenmodell (>110 Migrationen), GoBD-Audit, Preislogik (inkl. Mengenstaffel + EK je
Staffelstufe), WooCommerce-Mapping (T-01). Die durchgängige Belegkette
**Anfrage → Angebot → Auftrag → Produktion/Fremdvergabe → Lieferschein → Rechnung** läuft mit
Beleg-PDFs (pdf-lib), Outbox-Sync, Fast-Lane/Teilrechnungen, DATEV-Buchungsstapel und
Banking-/Mahnwesen; Playwright-E2E-Walkthroughs decken die Kette ab. Standard-Block per
Buy/Integrate: Entra ID (OIDC-Verifier vorhanden) statt Auth-Eigenbau, Azure Key Vault
(`SecretsProvider`-Port), finAPI (`BankingProvider`-Port), DATEV + EN-16931 für FiBu/E-Rechnung.
