# TEXMA ERP

Greenfield-ERP für die TEXMA Textilveredelung — Ablösung von CDH Office.
TypeScript, modularer Monolith + separate Connector-Schicht, Cloud/SaaS (EU).

Vollständige fachliche Grundlage: [`docs/lastenheft.md`](docs/lastenheft.md) (v2.4, 36 Kapitel).
Architektur & Roadmap: siehe Planfile (Kontext, Phasen 0–3, Testfälle T-01…T-14).

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

CI (`.github/workflows/ci.yml`): install → prisma generate/validate → typecheck → test.
Der Merge-Gate-Plan koppelt die Testfälle T-01…T-14 an die CI (Kap. 15).

## Status

Phase 0 (Fundament) steht: Monorepo, validiertes Kerndatenmodell, GoBD-Audit, Preislogik,
WooCommerce-Mapping inkl. T-01-Abnahme. Nächste Schritte gemäß Roadmap Phase 1:
HTTP-/NestJS-Layer + RBAC/2FA, WooCommerce-Connector-Worker (Import <2 min), Prisma-Repository,
Faktura/E-Rechnung, DATEV-Export, Lieferanten ID Identity + Stanley/Stella.
