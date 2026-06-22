# ERPNext-Seite des TEXMA-ERP

Dieser Ordner enthält die **Frappe-Custom-App `texma_veredelung`** — TEXMAs Differenzierer
*neben* ERPNext-Standard, **ohne ERPNext zu forken**. Sie läuft auf einem Frappe-Bench
(Frappe Cloud EU oder Self-Host Docker), **nicht** in der CI dieses TypeScript-Repos.

Hintergrund & Abbildung der 14 Abnahme-Testfälle: `../docs/erpnext-aufbau-plan.md`.
Strukturreferenz (warum was so): `../docs/erpnext-tiefenabgleich.md`.

## Was die App liefert

- **DocTypes:** `Veredelungspreis` (kundenindividuelle Veredelungspreise, Preishoheit innen,
  T-08), `Stickerei Partner` + `Logo` (+ `Logo Version`) für das Stickerei-Routing.
- **Custom Fields** (Fixtures): `Customer.texma_shop_id` (T-01), `Customer.texma_mahnsperre`
  (T-14), `Item.texma_default_bom` (T-03), `Supplier.texma_ist_veredler`.
- **Hooks/Logik:** EK→VK-Aufschlag **1,88** (T-08), WooCommerce→**Firmenkunde**-Ingest (T-01),
  Status/Tracking-Push an den Shop (T-09), Stickerei-Routing neues Logo vs. Wiederholer.

## Installation (auf einem Bench)

```bash
# 1) App aus diesem Ordner holen
bench get-app texma_veredelung /pfad/zu/diesem/repo/erpnext/texma_veredelung
# 2) Auf der Site installieren (ERPNext muss bereits installiert sein)
bench --site texma.local install-app texma_veredelung
# 3) Custom Fields (Fixtures) einspielen
bench --site texma.local migrate
```

Auf **Frappe Cloud** stattdessen: App als privates GitHub-Repo hinterlegen und der Bench-Group
hinzufügen, dann auf der Site installieren.

## Hinweis zur Verifikation

Frappe/MariaDB laufen nicht in der Entwicklungsumgebung dieses Repos. Geprüft sind hier nur
**Python-Syntax** und **DocType-JSON-Gültigkeit**. Fachliche Abnahme erfolgt gegen einen
echten Bench (z. B. kostenlose Frappe-Cloud-Testumgebung) anhand der 14 Testfälle.
