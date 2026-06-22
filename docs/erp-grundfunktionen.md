# ERP-Grundfunktionen — Lückenliste & Bauplan (ERPNext als Maßstab)

> **Zweck:** „Was kann jedes ERP grundsätzlich — und was fehlt uns noch?" ERPNext dient als
> **Maßstab/Lampe**, nicht als Bauplan zum Nachbauen. Wir behalten **explizite Module** (kein
> generisches DocType-Framework-Rewrite) und **G1** (kein Hauptbuch), ergänzen aber die
> **querschnittlichen Grundfunktionen**, die jedes ERP hat und die uns noch fehlen.
>
> Stand geprüft am Code (`schema.prisma`, `packages/shared`, `apps/api`). Status:
> **✓** vorhanden · **◐** teilweise · **○** fehlt (Bauplan) · **✗** bewusst out of scope.

---

## A. Belegmechanik & Datenintegrität (das Fundament)
| Grundfunktion (jedes ERP) | TEXMA-Stand | Status |
|---|---|---|
| Belegstatus Entwurf→Final→Storniert, **unveränderlich nach Final** | `Invoice.finalized`, WORM-Audit, `statemachine.ts` | ✓ |
| Storno = Gegenbuchung statt Löschen | Storno/Gutschrift, append-only | ✓ |
| **Append-only Stock-Ledger** (Menge je Artikel) | `StockMove` (F4) | ✓ |
| Lager-**Bewertung** (FIFO/gleitend) | nicht modelliert | ◐ Wert/Bewertung offen |
| Audit-Trail (wer/wann, alt→neu) | `AuditLog(before/after)` | ✓ |
| **„wer" (Ersteller/Bearbeiter) je Datensatz** (`owner`/`createdBy`) | nur `createdAt/updatedAt`, kein User-FK | ○ |
| Nummernkreise mit Mustern (`.YYYY.`, `.####.`) | `numbering.ts` | ✓ |
| **GL Entry / Hauptbuch** | — | ✗ **G1** (DATEV-Export an StB) |

## B. Querschnitt auf JEDEM Datensatz (ERPNext-„DocType-Basics")
| Grundfunktion | TEXMA-Stand | Status |
|---|---|---|
| **Anhänge** (Dateien an Belegen/Stammdaten) | `RecordAttachment` + `collab`-API + `RecordPanel` (Stufe 1) | ✓ (Upload = Integrationspunkt) |
| **Kommentare / Notizen** | `RecordComment` + `collab`-API + `RecordPanel` (Stufe 1) | ✓ |
| **Aktivitäten** (offene Tasks/Termine „was ist als Nächstes") | `RecordActivity` (TASK/EVENT, abhakbar) (Stufe 1) | ✓ |
| **Verknüpfte Belege („Connections")** generisch sichtbar | Kette existiert, keine generische Ansicht | ◐ |
| **Benachrichtigungen** (in-app) + **E-Mail-Vorlagen** | `notification`-Modul (G-5): In-App-Glocke + `{{platzhalter}}`-Vorlagen + Render; Auto-Notiz bei Statuswechsel | ✓ (SMTP-Versand = Integrationspunkt) |
| **Globale Suche / Volltext** | `search`-Modul (G-6): entitätsübergreifend (Firma/Lieferant/Auftrag/Artikel/Lead) + Header-Suchbox | ✓ |
| Rollen/Rechte (feldgenau) | `rbac.ts` (inkl. Feld-Redaktion) | ✓ |
| Druck/PDF je Belegtyp | `production-sheet-pdf`, `report-pdf` | ◐ gezielt |
| Listen: Filter/Sort | `AutoTable`/`ListPage` | ◐ ohne gespeicherte Filter/Spaltenwahl |

## C. Beleg-/Vorgangsketten-Granularität
| Grundfunktion | TEXMA-Stand | Status |
|---|---|---|
| Belegkette Angebot→Auftrag→Lieferung→Faktura | verdrahtet | ✓ |
| **Teil-Erfüllung: `lieferstatus`/`fakturastatus`** (Nicht/Teilweise/Voll) | `fulfillment.ts` + Order-Felder; **Mehrfach-Teillieferung** (`DeliveryNoteLine`, `delivery`-Modul) → echter Lieferstatus aus gelieferter Menge | ✓ (Lieferstatus jetzt mengenecht; Fakturastatus aus Betrag) |
| Mengen-Rückverweise (`against_*`/`*_detail`) für Teilmengen | implizit | ◐ |
| Zugesagter Liefertermin + Rückwärtsterminierung | **B9** (gerade gebaut) | ✓ |

## D. Auswertung / Dashboard (generisch)
| Grundfunktion | TEXMA-Stand | Status |
|---|---|---|
| Dashboard-Startseite | `Dashboard.tsx` + Termin-Ampel | ◐ fest verdrahtet |
| **Charts + KPI-Kacheln als wiederverwendbare Entitäten** (mehreren Dashboards zuordenbar) | `dashboard`-Modul (G-7): DashboardChart/NumberCard/Dashboard/DashboardItem über festem Metrik-Katalog + DashboardsPage | ✓ (bounded Katalog statt unbegrenztem Aggregator) |
| Berichte mit Filtern/Granularität | `reporting.ts`, KI-Report, Finanzberichte | ✓ |

## E. CRM-Tiefe (aus ERPNext-Lead/Opportunity)
| Grundfunktion | TEXMA-Stand | Status |
|---|---|---|
| Lead-Funnel mit Status | `lead.ts` (NEU→KONTAKTIERT→QUALIFIZIERT→konvertiert) | ✓ |
| Anfrage-Funnel | `inquiry.ts` | ✓ |
| **Opportunity-Stufe (sales_stage + Wahrscheinlichkeit, gewichtete Pipeline)** | nicht modelliert | ○ Option (falls Forecast gewünscht) |
| Lead→Kunde-Konvertierung mit Stammdaten-Übernahme | teilweise (Anfrage→Quote) | ◐ |
| Aktivitäten/Notizen am Kontakt | s. B (generisch) | ○ |

---

## Bewusst out of scope (kein „Grundfunktion-Loch")
Hauptbuch/GL (**G1**), Mehrwährung, HR, Payroll, Anlagenbuchhaltung, Quality-Modul,
Projects/Timesheets, Subscription/Shareholder, indische Steuerkonzepte — s. `erpnext-feature-abgleich.md`.

---

## Empfohlener Bauplan (explizit, kein Framework-Rewrite, G1-konform)

**Stufe 1 — Generischer Datensatz-Querschnitt — ✅ GEBAUT** (höchster Hebel, auf ALLEN Entitäten nutzbar):
- **G-1 Anhänge:** `RecordAttachment` + Service/Repo + `collab.addAttachment` + UI-`RecordPanel` (generisch an jeden Beleg andockbar; Upload = Integrationspunkt). ✅
- **G-2 Kommentare/Aktivitäten:** `RecordComment` + `RecordActivity` (TASK/EVENT, Fälligkeit, abhakbar) + UI — „was ist als Nächstes". ✅
- **G-3 Ersteller je Datensatz:** Autor/Ersteller (`author`/`createdBy`/`uploadedBy` = angemeldete:r Nutzer:in) auf den Querschnitt-Datensätzen; User-FK auf den Kern-Belegen noch offen. ◐

**Stufe 2 — Ketten-Korrektheit:**
- **G-4 Teil-Status:** `lieferstatus`/`fakturastatus` an `Order`, automatisch aus Liefer-/Rechnungsmengen.

**Stufe 3 — Kommunikation & Auffindbarkeit:**
- **G-5 Benachrichtigungen** (in-app + E-Mail-Vorlagen).
- **G-6 Globale Suche** (Volltext über Kern-Entitäten).

**Stufe 4 — Auswertung:**
- **G-7 Generisches Dashboard:** `DashboardChart` + `NumberCard` als wiederverwendbare Entitäten.

*Jede Stufe hält die Konventionen: Domänenlogik in `packages/shared`, Service + Repo (in-memory/prisma)
in `apps/api`, Web-UI, Tests, Verfahrensdoku.*
