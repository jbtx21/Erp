# Xentral-/OpenXE-Orientierung

> **Verbindlich vorgelagert:** `docs/make-or-buy-leitplanken.md` — Teil-Make (Differenzierer
> selbst bauen, Standard-Block Buy/Integrate), Auth/Identity nicht selbst bauen, Bus-Faktor
> als Bauziel. Diese Leitplanken haben Vorrang vor der Reihenfolge weiter unten.

## Entscheidung

Der TEXMA-ERP ist **Teil-Make** (Lastenheft Kap. 24.1; `docs/make-or-buy-leitplanken.md`):
die vier Differenzierer (Stickerei-Partnerlogik, mehrstufige Fremdvergabe, Nachkalkulation,
Termin/Ampel) werden **selbst in TypeScript gebaut**, der regulierte Standard-Block wird
**eingekauft/integriert** (Identität, Secrets, Banking, FiBu/Mahnwesen, E-Rechnung; ADR 0002).
Xentral und der quelloffene Xentral-Fork **OpenXE** dienen dabei als **fachliche Referenz** —
für Domänenabdeckung, Terminologie, Datenmodell und die deutschen Compliance-Logiken
(Fibu, DATEV, E-Rechnung, GoBD), maßgeblich für den selbst gebauten Anteil. Für den
eingekauften Standard-Block ist die Referenz nur Vollständigkeits-Check, kein Bauauftrag.

### Lizenz-Disziplin (wichtig)

OpenXE steht unter Copyleft (EGPL/AGPL-Familie). Unser SaaS-Betrieb würde durch
Code-Übernahme „infiziert". Deshalb gilt strikt:

> **Muster statt Code.** Wir lesen OpenXE/Xentral, um *Konzepte, Feldlisten, Tabellen-
> beziehungen und Algorithmen* zu verstehen, und implementieren diese in TypeScript neu.
> Es wird **kein** OpenXE-Quellcode kopiert, übersetzt oder eingebunden.

Der Kern von Xentral selbst ist proprietär (PHP/Laravel) — er kann ohnehin nicht
wiederverwendet werden. OpenXE (`github.com/OpenXE-org/OpenXE`, PHP/JS, ~1.700 Commits,
Release v1.12/2024) ist die einzige lesbare Referenz mit echter Geschäftslogik.

## Resource-Taxonomie (HTTP-Layer)

Wir orientieren unsere externe REST-API an Xentrals öffentlicher API-Spec
(`github.com/xentral/api-spec-public`, `/api/v1/...`, kebab-case):

| TEXMA-Entity (Prisma) | Xentral-Resource | Status bei uns |
|---|---|---|
| `Company` + `Contact` + `DeliveryAddress` | `customer` / `contact` / `customer-address` | ✅ vorhanden (T-01-konform) |
| `Article` + `Variant` + `VariantAttribute` | `product` (Varianten) | ✅ vorhanden (T-02) |
| `Quote` / `QuoteLine` | (Angebot) | ✅ vorhanden |
| `Order` / `OrderLine` | `sales-order` | ✅ vorhanden |
| `Invoice` | `invoice` | ✅ Modell + Faktura-Logik |
| `Supplier` / `SupplierItem` | `supplier` | ✅ vorhanden |
| `ProductionOrder` / `SubProductionOrder` | (kein Xentral-Pendant — TEXMA-Custom) | ✅ vorhanden (T-04) |
| — Gutschrift | `credit-note` | ⬜ **Gap** — nachziehen |
| — Lieferschein | `delivery-note` | ⬜ **Gap** — nachziehen |
| — Wareneingang | `goods-receipt` | ⬜ **Gap** (Multi-Lieferant T-05 braucht es) |
| — Lager/Bestand | `inventory` / `warehouse` | ⬜ **Gap** (Mindestbestand T-12) |
| `Payment` / `OpenItem` | `payment-transaction` | ✅ Modell vorhanden |

## OpenXE-Referenzanker (zum Nachschlagen, nicht kopieren)

| Thema | Wo in OpenXE nachsehen | TEXMA-Pendant |
|---|---|---|
| Datenmodell (alle Tabellen + Felder) | `database/struktur.sql` | `packages/db/prisma/schema.prisma` |
| Beispieldaten / Wertebereiche | `database/beispiel.sql` | Seed (`packages/db`) |
| Modul-Geschäftslogik | `classes/Modules/*` | `packages/shared/*`, `apps/api/src/modules/*` |
| Versand-/Carrier-Anbindung (DPD, T-06) | `classes/Carrier/*` | `services/workers/connectors/dpd` (geplant) |
| Kern-Framework / Utilities | `classes/Core/*` | `packages/shared` |

**Konkrete Aufgaben aus der Referenz:**
1. `struktur.sql` gegen unser Prisma-Schema prüfen → fehlende Felder/Tabellen für
   Gutschrift, Lieferschein, Wareneingang, Lager identifizieren und in TS neu modellieren.
2. OpenXEs DATEV-/ZUGFeRD-Felder als Vollständigkeits-Check gegen
   `packages/shared/src/datev.ts` und `einvoice.ts` halten.
3. Xentral-Spec als Soll für die REST-Endpunkt-Benennung des kommenden HTTP-Layers.

## Was wir NICHT übernehmen

- Den PHP-Stack, das Alt-Xentral-Frontend, die Templating-/Framework-Konventionen.
- GoBD-/Audit-Implementierung: unser WORM-/Append-only-Ansatz (`packages/audit`) ist
  bewusst strenger als die Referenz.
