# TEXMA ERP

ERP für die TEXMA Textilveredelung — Ablösung von CDH Office. **Teil-Make** (Lastenheft Kap. 24.1):
gekaufter/integrierter Standard-Block, Eigenbau nur an den vier Differenzierern.
TypeScript, modularer Monolith + separate Connector-Schicht, Cloud/SaaS (EU).

Vollständige fachliche Grundlage: [`docs/lastenheft.md`](docs/lastenheft.md) (v3.2, 39 Kapitel).
Strategie & Architektur (**Teil-Make**): [`docs/make-or-buy-leitplanken.md`](docs/make-or-buy-leitplanken.md)
und die ADRs unter [`docs/adr/`](docs/adr/) (0001 Auth/OIDC, 0002 Buy-Stack: Entra ID · Key Vault · finAPI · DATEV).

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

Phase 0 (Fundament) steht: Monorepo, validiertes Kerndatenmodell, GoBD-Audit, Preislogik,
WooCommerce-Mapping inkl. T-01-Abnahme. Nächste Schritte (Teil-Make, Leitplanke 1 — Fokus auf
die Differenzierer): `subproduction`/`stickerei`/`ampel`/`postcalc` als demo-fähiger Durchstich
an Endpunkte/UI. Standard-Block per Buy/Integrate: Entra ID (OIDC-Verifier vorhanden) statt
Auth-Eigenbau, Azure Key Vault (`SecretsProvider`-Port), finAPI (`BankingProvider`-Port),
DATEV + EN-16931 für FiBu/E-Rechnung.
