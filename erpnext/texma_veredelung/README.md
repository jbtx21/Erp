# texma_veredelung

Frappe-Custom-App für **TEXMA Textilveredelung** — die TEXMA-Differenzierer **neben**
ERPNext-Standard (kein Fork). Läuft auf einem Frappe-Bench (Frappe Cloud EU / Docker).

## Inhalt

- **DocTypes:** `Veredelungspreis` (kundenindividuelle Preise + Aufschlag EK→VK 1,88, T-08),
  `Stickerei Partner`, `Logo` (+ `Logo Version`) für das Stickerei-Routing.
- **Custom Fields** (Fixtures): `Customer.texma_shop_id` (T-01), `Customer.texma_mahnsperre`
  (T-14), `Item.texma_default_bom` (T-03), `Supplier.texma_ist_veredler`.
- **Hooks/API:** WooCommerce→Firmenkunde-Ingest (T-01) + Status-/Tracking-Push (T-09),
  DPD-Label (T-06), Stickerei-Routing (neues Logo vs. Wiederholer).

## Installation

```bash
bench get-app texma_veredelung <pfad-oder-git-url>
bench --site <site> install-app texma_veredelung
bench --site <site> migrate
```

Schritt-für-Schritt von 0 (deutsch, inkl. Frappe Cloud): siehe `docs/erpnext-anleitung.md`
im Haupt-Repo. Fachliche Grundlage: `docs/lastenheft.md`, `docs/erpnext-aufbau-plan.md`.

> Hinweis: Frappe/MariaDB laufen nicht in der CI des TypeScript-Haupt-Repos. Geprüft sind dort
> nur Python-Syntax und DocType-JSON; die fachliche Abnahme erfolgt gegen einen echten Bench.
