# Domänen-Check Textil-ERP + GitHub/OSS-Strukturen

> Stand: 2026-06-21. Frage: „Sind PIM · CRM · Produktion · Buchhaltung · Anfrage · Angebot · Auftrag · UI/UX
> für ein Textil-ERP vollständig?" + „Welche OSS-Strukturen können wir nutzen?"
> Methode: Ist aus `schema.prisma` verifiziert, Soll aus Textil-ERP-Praxis, OSS aus GitHub-Recherche.

## Annahme zur Fertigungstiefe (steuert Produktions-Scope)
TEXMA = **Lohnveredelung** (Stick/Druck/Transfer auf zugekauften Blank-Textilien), **keine eigene Konfektion**.
→ Cut-Make-Trim (Schnittplanung, Marker-Effizienz, Grading) ist **out of scope**; die Produktionslücke betrifft
**Veredelungs-Arbeitsplätze & Kapazität** (Stickmaschinen, Druckplätze), nicht Näherei. *(Vor Bau bestätigen.)*

---

## Domänen-Matrix

### 1. PIM — *teilweise, größte Stammdaten-Lücke*
- **Ist:** `Article`(sku,name,desc,isVeredelung), `Variant`(sku), `VariantAttribute`(generisch name/value = EAV ✓), `PriceGroupPrice`, `SupplierItem`-Mapping, `StockLevel`.
- **Textil-Soll fehlt:** Faserzusammensetzung (EU-**Textilkennzeichnungs-VO 1007/2011 = Pflicht!**), Pflegehinweise, **GTIN/EAN** je Variante, Saison/Kollektion, **Medien/Bilder (DAM)**, Größen-Set/Grading, Veredelungs-Platzierung (Brust/Rücken, Stichzahl/Farben), Zolltarifnr./Ursprungsland.
- **OSS-Anleihe:** **Akeneo** EAV + **Family/Family-Variant** (Pflichtattribute je Warengruppe) — exakt das Muster, um `VariantAttribute` zu typisieren; **AtroPIM/UnoPIM** (API-zentrisch, no-code Datenmodell); **Pimcore** (PIM+DAM all-in-one); **ParaLogicTech/textile** (ERPNext, Roll-to-Roll Print Order — Transferdruck).
- **Empfehlung (D-PIM):** `VariantAttribute` um typisierte Pflichtattribute erweitern (Material, GTIN, Pflege) nach **Akeneo-Family-Muster** + `MediaAsset` (DAM) + `Collection`. GTIN/Material sind teils **rechtskonform-Pflicht**.

### 2. CRM — *nur Stammdaten, kein Vertriebsfunnel*
- **Ist:** `Company`(zahlungsziel,mahnsperre,priceGroup,stickereiPartner), `Contact`(role). `AuditLog` (≈ mail.thread ✓), `DueItem` (≈ mail.activity ✓).
- **Soll fehlt:** Lead/Interessent, **Opportunity/Pipeline** (Anfrage→Angebot→Auftrag als Funnel), Aktivitäten-/Kommunikationslog, Quelle/Kampagne, Tags/Segmente.
- **OSS-Anleihe:** **Twenty** (React/NestJS/Postgres; Objekte People/Companies/**Opportunities**/Tasks/Notes; **Kanban-Pipeline**; custom objects) — bestes Datenmodell- *und* spätere UI-Vorbild; **EspoCRM** (voller Lifecycle Leads/Opportunities/Activities/Cases).
- **Empfehlung (D-CRM):** `Lead`, `Opportunity` (Stage-Kanban über die F2-State-Machine), `Activity` (auf `DueItem`/`AuditLog`). **Twenty-Objektmodell** als Blaupause.

### 3. Anfrage (RFQ) — *fehlt als Entität*
- **Ist:** nur Enum-Wert `ANFRAGESHOP`. Keine Anfrage-Entität.
- **Soll:** eingehende Anfrage (Formular/E-Mail/Shop) → strukturierte `Inquiry` → Angebot; mit Quelle, Status, Lead/Company-Bezug.
- **OSS-Anleihe:** Odoo `crm.lead`, EspoCRM Lead→Opportunity-Flow.
- **Empfehlung (D-RFQ):** `Inquiry` als Vorstufe von `Quote` + Konvertierung `Inquiry→Quote`. Schließt die Lücke CRM↔Angebot. Bildet mit D-CRM den durchgängigen **Funnel Anfrage→Angebot→Auftrag**.

### 4. Angebot — *weitgehend vorhanden*
- **Ist:** `Quote`(status, wiedervorlageAm, lines), Vorrang-Logik Stickerei.
- **Soll:** Verfall+Verlustgrund (**B8 geplant**), Angebots-**PDF/Druckvorlage**, Versionen, Anfrage-Bezug (D-RFQ).
- **OSS-Anleihe:** Odoo `sale.order` (draft/sent/sale), ERPNext Quotation + Print Formats (qweb/Frappe).
- **Empfehlung:** B8 + PDF-Vorlage (analog `production-sheet-pdf`) + Inquiry-Bezug. Delta klein.

### 5. Auftrag — *vorhanden, Delta bekannt*
- **Ist:** `Order`(status, deliveryAddress, fileLink, lines) → `ProductionOrder`/BOM.
- **Soll:** Liefertermin+Rückwärtsterminierung & Statusausbau FAKTURIERT/ABGESCHLOSSEN (**B9 geplant**), Teillieferungen, Auftragsbestätigung-PDF.
- **OSS-Anleihe:** Odoo sale→delivery→invoice, ERPNext Sales Order.
- **Empfehlung:** B9 deckt Kern-Delta; Teillieferung optional ergänzen.

### 6. Produktion — *stark bei Fremdvergabe, Lücke bei Kapazität*
- **Ist:** `ProductionOrder`, `BomTemplate/BomItem`, `SubProductionOrder` (Fremdvergabe + State-Machine ✓), `TimeEntry`, `FinishingTargetTime`, `AmpelStatus`.
- **Soll fehlt:** **Arbeitsplätze/Workstations** (Stickmaschine/Druckplatz), **Arbeitsgänge/Routing**, **endliche Kapazitäts-/Terminplanung (APS)**, Qualitätsprüfung/Ausschuss, Maschinenbelegung. *(CMT/Schnitt = out of scope, s. o.)*
- **OSS-Anleihe:** **ERPNext** (BOM mit Operations+**Workstations**+**Job Cards**+Routing, Shop-Floor-Screen); **frePPLe** (führende Open-Source-**APS**, finite Kapazität+Routing+Scheduling — als **Sidecar** koppelbar, genau wie Odoo↔frePPLe); Odoo `mrp` Workorder/Routing.
- **Empfehlung (D-PROD):** `Workstation` + `Operation`/Routing einführen; Termin-/Kapazitätsplanung gestuft — **B9 (Rückwärtsterminierung)** als einfacher Einstieg, **frePPLe als APS-Sidecar** als Ausbau (nicht selbst bauen). Das ist die **größte echte Domänenlücke**.

### 7. Buchhaltung — *bewusst schlank (G1), Delta im Plan*
- **Ist:** `Invoice/OpenItem/Payment/PaymentAllocation/CreditNote`, DATEV-EXTF, E-Rechnung, Banking (EBICS/PSD2), Mahnwesen. **Kein Hauptbuch (G1 gewollt).**
- **Soll:** lückenloser Nummernkreis (**F1**), Mahngebühr/Historie (**B10**), Kostenstellen (**B7**), DSFinV-K/TSE (**B6**), zusätzlich prüfen: **USt-Sonderfälle** (Reverse-Charge/innergemeinschaftlich), **Skonto**.
- **OSS-Anleihe:** **bewusst keine** OSS-Buchhaltung (Odoo/ERPNext/Tryton = Hauptbuch → Kollision G1). Nur Standards/Libs: **KoSIT/Mustangproject** (E-Rechnung, F3), DSFinV-K, ISO-20022, DATEV-EXTF.
- **Empfehlung:** F1/B6/B7/B10 decken Delta; **USt-Fälle + Skonto** als kleine Ergänzung aufnehmen.

### 8. UI/UX — *bewusst später (API-first)*
- **Ist:** `apps/web` baut (vite), praktisch leer. API-first entschieden.
- **Soll (UI-Sprint):** Back-Office-CRUD über REST, **Kanban** (Pipeline/Produktions-Ampel), Druckvorlagen, Rollen-Sichten (PRODUKTION ohne Preise — `rbac.ts`).
- **OSS-Anleihe:** **react-admin** (für langlebige B2B/ERP-SPAs, 50+ REST-Adapter, backend-agnostisch — bestes Fit für unsere API; spart 50–70 % UI-Zeit); **Refine.dev** (headless, Ant/MUI/Mantine); **Twenty** als CRM-UI-Vorbild/Direktnutzung; shadcn/ui + Tremor für Dashboards.
- **Empfehlung (D-UI):** Im UI-Sprint **react-admin** über die bestehende API. **Jetzt schon:** API-Endpunkte react-admin-freundlich (Filter/Sort/**Pagination**-Konventionen) bauen — kleine Vorkehrung, große spätere Beschleunigung.

---

## Verdichtung: was ist *neu* (über den bisherigen Bauplan hinaus)
| Ref | Domänenlücke | OSS-Vorbild | Größe | Priorität |
|---|---|---|---|---|
| **D-PIM** | Textil-Pflichtattribute (Material/GTIN/Pflege) + DAM + Kollektion | Akeneo Family, Pimcore DAM | M–L | hoch (teils rechtskonform-Pflicht) |
| **D-CRM** | Lead/Opportunity/Activity + Pipeline | Twenty, EspoCRM | M–L | hoch |
| **D-RFQ** | `Inquiry` + Funnel Anfrage→Angebot→Auftrag | Odoo crm.lead | M | hoch (verbindet CRM↔Angebot) |
| **D-PROD** | Workstation/Routing + APS-Kapazität | ERPNext Job Cards, **frePPLe** | L | mittel (Veredelungs-Kapazität) |
| **D-ACC** | USt-Sonderfälle + Skonto | Standards | S–M | mittel |
| **D-UI** | react-admin über REST (UI-Sprint) | react-admin, Twenty | L | später |

## Strategische Linie (unverändert)
**Muster + Standard-Libs übernehmen, nicht die Plattform.** Direkt nutzbar/koppelbar als Sidecar:
**frePPLe** (APS), **KoSIT/Mustang** (E-Rechnung), **Deutsche Fiskal** (TSE), **react-admin/Twenty** (UI).
Datenmodell-Blaupausen: **Akeneo** (PIM), **Twenty** (CRM). Kein OSS-Hauptbuch (G1).
