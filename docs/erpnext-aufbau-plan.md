# ERPNext-Aufbau-Plan für TEXMA (Option A: Adoptieren + dünne Custom-App)

> **Zweck:** Übergabereifer Adoptions-Blueprint für einen Frappe/ERPNext-Dienstleister.
> Beschreibt, wie TEXMAs Lastenheft (v3.4, 14 Abnahme-Testfälle) auf **ERPNext-Standard +
> eine schlanke Custom-App `texma_veredelung`** abgebildet wird — **ohne ERPNext zu forken**.
>
> **Grundsatz (Make-or-Buy entschieden):** ERPNext-Standard trägt ~70 % (Buchhaltung, Lager,
> Subcontracting, CRM, Einkauf), die Community wartet diesen Teil. TEXMAs Differenzierer
> (~30 %) liegen in **einer eigenen App neben** ERPNext, sodass Upgrades sauber bleiben.
>
> **Lizenz:** ERPNext ist GPLv3. Dieser Plan und die Custom-App sind **Eigenleistung**
> (keine ERPNext-Code-Übernahme). DocType-Strukturen aus ERPNext wurden nur als *Referenz*
> gelesen (siehe `docs/erpnext-tiefenabgleich.md`). Eine **Custom-App ist Frappe-Standardweg**
> und kann unter eigener Lizenz stehen.

---

## 1. Architekturprinzip

```
┌─────────────────────────────────────────────────────────────┐
│  Frappe Bench (EU-Hosting)                                    │
│                                                               │
│  ┌───────────────┐   ┌───────────────┐   ┌────────────────┐  │
│  │ frappe (core) │ + │ erpnext (std) │ + │ texma_         │  │
│  │               │   │               │   │ veredelung     │  │
│  │ DocType-Engine│   │ Selling/Buying│   │ (Custom-App)   │  │
│  │ Auth/RBAC/    │   │ Stock/Mfg/    │   │ • Veredelungs- │  │
│  │ Print/Workflow│   │ Subcontracting│   │   preis        │  │
│  │ REST/Webhooks │   │ Accounts/CRM  │   │ • Stickerei-   │  │
│  └───────────────┘   └───────────────┘   │   Partner+Logo │  │
│                                          │ • Hooks (1,88, │  │
│  + Regionale Apps:                       │   Woo-Mapping) │  │
│    erpnext_germany / xrechnung / banking └────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Nie tun:** ERPNext-Kern oder `erpnext`-App patchen. **Immer:** über `texma_veredelung`
erweitern — neue DocTypes, `doc_events`-Hooks, Custom Fields (als Fixtures), Server/Client
Scripts, Print Formats. So bleibt `bench update` gefahrlos.

---

## 2. Hosting & Compliance (EU/GoBD)

| Thema | Festlegung |
|---|---|
| Hosting | **Frappe Cloud (EU-Region)** *oder* Self-Host Docker (`frappe_docker`) auf EU-Server (Hetzner/IONOS) |
| DB | MariaDB (Frappe-Standard) |
| GoBD | ERPNext-Belege sind versioniert + unveränderlich nach Submit; **Verfahrensdokumentation** aus dem Greenfield-Repo (`docs/verfahrensdokumentation/`) übernehmen und auf ERPNext anpassen |
| Hauptbuch | ERPNext bringt volles GL mit — **G1 (Lastenheft): keine Vollbuchhaltung.** Lösung: GL minimal nutzen / Fibu via **DATEV-Export an Steuerberater** (s. T-07). Buchungskreis schlank halten |
| Backup | Frappe-Standard-Backups + EU-Objektspeicher; RPO 24 h / RTO 8 h (Kap. 27/K-23) |
| 2FA/RBAC | Frappe-Standard (TOTP, Rollen/Permission-Level) deckt Kap. 12/14 ab — inkl. „Produktion ohne Preis-/Kundenzugriff" über **Permission Level je Feld** |

---

## 3. Abbildung der 14 Abnahme-Testfälle

Legende: **Standard** = reine Konfiguration · **Config+** = Konfiguration + kleiner Server/Client
Script · **Custom** = Custom-App-DocType/Hook · **Regional** = zugekaufte regionale App.

| # | Anforderung | Einstufung | Mechanismus in ERPNext |
|---|---|---|---|
| **T-01** | WooCommerce-Bestellung → **Firmenkunde** (nicht Mitarbeiterkonto) | **Custom** | Woo-Webhook → `texma_veredelung.api.woocommerce.ingest_order`: mappt Shop auf **genau einen** `Customer` (Custom Field `texma_shop_id` am Customer). Liefer-/Mitarbeiteradresse als `Address`/`Contact`, **kein** neuer Customer. Abnahme: N Bestellungen ⇒ 0 neue Customer |
| **T-02** | Varianten Farbe×Größe | **Standard** | `Item.has_variants` + `Item Attribute` „Farbe"/„Größe" (mit `abbr` für SKU) + Variant-Items |
| **T-03** | Kundenspezifische Stückliste | **Config+** | `BOM` je Fertigartikel; Kunde→BOM-Vorlage über Custom Field `texma_default_bom` am Customer/Item; Auswahl beim Sales Order |
| **T-04** | Mehrstufige Fremdvergabe (Beistellung→Rücklauf, buchbar) | **Config+** | ERPNext **Subcontracting** (`Subcontracting Order`/`Receipt`). Mehrstufig = Kette aus 2 SCO (Siebdruck→Stick). **Beistellung = ganze Textilien** (keine RM-Stückliste, s. Tiefenabgleich §5.2) → schlanke BOM „1 Textil rein, 1 veredelt raus". Schwund = `received − returned` |
| **T-05** | Multi-Lieferant: Produktionsstart erst nach allen Wareneingängen | **Config+** | Mehrere `Purchase Order` je `Work Order`; Server Script (`Work Order` `before_submit`): blockt Start, bis alle zugeordneten `Purchase Receipt` da sind |
| **T-06** | DPD-Label + Tracking-Rückschreibung | **Custom** | `texma_veredelung.api.shipping`: `Delivery Note` `on_submit` → DPD-REST → `tracking_no` zurück; Tracking-Push an Shop (T-09) |
| **T-07** | DATEV-Export | **Regional** | `erpnext_germany` / DATEV-Export-App **oder** Custom-Export aus `GL Entry`/`Sales Invoice` (Format mit Steuerberater/ADDISON abstimmen, K-01) |
| **T-08** | Preisgruppen + Staffel + **Aufschlag 1,88** + kundenindiv. Veredelungspreis | **Custom** | `Price List` je Kundengruppe + `Pricing Rule` (`min_qty`/`max_qty`) für Staffel. **Veredelungs-VK** und **kundenindividuelle Preise (Preishoheit innen)** via Custom-DocType **`Veredelungspreis`** + Hook, der bei EK-Eingabe `VK = EK × 1,88` rechnet |
| **T-09** | Status-/Tracking-Push an Shop | **Custom** | `Sales Order`/`Delivery Note` `on_update_after_submit` → `texma_veredelung.api.woocommerce.push_status` (≥ „In Produktion/Versandbereit/Versendet" + Tracking) |
| **T-10** | Nachkalkulation Soll-Ist (DB) | **Config+** | Plan-DB aus `Quotation`; Ist aus `Stock Ledger` (Material) + `Timesheet`/`Job Card` (Lohn) + Subcontracting-Service-Kosten; Custom **Query Report** „Nachkalkulation" |
| **T-11** | Produktionszettel-PDF | **Standard** | `Print Format` (Print Designer) auf `Work Order`/`Job Card` |
| **T-12** | Mindestbestand-Reorder | **Standard** | `Item.reorder_levels` → automatische `Material Request`; Bestellvorschlag |
| **T-13** | Banking-Abgleich (Kontoauszug → OP) | **Regional/Custom** | `Bank Reconciliation` + Import (MT940/CAMT.053 via Banking-App) **oder** FinTS-Import-Custom; Matching `reference`→`Sales Invoice` |
| **T-14** | Mahnwesen (Eskalation, Mahnsperre, Skonto) | **Config+** | `Payment Terms` + `Dunning`-DocType (ERPNext-Standard) + Custom Field `texma_mahnsperre` am Customer; Eskalationsstufen über Dunning Types |

**Eigenständige TEXMA-Differenzierer (kein ERPNext-Pendant):**

| Anforderung | Einstufung | Lösung |
|---|---|---|
| Stickerei-Partner-Routing (Ausschreibung vs. Wiederholer) | **Custom** | DocType **`Stickerei Partner`** + **`Logo`** (mit Versionen); Hook routet neues Logo → Ausschreibung an Partner, Wiederholer → Direkt-`Subcontracting Order` |
| Logo-/Versionsverwaltung | **Custom** | DocType **`Logo`** + Child **`Logo Version`** (Stichzahl, Datei, aktive Version) |
| Termin-Ampel (Kap. 35.4) | **Config+** | `Dashboard`/Query Report über `delivery_date`/`expected_delivery_date`; Ampel = Restlaufzeit |

---

## 4. Custom-App `texma_veredelung` — Lieferumfang

Skelett liegt unter `erpnext/texma_veredelung/` (dieses Repo). Enthält:

- **DocTypes** (`*/doctype/*`): `Veredelungspreis`, `Stickerei Partner`, `Logo`, `Logo Version`.
- **Custom Fields** (als Fixtures, `hooks.py`): `Customer.texma_shop_id`, `Customer.texma_mahnsperre`,
  `Item.texma_default_bom`, `Supplier.texma_ist_veredler`.
- **Hooks** (`hooks.py` `doc_events`): EK→VK-Aufschlag 1,88, Woo-Status-Push, Stickerei-Routing.
- **API-Endpunkte** (`api/`): `woocommerce.ingest_order` (T-01), `woocommerce.push_status` (T-09),
  `pricing.resolve_finishing_price` (T-08), `shipping.create_dpd_label` (T-06).

> Das Skelett ist **lauffähige Struktur, keine fertige Logik** — es zeigt einem Frappe-Dienstleister
> exakt, *wo* welche TEXMA-Regel sitzt. Installiert wird es auf einem Bench
> (`bench get-app ./texma_veredelung && bench --site <site> install-app texma_veredelung`),
> **nicht** in der CI dieses TS-Repos (Python/Frappe).

---

## 5. Was die Greenfield-Arbeit beiträgt (nicht verschwendet)

Das bestehende TS-Repo wird zur **Spezifikation + Abnahme-Suite** für den ERPNext-Bau:

- **Domänenmodell** (`packages/shared/*`): jede Regel (Pricing 1,88, Varianten-Validierung, BOM-Expansion,
  DATEV-Sätze, XRechnung, Banking-Match, Dunning-Eskalation) ist eine **getestete Referenzimplementierung** —
  der Frappe-Dienstleister muss nur dasselbe Verhalten in ERPNext herstellen.
- **14 Testfälle** als **Akzeptanzkriterien**: gegen die fertige ERPNext-Installation nachstellen.
- `docs/lastenheft.md` (v3.4) + `docs/erpnext-tiefenabgleich.md` als fachliche Wahrheit.

---

## 6. Grober Aufwand (Indikation, Dienstleister bestätigt)

| Block | Inhalt | Größenordnung |
|---|---|---|
| Setup | Bench/Hosting EU, Sites, Backup, RBAC, Druckvorlagen | klein |
| Standard-Config | Items/Attribute, Price Lists/Pricing Rules, BOM, Subcontracting, Reorder, Dunning | mittel |
| Custom-App | 4 DocTypes + Hooks (1,88, Routing) + 4 API-Endpunkte | mittel |
| Integrationen | Woo (T-01/T-09), DPD (T-06), DATEV (T-07), Banking (T-13) | **groß** (Integrationen sind überall der Brocken) |
| Migration | Kunden 100 %, Artikel ≥ 98 %, offene Posten (Kap. 26) | mittel |
| Abnahme | 14 Testfälle gegen Live-System | mittel |

---

## 7. Offene Punkte für den Dienstleister-Workshop

1. **DATEV/ADDISON-Format** mit Steuerberater final klären (K-01, vertraglich extern).
2. **Banking:** FinTS vs. CAMT-Import — welche Bank/Schnittstelle (T-13).
3. **GL-Tiefe:** Wie schlank darf ERPNexts Hauptbuch konfiguriert werden, ohne G1 zu verletzen?
4. **Woo-Connector:** bestehende Marktplatz-App vs. eigener Webhook-Endpunkt (T-01 ist Abnahmetest #1).
5. **Attribut-Stammdaten:** kontrolliertes Farb-/Größen-Vokabular (Tiefenabgleich §5.1, härtet T-02).

---

**Nächster Schritt:** Skelett unter `erpnext/texma_veredelung/` auf einem Frappe-Bench installieren,
Standard-Config gegen Abschnitt 3 aufsetzen, dann Integrationen (Block „groß") priorisieren.
