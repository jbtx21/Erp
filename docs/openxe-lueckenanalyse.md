# Feature-Gap-Analyse: OpenXE vs. TEXMA ERP

*Stand: 2026-06-24 · Vergleich des Open-Source-ERP **OpenXE** (Nachfolger der Xentral-19.1-Codebasis) mit dem hauseigenen **TEXMA ERP** (TypeScript, modularer Monolith, Ablösung CDH Office).*

## Methodik & Unsicherheiten

- **OpenXE-Scope** aus GitHub-README + Modulverzeichnis `www/pages/` (ca. 80+ Module sichtbar), openxe.org/maexware sowie allgemeinem Xentral-Wissen abgeleitet. Einzelne Modul-*Tiefen* wurden nicht im Quellcode verifiziert — wo Unsicherheit besteht, ist sie markiert.
- **TEXMA-Scope** aus der Navigationsdefinition (`apps/web/src/App.tsx`, `NAV`-Array), `apps/web/src/pages.tsx` und dem tRPC-Hauptrouter `apps/api/src/trpc/router.ts` (ca. 75 Router/Sub-Router) abgeleitet — faktenbasiert auf dem Repo.
- TEXMA ist klar ein **branchenspezifisches Textil-/Stickerei-/Veredelungs-ERP** (Routen INTERN/EXTERN, Logos & Stickerei, Stickerei-Ausschreibungen, Transferdrucke, Aufschlagsfaktoren). OpenXE ist ein **generisches E-Commerce-/Handels-ERP**. Daraus folgen die Stärken/Lücken.

---

## 1. Abgleichtabelle

| Modul / Domäne | OpenXE | TEXMA ERP | Kurzkommentar |
|---|---|---|---|
| Artikel/Warenwirtschaft | ✅ (artikel, matrixprodukt, artikelgruppen, einheiten) | ✅ (`products`, Varianten, Matrix Farbe/Größe, Material/Pflege/Zolltarif) | TEXMA textilspezifisch stark; OpenXE generischer breiter |
| Angebote | ✅ (angebot) | ✅ (`quotes`, Bestellart SALES/MAINTENANCE/Warenkorb, Lead/Kunde) | Gleichwertig |
| Auftragsabwicklung | ✅ (auftrag) | ✅ (`shopOrders`/`orders`, `sales`, Routen-Workflow) | TEXMA hat Veredelungs-Routen; OpenXE breitere Standardabwicklung |
| Einkauf/Bestellung | ✅ (bestellung, bestellvorschlag) | ✅ (`procurement`, `suppliers`, `reorder`) | Gleichwertig; OpenXE mit autom. Bestellvorschlag |
| Lager / Multi-Lager | ✅ (Multi-Lager, Lagerplätze, Kommissionierung) | ⚠️ teilweise (`stock`/`lager`, Lagerorte HAUPT/MUSTER/SHOWROOM/TRANSFERDRUCK, Inventur, Wareneingang) | Mehrere benannte Lagerorte; **echte Multi-Lager-Bestandslogik / Pick** unklar |
| Versand / Versanddienstleister | ✅ **Signatur** (DHL, DPD, GLS, Hermes, Sendcloud, Label, Tracking) | ⚠️ teilweise (`shipments`, `deliveries`, DPD konfigurierbar) | **Große Lücke:** breites Carrier-Portfolio vs. nur DPD-Stub |
| Fakturierung / Rechnungen | ✅ (rechnung, gutschrift, belegevorlagen) | ✅ (`invoices`, `archive` GoBD, Beleg-PDF, `print`) | Gleichwertig |
| Mahnwesen | ✅ (mahnwesen) | ✅ (`dunning`, OP-Aging-Buckets) | Gleichwertig |
| Zahlungsabgleich / Banking | ✅ **Signatur** (kontoauszuege, autom. Zuordnung Zahlung↔Rechnung) | ⚠️ teilweise (`banking`, `payments`, `zahlungen`) | **Lücke:** automatischer **Match-Algorithmus** bei OpenXE reifer |
| DATEV / Fibu-Export | ✅ (exportbuchhaltung, fibu_buchungen) | ⚠️ teilweise (`dataIo`, `financeReport`, `guv`, Kostenstellen) | **Lücke:** dedizierter **DATEV-Buchungsstapel** fehlt |
| CRM | ✅ (adresse, Korrespondenz, Aufgaben) | ✅ + stark (`leads`, `opportunities`, `callLogs`, `inquiries`, `contacts`, `companies`, HubSpot) | TEXMA **stärker** |
| POS / Kasse | ✅ (Kasse/POS) | ❌ fehlt | Für B2B vermutlich irrelevant |
| Produktion / Stückliste | ✅ (produktion, BOM) | ✅ + branchenspezifisch (`production`, `subproduction` Fremdvergabe, `productionSheet`, Veredelungsrouten) | TEXMA **stärker** für Veredelung |
| Shopanbindung (Shopify/Woo/Amazon/eBay) | ✅ **Signatur** (Shopify, Shopware, Magento2, WooCommerce, PrestaShop, Gambio, eBay, Amazon) | ⚠️ teilweise (nur **WooCommerce**-Import) | **Große Lücke:** viele Kanäle + bidirektional vs. Woo-1-Weg |
| Workflow-Engine / Automatisierung | ✅ **Signatur** (prozessstarter, no-code) | ⚠️ teilweise (`automation` Trigger/Conditions/Actions, `workflow`-State-Machine) | **Basis vorhanden** — Aktionskatalog noch schmal |
| Reporting / BI | ✅ (berichte, managementboard) | ✅ (`reporting`, `dashboards`, `financeReport`, Charts) | Gleichwertig |
| Dokumente / Belege | ✅ (dateien, docscan, layoutvorlagen) | ✅ (`print`, `archive` GoBD, E-Mail-Vorlagen) | Gleichwertig |
| Benutzer / Rechte (RBAC) | ✅ (benutzer, gruppen, Rechte) | ✅ + fein (`auth`, Rollen, `redactOrderForRole`, 2FA, `auditLog`) | TEXMA gleichwertig/stärker |
| API | ✅ (api, Webhooks) | ✅ intern (tRPC); externe REST/Webhook unklar | OpenXE mit externer API; TEXMA evtl. Lücke extern |
| Kalender / Termine | ✅ (kalender) | ✅ (`calendar`, `scheduling`, `tasks`, CalDAV) | Gleichwertig |
| Newsletter / Marketing | ✅ | ✅ (`newsletter`, Brevo) | Gleichwertig |
| HR / Personal | ⚠️ rudimentär | ✅ (`hr`, Urlaubsanträge) | TEXMA leicht voraus |
| Reklamation / RMA | ✅ (Gutschrift/Retoure) | ✅ (`reklamation`, `threeWayMatch`) | Gleichwertig |
| EU-Lieferschwelle / OSS | ✅ (lieferschwelle) | ❌ fehlt | Nische |

---

## 2. Priorisierte Lücken

> Bewertung: **Nutzen** (Geschäftswert) · **Aufwand** S/M/L · **Fit** zum Textil-/Stickerei-Geschäft.

1. **Versanddienstleister-Integration (Carrier + Label + Tracking)** — DHL/DPD/GLS/Hermes/Sendcloud, Label-Druck, Tracking-Nummer-Rückführung.
   *Nutzen: sehr hoch · Aufwand: M–L · Fit: sehr hoch* — jedes veredelte Paket geht physisch raus; aktuell nur DPD-Stub.

2. **Shop-/Kunden-Status-/Tracking-Rückmeldung & Workflow-Automatisierung** — Auftragsstatus + Tracking automatisch zurückspielen, getriggert durch Workflow-Events; auch für ERP-/Beratungsaufträge ohne Shop (direkte Kunden-Mail).
   *Nutzen: hoch · Aufwand: S–M · Fit: hoch* — Basis (`automation`-Engine + Outbox + Woo-Import) ist **bereits vorhanden**; es fehlt der shop-übergreifende Rückkanal + die Kunden-Mail.

3. **Automatischer Zahlungsabgleich (Bank → Offene Posten)** — Match per Betrag/Verwendungszweck/Rechnungsnummer, Teilzahlungen, Skonto.
   *Nutzen: hoch · Aufwand: M · Fit: mittel* — Gerüst existiert, der reife Auto-Match fehlt.

4. **DATEV-/Fibu-Buchungsstapel-Export** — Belege als DATEV-konformen Buchungsstapel.
   *Nutzen: hoch · Aufwand: M · Fit: hoch* — GoBD/Archiv da; der Export ist die letzte Meile zum Steuerberater.

5. **Weitere Shop-/Marktplatz-Kanäle** — Shopify/Shopware/Amazon/eBay zusätzlich zu Woo, ideal bidirektional.
   *Nutzen: mittel–hoch · Aufwand: L · Fit: mittel* — nur sinnvoll bei Multi-Channel-Strategie; braucht Connector-Abstraktion.

6. **Echte Multi-Lager-Bestandslogik + Kommissionierung** — bestandsführende Lagerplätze, Picklisten.
   *Nutzen: mittel · Aufwand: M · Fit: mittel* — erst bei Lagerwachstum kritisch.

7. **Öffentliche externe API / Webhooks** — *Nutzen: mittel · Aufwand: M · Fit: niedrig–mittel.*

8. **EU-Lieferschwellen / OSS-Umsatzsteuer** — *Nutzen: niedrig–mittel · Aufwand: S–M · Fit: niedrig.*

*Nicht empfohlen:* POS/Kasse (kein B2C-Ladengeschäft), dediziertes DSGVO-Modul (durch Audit-Log/Archiv teilabgedeckt).

---

## 3. Top-5-Empfehlungen (nächste Bauschritte)

1. **Shop-/Kunden-Status-/Tracking-Rückmeldung als Workflow-Automatisierung** ⭐ *(unmittelbar geplant — höchste Priorität)*
   Bausteine existieren: `automation`-Engine, Outbox-Pattern (`order.status.update`), Woo-Rückkanal. Es fehlt (a) eine shop-übergreifende Writer-Auswahl, (b) Kunden-Mail für Aufträge **ohne** Shop (ERP/Beratung), (c) Storno/Retoure-Rückmeldung, (d) Carrier→Tracking-Link-Mapping, (e) Update-Strategie-Konfig. Kleinster Aufwand, vorhandene Basis, schließt den Auftragslebenszyklus.

2. **Versanddienstleister-Integration ausbauen (DPD vollständig + DHL)** — direkte Voraussetzung für echte Tracking-Nummern aus Schritt 1.

3. **Automatischer Zahlungsabgleich (Bank → OP)** — größter Buchhaltungs-Zeitgewinn auf vorhandenem Gerüst.

4. **DATEV-Buchungsstapel-Export** — Standard-Pflichtschnittstelle zum Steuerberater.

5. **Connector-Abstraktion für Shop-/Marktplatz-Kanäle** — macht künftige Kanäle + bidirektionalen Sync sauber erweiterbar.

---

### Quellen (OpenXE-Recherche)
- OpenXE GitHub Repository (README + `www/pages/`-Modulverzeichnis): https://github.com/OpenXE-org/OpenXE
- OpenXE ERP – maexware solutions
- OpenXE Community Forum: https://openxe.org/community/

**Verifikationshinweis:** Die TEXMA-Seite ist direkt aus dem Repo belegt (`apps/web/src/App.tsx`, `apps/web/src/pages.tsx`, `apps/api/src/trpc/router.ts`). Bei OpenXE ist der Modul-*Umfang* verifiziert; einzelne *Funktionstiefen* beruhen auf Modulnamen + Xentral-Allgemeinwissen und sind als „Signatur"/unsicher markiert.

**Kurzfazit:** TEXMA ist im branchenspezifischen Kern (Veredelung, Stickerei, CRM-Pipeline, RBAC, Produktion) **stärker** als das generische OpenXE. Die echten Lücken sind klassische Xentral-Signaturstärken im operativen Backend: **Versand-Carrier, automatischer Zahlungsabgleich, DATEV-Export, Multi-Channel-Shop-Sync**. Das geplante Feature „Shop-/Kunden-Status/Tracking-Rückmeldung via Workflow-Automatisierung" ist sehr gut gewählt.
