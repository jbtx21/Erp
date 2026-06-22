# ERPNext-Funktionskatalog ↔ TEXMA-Greenfield — Gap-Analyse

> **Zweck:** Den vollständigen ERPNext-Modulkatalog (aus der Demo-Begehung) als **Checkliste**
> gegen unseren Eigenbau halten — was haben wir, was teilweise, was bewusst *nicht*.
> So wird ERPNexts Breite zur **Feature-Vorlage**, ohne dass wir global-generische oder
> länderspezifische Ballast-Features nachbauen, die TEXMA nicht braucht.
>
> **Leitplanke:** TEXMA ist ein **fokussiertes Textilveredelungs-ERP**, kein globales Allzweck-ERP.
> „Fehlt" heißt nicht automatisch „Lücke" — vieles ist *bewusst out of scope* (G1: kein Hauptbuch;
> HR/Payroll laut Lastenheft extern; indische Steuer-/Anteilseigner-Themen irrelevant).
>
> Status: **✓** vorhanden · **◐** teilweise · **○** geplant (Backlog) · **✗** bewusst out of scope.

---

## Querschnitt — „Einheitliches Dokumentenmodell"
ERPNexts stärkste Architekturidee: jeder Geschäftsobjekttyp („DocType") bekommt Liste/Filter,
Formular, Statusworkflow, Audit-Trail, Folgedokumente und Druck **generisch**.

| ERPNext | TEXMA-Greenfield | Status |
|---|---|---|
| Generische Liste (Filter/Sort/Bulk) | `AutoTable`/`ListPage` (datengetrieben) im Web | ◐ pro Modul, nicht voll generisch |
| Statusworkflow je Objekt | `packages/shared/src/statemachine.ts` (Order/Quote/SubProduction-F2) | ✓ |
| Audit-Trail (wer/wann, alt→neu) | `packages/audit` (Append-only, WORM, `ImmutableViolationError`) | ✓ |
| Folgedokumente („Create next") | Belegkette Angebot→Auftrag→PA→Lieferung→Faktura verdrahtet | ✓ |
| Druck/PDF | `production-sheet-pdf`, `report-pdf` | ◐ (gezielt, nicht jeder DocType) |
| Nummernkreise | `numbering.ts` + `NumberingService` | ✓ |
| **Generische DocType-Engine** | **nicht vorhanden** — Module sind explizit gebaut | ○ strategische Option |

> **Strategische Entscheidung:** Eine generische DocType-Engine zu bauen, gäbe „Liste/Form/Status/
> Audit/Druck für jeden neuen Typ kostenlos" — aber hohe Vorabkosten. Bei einem fokussierten ERP
> mit überschaubarer Objektzahl ist der explizite Weg vertretbar; bei breiter Expansion neu bewerten.

---

## Accounting (Buchhaltung)
| ERPNext | TEXMA | Status |
|---|---|---|
| Doppelte Buchführung, Hauptbuch, Kontenplan | — | **✗ G1: kein Hauptbuch** (operativ + **DATEV-Export** an StB) |
| Ausgangs-/Eingangsrechnung | `invoice.ts`, `Invoice`, `incoming-invoice` | ✓ |
| E-Rechnung (XRechnung/ZUGFeRD) | `einvoice.ts` (CII/Factur-X) + `einvoice-inbound.ts` (EN16931) | ✓ (über ERPNext-Standard hinaus) |
| Zahlungseingang/-ausgang, offene Posten | `Payment`, `OpenItem`, Banking-Match | ✓ |
| Bankabstimmung | `banking-match.ts`, `camt053.ts` (CAMT.053), `pain001.ts` | ✓ (T-13) |
| DATEV/Steuerberater-Schnittstelle | `datev.ts` (EXTF) — s. `erpnext-aufbau-plan.md` Anhang A | ✓ |
| Steuervorlagen (USt) | in Rechnung/E-Rechnung abgebildet | ◐ schlank |
| Kostenstellen + Budgetierung | `cost-center` (B7) — Auswertung, **keine** Budget-Buchung | ◐ |
| Mehrwährung, Quellensteuer, Abo, Anteilseigner | — | ✗ irrelevant für TEXMA |
| Mahnwesen | `dunning.ts` (T-14, Stufen) — Gebühr/Text als Backlog B10 | ◐ |

## Selling (Vertrieb)
| ERPNext | TEXMA | Status |
|---|---|---|
| Angebot→Auftrag→Lieferung→Rechnung | `quote`, `order-workflow`, `shipment`, `invoice` | ✓ |
| Preislisten/Preisregeln/Staffel | `pricing.ts` + **B4 Mengenstaffel** (gerade gebaut), `markup.ts` (1,88) | ✓ (T-08/T-15) |
| Kunden/Gruppen/Kontakte/Adressen | `Company`, `Contact`, `PriceGroup`, `DeliveryAddress` | ✓ |
| Liefertermin/Terminierung | **B9** (gerade gebaut): zugesagter Termin + Rückwärtsterminierung | ✓ |
| Point of Sale | `pos.ts` (**B6**, TSE/KassenSichV-bewusst) | ◐ Logik da, TSE-Connector offen |
| Reklamation/Gutschrift | `reklamation.ts`, `CreditNote` (B11) | ✓ |
| Vertriebsanalytik (Trends, Ziele) | `reporting.ts`, `finance-report`, KI-Report | ◐ Kern da |
| Gutscheine/Promotion/Treuepunkte | — | ✗ nicht im Lastenheft |

## Buying (Einkauf)
| ERPNext | TEXMA | Status |
|---|---|---|
| Materialanforderung→RFQ→Bestellung→Wareneingang→ER | `procurement`, `reorder`, `incoming-invoice` | ✓ |
| Multi-Lieferant, Bestellgate | `procurement` + Wareneingangs-Gate (T-05) | ✓ |
| 3-Way-Match (Bestellung/WE/Rechnung) | `three-way-match.ts` | ✓ |
| Lohnfertigung/Subcontracting | `subproduction.ts` (T-04, mehrstufig, Beistellung/Rücklauf) | ✓ |
| Lieferantenkatalog-Import | `supplier-catalog.ts`, `supplier-import` (C3) | ✓ |
| Lieferantenangebotsvergleich | — | ○ Backlog (klein) |

## Stock (Lager)
| ERPNext | TEXMA | Status |
|---|---|---|
| Artikel/Varianten/Attribute | `pim.ts`, `variants.ts`, `Variant`/`VariantAttribute` (Farbe×Größe, T-02) | ✓ |
| Lagerbuch/Bewegungs-Ledger | `stock.ts`, `StockMove`, `StockLevel` (F4) | ✓ |
| Mindestbestand/Reorder | `reorder.ts` (T-12) | ✓ |
| Lieferschein/Wareneingang/Pick | `shipment`, Wareneingang | ◐ (Pick-List nicht separat) |
| **Multi-Warehouse** | einstufig (kein Warehouse-Modell) | ○ Backlog, falls mehrere Lagerorte |
| **Serien-/Chargennummern, Ablauf** | — | ○ Backlog, falls für Textil/Transfer nötig |
| Qualitätsprüfung | — | ✗/○ (s. Quality) |

## Manufacturing (Produktion)
| ERPNext | TEXMA | Status |
|---|---|---|
| Mehrstufige Stückliste (BOM) | `bom.ts`, `BomItem` (kundenspez. BOM, T-03) | ✓ |
| Produktionsauftrag (Work Order) | `ProductionOrder` (1 Auftrag = 1 PA, Kap. 5.2) | ✓ |
| Produktionszettel | `production-sheet.ts` (T-11, DTF/Flex/Flock-Vorlagen) | ✓ |
| Produktions-Reporting/Metriken | `production-reporting`, `production-metrics.ts` | ✓ |
| Job Cards / Workstations / Routing / Downtime | — | ✗ zu fertigungstief für TEXMAs Modell |
| Nachkalkulation Soll/Ist | `postcalc.ts` (T-10, DB) | ✓ |

## CRM
| ERPNext | TEXMA | Status |
|---|---|---|
| Lead→Opportunity→Kunde | `lead.ts`, `inquiry.ts`, `Company` | ✓ (Lead/Anfrage-Funnel) |
| Kampagnen/Quellen/Gebiete | teilweise (Lead-Quelle) | ◐ |
| Pipeline-Analytik | `reporting` | ◐ |
| Wartungsbesuche/Garantie | — | ✗ nicht im Lastenheft |

## Bewusst NICHT nachgebaut (out of scope für TEXMA)
| ERPNext-Modul | Begründung |
|---|---|
| **HR** (Mitarbeiter, Anwesenheit, Urlaub, Recruitment) | Laut Lastenheft extern; nicht Kern des Veredelungsgeschäfts |
| **Payroll** (Gehalt, Steuerstufen) | Lohnabrechnung beim Steuerberater/extern |
| **Assets** (Anlagenbuchhaltung/Abschreibung) | gehört zum Hauptbuch (G1) → beim StB |
| **Projects/Timesheets** | TEXMA ist auftrags-, nicht projektgetrieben (Zeit via `postcalc`) |
| **Quality** (eigenes QM-System) | QM-Prüfungen ggf. leichtgewichtig in Produktion, kein Modul |
| **Support/Helpdesk** | Kundenkommunikation über Portal (B13) + E-Mail, kein Ticketsystem |
| Subscription, Shareholder, Mehrwährung, ind. Steuer | für TEXMAs Geschäft/Region irrelevant |

---

## Was TEXMA zusätzlich hat (kein ERPNext-Standard)
- **Veredelungs-Differenzierer:** `stickerei.ts` (Partner-Routing), `finishing.ts`, `markup.ts` (Aufschlag 1,88), Logo-/Versionslogik.
- **Shop-Anbindung:** `woocommerce.ts`/`shop-sync.ts` + Firmenkunden-Bindung (T-01, kein Phantom-Kunde).
- **GoBD by Design:** WORM-Audit, unveränderbare Belege, `privacy.ts` (DSGVO-Sperre B12), `continuity.ts` (Notbetrieb B17).
- **Resilienz/E-Rechnung-Eingang** über ERPNext-Standard hinaus.

## Empfohlene Priorisierung der echten Lücken (○)
1. **Multi-Warehouse** + **Serien-/Chargennummern** — nur wenn TEXMA mehrere Lagerorte bzw.
   chargenpflichtige Artikel hat. (Klärung mit TEXMA.)
2. **Lieferantenangebotsvergleich** — kleiner Einkaufs-Komfort.
3. **Pick-List** als eigener Schritt — falls Kommissionierung das braucht.
4. **Generische DocType-Engine** — nur bei breiter Modul-Expansion; sonst explizit bleiben.

*Alles andere aus ERPNext ist entweder bereits vorhanden oder für TEXMA bewusst nicht relevant.*
