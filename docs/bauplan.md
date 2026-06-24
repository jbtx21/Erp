# TEXMA-ERP — Finaler Bauplan (entscheidungsvollständig, keine offenen Punkte)

> Stand: 2026-06-24 · Branch `claude/texma-erp-migration-zrtoab`.
> Quellen: `docs/sprint-audit.md` (Ist), `docs/roadmap.md` (Backlog-Narrativ),
> **`docs/erp-prozessketten-audit.md` (neu: gerissene Verkettungen aus 2× manueller E2E-QA)**.
> Dieses Dokument ist die **ausführbare Spezifikation**: jede Entscheidung getroffen,
> jedes Item mit Schema · Shared · API · Tests · Gate · Abhängigkeit.

> **Aktiver Fokus (2026-06-24): Prozessketten schließen.** Die manuelle QA (Lead →
> „FAKTURIERT") zeigte: Grundgerüst steht, aber der Status-Automat schaltete Labels,
> ohne Folgevorgänge auszulösen. Bereits behoben: Faktura erzeugt echte Rechnung;
> Wareneingang/Lieferung buchen Lagerbewegungen; Anfrage-Inhalt wandert ins Angebot;
> AF-Nummernkollision. Nächste P0: offener Bedarf → Beschaffung; Lieferschein-Auto-Trigger
> + Produktions-Gate. Volle Liste/Status in `docs/erp-prozessketten-audit.md`.

## 0. Getroffene Entscheidungen (fix)
| Thema | Entscheidung |
|---|---|
| **UI-Umfang** | **API-first** — Backend + Domänenlogik + Tests. Keine Web-UI in diesem Bau (eigener späterer Sprint). |
| **TSE (Kasse)** | **Deutsche Fiskal** (Cloud-TSE), hinter Connector-Abstraktion. |
| **RPO/RTO** | **RTO ≤ 1 h**, RPO sekunden-nah — **asynchrone** Streaming-Replikation (kein Sync-Commit-Latenz-Overhead). Managed-HA-Postgres als Betriebsoption. |
| **Mengenstaffel** | **Global je Preisgruppe + kundenindividuell** (zwei Ebenen, kundenindividuell sticht). |
| Musterpreis (B5) | = Listenpreis der Variante (Default gesetzt). |
| Kostenstellen (B7) | generische Tabelle; Schlüssel von TEXMA/StB später befüllbar. |
| K-01 Addison | naturgemäß extern; Bau liefert nur den normkonformen DATEV/EXTF-Export. |
| **Fertigungstiefe** | **Reine Veredelung** (Blanks zukaufen) — kein Cut-Make-Trim. Produktion = Veredelungs-Arbeitsplätze/Kapazität; D-PROD/APS bleibt minimal (nur B9-Rückwärtsterminierung). |
| **Scope-Erweiterung** | Aufgenommen: **D-PIM** (→ **B18**) und **D-RFQ/Anfrage-Funnel** (→ **B20**, Sprint 5). D-CRM (volle Lead/Opportunity-Pipeline), D-PROD-APS, D-ACC bleiben **zurückgestellt** (§9). |
| **Berichtswesen** | Finanz-Reporting als **B19** (Sprint 5). Self-Service-BI = **Metabase** auf der B17-Read-Replica (kein eigener Report-Builder). |
| **Kasse (B6)** | **zurückgestellt** nach Sprint 6 — kaum Vor-Ort-Barverkauf (B2B auf Rechnung). Spec bleibt vollständig, TSE = Deutsche Fiskal. |
| **Bestand (F4)** | **vorgezogen** in Sprint 3 (Fundament, vor B5/B16) — Bewegungs-Ledger zuerst, damit Muster-/Inventur-Items kein Doppel-Refactoring brauchen. |

## 1. Architektur-Anleihen aus Open-Source-ERPs
**Strategie:** Wir übernehmen **Muster und Standard-Bibliotheken**, nicht die Plattform.
Eine Voll-Adoption (Odoo/ERPNext) scheidet aus: beide zentrieren auf doppelte Buchführung/Hauptbuch
(Konflikt mit **G1**) und bringen eine große Plattform mit (Konflikt mit **G5** schlank/verständlich, TS-Monorepo).
Wir entnehmen gezielt:

| Anleihe | Quelle (OSS) | Einsatz bei uns | Item |
|---|---|---|---|
| Zentraler, lückenloser Sequenz-Service | Odoo `ir.sequence`, ERPNext naming series | gapless Belegnummern (Rechnung/Gutschrift/Auftrag) | **F1** |
| Deklarative State-Machine (Status + erlaubte Übergänge + Guard) | ERPNext Workflow, Odoo `state` | Order/Quote-Status sauber & illegale Übergänge blockiert | **F2** |
| EN16931-Schematron-Validierung | KoSIT-Validator, `ph-en16931`, Mustangproject | volle XRechnung/ZUGFeRD-Konformität (Aus- & Eingang) | **F3** |
| Bestand als unveränderliches Bewegungs-Ledger | Odoo `stock.move`/quants | auditierbare Inventur statt mutabler `qty` | **F4** |
| Aktivitäts-/Wiedervorlage-Objekt | Odoo `mail.activity` | bereits vorhanden als `DueItem` ✓ | — |
| Audit-Chatter (alt→neu) | Odoo `mail.thread` | bereits vorhanden als `AuditLog` ✓ | — |
| Subcontracting-Datenmodell (Beistellung→Rücklauf) | Odoo `mrp_subcontracting` | bestätigt unser `SubProductionOrder` ✓ | — |
| Job-Queue/Outbox | OCA `queue_job` | bereits vorhanden als `OutboxEvent`+Worker ✓ | — |
| ISO-20022 / DSFinV-K / DATEV-EXTF | offene Standards | camt053/pain001 ✓; DSFinV-K → B6; EXTF ✓ | — |

> Direkt nutzbare Libraries (in Worker als Sidecar/CLI, sprachunabhängig): **KoSIT-Validator** (Java, Schematron),
> **Mustangproject** (Java, ZUGFeRD/Factur-X), **Deutsche-Fiskal-API** (TSE). Kern bleibt TS.

## 2. Build-Reihenfolge
```
Sprint 3 (Fundament/Compliance):  F1 · F2 · F4 · B3 · B1 · B2
Sprint 4 (Muss):                  B4 · B18 · B17 · F3 · B5 · B7
Sprint 5 (Vorgangskette):         B8 · B9 · B10 · B11 · B12 · B19 · B20
Sprint 6 (Could/Future):          B16 · B6(Kasse) · B15 · B13 · B14
```
Regel je Item (Definition of Done) siehe §7.

---

## Sprint 3 — Fundament & Compliance

### F1 · Zentraler lückenloser Nummernkreis — GoBD/Kap. 10 · **M**
- **Schema:** `NumberSequence { key String @id  // "INVOICE"|"CREDIT_NOTE"|"ORDER"|...
  prefix String  year Int  next Int  @@unique([key,year]) }`.
- **Shared:** `numbering.ts` — `formatNumber(key, year, n)`; rein.
- **API/Repo:** `nextNumber(key)` **transaktional** (`SELECT … FOR UPDATE` / atomarer Increment) → garantiert lückenlos & kollisionsfrei; Vergabe nur bei Finalisierung des Belegs.
- **Migration:** bestehende Belege auf Sequenz-Stand initialisieren.
- **Tests:** `numbering.test.ts` (Format, Jahreswechsel), `…repository.int.test.ts` (Parallelvergabe ohne Lücke/Dublette).
- **Gate:** G2 (Belegnummern-Lückenlosigkeit). **Abh.:** B3 (int-test).

### F2 · Wiederverwendbare State-Machine — G5/Kap. 35 · **S–M**
- **Shared:** `statemachine.ts` — `defineMachine(transitions)`, `canTransition(state,to)`, `assertTransition(...)`; verallgemeinert das vorhandene `subproduction.ts`-Muster.
- **Anwendung:** `orderStatusMachine`, `quoteStatusMachine` (Definitionen in `order.ts`/`quote.ts`); `subproduction.ts` auf gemeinsamen Helfer umstellen (Verhalten unverändert, Tests bleiben grün).
- **Tests:** `statemachine.test.ts` (erlaubte/verbotene Übergänge); Regressions-Tests Subproduction.
- **Gate:** G5. **Abh.:** keine. Underpins B8/B9.

### F4 · Bestand als Bewegungs-Ledger — G2/Kap. 37.1 · **M** (vorgezogen)
- **Refactor (Odoo `stock.move`):** `StockMove { variantId, deltaQty Int, grund [WARENEINGANG|VERBRAUCH|INVENTUR|KORREKTUR|MUSTER], lager [HAUPT|MUSTER], belegRef, createdAt }` **append-only**; aktueller Bestand = Σ moves, `StockLevel` bleibt als materialisierter Cache.
- **Warum zuerst:** B5 (Muster-Bestand) und B16 (Inventur) bauen darauf — Ledger vor den bestandsberührenden Items vermeidet Doppel-Refactoring.
- **Migration:** `StockLevel.qty` → Eröffnungs-`StockMove` je Variante.
- **Tests:** `stock.test.ts` — Saldo = Σ Moves; getrennter Muster-Lagerbestand. **Gate:** G2 (auditierbar). **Abh.:** B3.

### B3 · Integrations-Testlane (CI) — G6 · **M** — ✅ bereits erfüllt
- **Befund:** `.github/workflows/ci.yml` existiert und leistet genau das: Postgres-16-Service-Container + Redis, `prisma migrate deploy`, Unit-Tests (DB-frei), dann Integrationstests mit `RUN_DB_TESTS=1` für `@texma/api` und `@texma/worker-orchestration`.
- **Effekt:** neue `*.int.test.ts` (F1 numbering, F4 stock, …) laufen automatisch mit — keine Änderung nötig. **Abh.:** keine.

### B1 · Verfahrensdokumentation füllen — G4 · **M**
- `docs/verfahrensdokumentation/README.md`: 6 Abschnitte real befüllen (Allgemein, Anwender, Technik, Betrieb, IKS, Belegarten) + Historie v0.2.
- Abschnitt 4 (Betrieb) enthält das **Notfall-Runbook** (→ B17/K-17). Belege: `rbac.ts`, `schema.prisma`, `packages/audit`, `numbering.ts`, ADRs.

### B2 · Domänenmodell-Artefakt — G5 · **S**
- `docs/domänenmodell.md`: ER-Übersicht, Vorgangskette, **Statusautomaten aus F2** (inkl. erweitertem OrderStatus, s. B9), Nummernkreis-Hoheit (F1). Konsistenz-Hinweis ↔ `schema.prisma`.

---

## Sprint 4 — Muss-Funktionen

### B4 · Mengenstaffel (global + kundenindividuell) — T-15 · Kap. 4.4 · **M**
- **Befund:** Veredelungs-Staffel existiert (`MarkupRule.minMenge/maxMenge`). Es fehlt die Basispreis-Staffel.
- **Schema (zwei Ebenen):**
  - `PriceGroupPriceTier { variantId, priceGroupId, minMenge Int, netCents Int  @@unique([variantId,priceGroupId,minMenge]) }` (global je Preisgruppe).
  - `CustomerPriceTier { companyId, variantId, minMenge Int, netCents Int  @@unique([companyId,variantId,minMenge]) }` (kundenindividuell).
- **Shared (Bake-in: *eine* Pipeline, klare Präzedenz):** `pricing.ts` — (1) `CustomerPriceTier` → (2) `PriceGroupPriceTier` → (3) Einzelpreis `PriceGroupPrice`, danach (4) `MarkupRule`-Veredelungsstaffel multiplikativ. Stufenwahl je Ebene „größte `minMenge` ≤ Bestellmenge". **Kein vierter paralleler Mechanismus** — alle Staffelquellen laufen durch dieselbe Funktion.
- **Tests:** `pricing.test.ts` — T-15 generisch (Grenze über-/unterschritten), Vorrang kundenindividuell vor global, Stickerei-Staffel bleibt grün.
- **Gate:** macht T-15 voll. **Abh.:** F2 nein; B3 (int-test).

### B18 · Textil-PIM-Erweiterung (D-PIM) — Kap. 3 · EU-VO 1007/2011 · **M–L**
- **Ziel:** PIM textilreif & rechtskonform; Vorbild **Akeneo** (typisierte Pflichtattribute je Warengruppe) + **Pimcore** (DAM).
- **Schema:**
  - `Article`: `materialComposition String?` (**Faserzusammensetzung — Kennzeichnungspflicht**), `careInstructions String?`, `brand String?`, `hsCode String?` (Zolltarif), `originCountry String?`, `collectionId String?`.
  - `Variant`: `gtin String?` (EAN/GTIN-13), `weightGrams Int?`.
  - `Collection { id, name, season }`.
  - `MediaAsset { id, articleId?, variantId?, url, kind [IMAGE|PRINT_TEMPLATE|EMBROIDERY_FILE], sortOrder }` (DAM).
  - `FinishingSpec { id, articleId, method [STICK|DRUCK|TRANSFER], placement, stitchCount?, colorCount? }` (Veredelungs-Metadaten).
- **Shared:** `pim.ts` — **GTIN-13-Prüfziffer**, Pflicht-Materialangabe vor Verkaufsfreigabe erzwingen.
- **API:** PIM-Modul erweitern (+ in-memory/prisma repo + int-test).
- **Tests:** `pim.test.ts` — GTIN-Checksum gültig/ungültig, fehlende Materialangabe blockiert Freigabe, Media/Collection-Zuordnung.
- **Gate:** rechtskonform (Textilkennzeichnung) + G6. **Abh.:** B3.
- *Hinweis:* Full-EAV-„Family-Engine" (frei definierbare Attribute) bewusst **nicht** jetzt — konkrete typisierte Felder reichen; Generalisierung bei wachsender Attributvielfalt nachrüstbar.

### B17 · Notbetrieb & Resilienz — K-17 · Kap. 27 · **L** (Muss)
- **Modus A (Internet am Standort weg, Cloud ok):** `modules/continuity` erzeugt **Tages-Offline-Bundle** offener Aufträge — Produktionszettel (vorhandenes `production-sheet-pdf`) + Lieferscheine als PDF/CSV; Produktion arbeitet offline.
- **Modus B (Cloud/Server-Ausfall):** **asynchrone Streaming-Replikation** (Postgres Hot-Standby, **RPO sekunden-nah**, keine Commit-Latenz), dokumentierter Failover (**RTO ≤ 1 h**). Managed-HA-Postgres als Betriebsoption. Konfiguration als IaC/Doku, nicht App-Code.
- **Wiederanlauf:** `OutboxEvent`/`IntegrationLog` liefert Shop-/Versand-Events nach; nacherfasste Produktionsrückmeldungen **idempotent** (Idempotenzschlüssel am Eingang).
- **Schema:** `idempotencyKey String?` an Rückmeldungs-Eingängen (z. B. `TimeEntry`/Produktionsrückmeldung) + `@@unique`.
- **Tests:** `continuity.test.ts` — Bundle vollständig (alle Produktions-Pflichtfelder), doppelte Nacherfassung bleibt idempotent.
- **Doku:** Failover-/Notfall-Runbook in B1-Abschnitt 4. **Abh.:** B1, B3.

### F3 · EN16931-Validierung (zweistufig, Bake-in) — G3 · **M**
- **Stufe 1 (TS-nativ, Pflicht):** `einvoice.ts` um die EN16931-**Geschäftsregeln (BR-*)** erweitern — deckt den Großteil **ohne JVM**, schneller Vorfilter für Aus- & Eingang.
- **Stufe 2 (optional, Zertifizierung):** `services/workers/connectors/einvoice-validator` ruft **KoSIT-Validator** (Java-Sidecar, Schematron) — nur wenn voll-zertifizierte Konformität verlangt wird (hält die JVM aus dem Normalbetrieb).
- **Tests:** `einvoice.test.ts` erweitern (valide/invalide Referenzbelege, BR-Regeln); Sidecar-Smoke-Test optional.
- **Gate:** härtet G3 (Aus- & Eingang). **Abh.:** B3.

### B5 · Muster-Leihgut + 21-Tage-Automatik — Kap. 37.3 · **M**
- **Schema:** `SampleLoan { companyId, variantId, menge Int, ausgegebenAm, status [VERLIEHEN|ZURUECK|BERECHNET], invoiceId? }`. **Musterbestand über F4** (`StockMove` mit `lager=MUSTER`) — kein separates mutables Feld.
- **Wiedervorlage:** `DueItem(entity="SampleLoan", dueDate = ausgegebenAm + 21T)`.
- **Shared:** `sample.ts` — Fälligkeit; bei Überschreitung Musterrechnung (**Preis = Listenpreis**) via `invoice.ts` + Nummer aus **F1**.
- **Tests:** `sample.test.ts` — Rückgabe < 21 T → keine Rechnung; > 21 T → Musterrechnung zum Listenpreis.
- **Gate:** G1. **Abh.:** F1, **F4**, B3.

### B7 · Kostenstellen — Kap. 37.1 · **M**
- **Schema:** `CostCenter { nummer @unique, name }` + `costCenterId?` an `Invoice`/`PurchaseOrder`/`TimeEntry`.
- **Shared/API:** Zuordnung + Auswertung in `reporting.ts`. **Tests:** `reporting.test.ts` (Auswertung je Kostenstelle). **Gate:** G1 (Auswertung, keine Buchung). **Abh.:** keine.

---

## Sprint 5 — Vorgangskette

### B8 · Angebot: Verfall + Verlustgrund — Kap. 35.1 · **S**
- **Schema:** `gueltigBisAm DateTime?`, `verlustgrund String?` an `Quote`.
- **Logik:** Verfall → `DueItem`-Wiedervorlage; Übergang nach `ABGELEHNT` via **F2** mit Pflichtgrund.
- **Tests:** quote-Service/`pricing.test.ts` — abgelaufenes Angebot, Ablehnung mit Grund. **Abh.:** F2.

### B9 · Auftrag: Liefertermin + Rückwärtsterminierung + Statusausbau — Kap. 35.2 · **M**
- **Entscheidung K-26 = ja:** `OrderStatus` um **`FAKTURIERT`** + **`ABGESCHLOSSEN`** erweitern; Übergänge in **F2** `orderStatusMachine`.
- **Schema:** `zugesagterLiefertermin DateTime?` an `Order`; Enum-Erweiterung + Migration.
- **Shared:** `scheduling.ts` — Rückwärtsterminierung aus Liefertermin − Durchlaufzeiten (`FinishingTargetTime`).
- **Tests:** `scheduling.test.ts` (Starttermin), `statemachine`-Tests bis `ABGESCHLOSSEN`. **Abh.:** F2, B2.

### B10 · Mahnwesen: Text/Gebühr/Historie — Kap. 9.5 · **M**
- **Schema:** `DunningNotice { openItemId, stufe Int, gebuehrCents, textVorlage, erzeugtAm }` — append-only Historie.
- **Shared:** `dunning.ts` erweitern (Gebühr je Stufe, Textvorlage). **Tests:** `dunning.test.ts` — Stufen 1–3 mit Gebühr + Historieneintrag. **Gate:** G2 (kein Update). **Abh.:** B3.

### B11 · Reklamation: Folge-Vorgang erzeugen — Kap. 20 · **S–M**
- **Befund:** `Complaint.followUp` + `CreditNote` existieren — nur die Aktion fehlt.
- **API:** `reklamation.service.ts` — aus `followUp` automatisch Nachproduktions-`Order` **oder** `CreditNote` (Nummer aus F1) mit `costBearer`.
- **Tests:** `reklamation.test.ts` — je Typ korrekter Folgevorgang + Kostenzuordnung. **Abh.:** F1.

### B12 · DSGVO Sperren/Anonymisieren statt Löschen — Kap. 28 · **M**
- **Entscheidung:** rechtskonform = **Sperren/Anonymisieren** (Belegintegrität bleibt, WORM unverletzt).
- **Schema:** `gesperrtAm DateTime?`, `anonymisiertAm DateTime?` an `Company`/`Contact`; Audit-Eintrag.
- **Shared:** `privacy.ts` — Stammdaten-Anonymisierung ohne Belegbezug zu brechen.
- **Tests:** `privacy.test.ts` — Kontakt anonymisiert, Rechnung unveränderbar. **Gate:** G2 + DSGVO. **Begleitschritt:** Fristenmatrix StB. **Abh.:** B1.

### B19 · Finanz-Reporting (D-RPT-Fin) — Kap. 29 · **S–M**
- **Befund:** operatives Reporting stark; Finanz-Auswertungen fehlen.
- **Shared:** `reporting.ts` erweitern (reine Aggregation, IO-frei):
  - **OP-Aging** — Buckets 0–30 / 31–60 / 61–90 / >90 Tage aus `OpenItem`-Fälligkeit.
  - **DSO** (Days Sales Outstanding) / Forderungslaufzeit.
  - **Liquiditätsvorschau** aus `OpenItem`-Fälligkeiten + geplanten `PaymentOrder`.
  - **Breakdown-Erweiterung:** Dimension um **Artikel/Veredelungsart** + **Deckungsbeitrag/Marge** (nicht nur Umsatz).
- **API:** `reporting.service.ts` um Finanzberichte ergänzen; in PDF-/KI-Bericht aufnehmen. **RBAC:** Geldfelder nur BÜRO/BUCHHALTUNG/ADMIN.
- **Self-Service-BI (Betrieb, kein App-Code):** **Metabase** an die B17-Read-Replica (RPO~0) — Dashboards + geplante Berichte; Doku in B1-Abschnitt 4.
- **Tests:** `reporting.test.ts`/`production-metrics.test.ts`-Stil — Aging-Buckets, DSO, Marge-Breakdown.
- **Gate:** G1 (Auswertung, keine Buchung) + RBAC. **Abh.:** B17 (Replica als BI-Quelle).

### B20 · Anfrage/RFQ-Funnel (D-RFQ) — Kap. 18.1/35.1 · **M**
- **Ziel:** durchgängiger Funnel **Anfrage → Angebot → Auftrag**; Vorbild Odoo `crm.lead` (ohne volle Pipeline).
- **Schema:** `Inquiry { id, number (F1), companyId?, kontaktName?, quelle [WEB|EMAIL|SHOP|TELEFON], status [NEU|IN_BEARBEITUNG|ANGEBOT|VERWORFEN], verworfenGrund?, text, quoteId?, createdAt }` (+ optional `InquiryLine`).
- **Shared:** `inquiry.ts` — Status-Funnel über **F2**; Konvertierung `Inquiry → Quote` (übernimmt Positionen/Company).
- **API:** `modules/inquiry/inquiry.service.ts` (+ in-memory/prisma repo + int-test).
- **Tests:** `inquiry.test.ts` — Funnel-Übergänge, Konvertierung Inquiry→Quote, Verwerfen mit Grund.
- **Gate:** G6. **Abh.:** F1, F2, Quote (B8).

---

## Sprint 6 — Could/Future

### B16 · Inventur (auf F4-Ledger) — Kap. 37.1 · **M**
- **Inventur:** erzeugt `StockMove`-Korrekturbelege (`grund=INVENTUR`) statt `qty` direkt zu setzen; F4-Ledger steht bereits aus Sprint 3.
- **Tests:** `stock.test.ts` — Inventurkorrektur erzeugt Beleg, Saldo stimmt. **Gate:** G2 (auditierbar). **Abh.:** F4.

### B6 · Kasse (Bar/EC) mit Deutsche-Fiskal-TSE — Kap. 37.4 · **L** (zurückgestellt aus Sprint 4)
- **Warum hier:** kaum Vor-Ort-Barverkauf bei B2B-Lohnveredelung → niedrige Priorität; Spec bleibt vollständig, falls Ladentheke dazukommt.
- **Connector:** `services/workers/connectors/tse` kapselt **Deutsche Fiskal** hinter Port-Interface.
- **Schema:** `CashRegister`; `CashSale { orderId?, betragCents, art [BAR|EC], belegNr (F1), kassiertAm, kassierer, tseSignatur, tseSeriennummer, tseTxId }` — **append-only** (WORM).
- **Shared:** `pos.ts` — Beleg/Zahlung, Verknüpfung `OpenItem`/`Payment`; **DSFinV-K-Export**.
- **Tests:** `pos.test.ts` — signierter, unveränderbarer Beleg + Posten geschlossen; DSFinV-K valide (Stub-TSE).
- **Gate:** G2 + KassenSichV/§146a AO. **Abh.:** F1, B3. **Begleitschritt:** Deutsche-Fiskal-Vertrag/Keys + StB.

### B15 · Lead/Interessent — Kap. 18.1 · **M**
- Leichter Entitätstyp `Lead` vor `Company`; Konvertierung Lead→Company.

### B13 · Kundenportal — Kap. 36 · **L**
- Eigener Auth-Scope (RBAC-Erweiterung), read-only Auftragsstatus; **erstes UI-Item** (außerhalb API-first-Entscheidung — separat zu planen).

### B14 · KI-Freitexterfassung Anfrage→Angebot — Kap. 22.2 · **L**
- Claude-API (`claude-opus-4-…`); Freitext → strukturierter Angebotsentwurf; **Mensch-Freigabe Pflicht**; Validierung gegen Varianten/Preise.

---

## 7. Definition of Done (je Item)
1. Unit-Tests grün (Shared + Service) · 2. Integrationstest grün (DB-Lane B3) · 3. `typecheck` + `build` sauber ·
4. Verfahrensdoku (B1/G4) + Domänenmodell (B2) aktualisiert · 5. GoBD-Grenzen unverletzt (G1 kein Hauptbuch, G2 WORM) ·
6. Migration vorhanden & idempotent · 7. Commit + Push auf den Feature-Branch.

## 8. Status „keine offenen Punkte"
Alle baurelevanten Entscheidungen sind getroffen (§0). Es verbleiben ausschließlich **nicht-blockierende externe Begleitschritte**,
die parallel zum Bau laufen und die Codeerstellung nicht aufhalten:
- Deutsche-Fiskal-Vertrag/Keys (B6) — Test läuft gegen Stub-TSE.
- StB-Gegenzeichnung Verfahrensdoku/DSGVO-Fristenmatrix (B1/B12).
- AddisonOne-Import-Abnahme (K-01) — externe Software, Bau liefert normkonformen Export.
- Bereitstellung Postgres-Replica/Failover-Infra (B17) — IaC/Betrieb.

## 9. Bewusst zurückgestellt (dokumentiert, nicht im aktiven Plan)
Aus dem Domänen-Check aufgenommen: **B18 (D-PIM)** und **B20 (D-RFQ Anfrage-Funnel)**. Folgende Lücken sind
analysiert und in `docs/domaenen-check-textil.md` festgehalten, aber **per Entscheidung nicht** in diesem Bau:
- **D-CRM** — volle Lead/Opportunity/Activity-**Pipeline** (Vorbild Twenty/EspoCRM). Der Anfrage-Funnel ist als **B20** im Plan; die breite Vertriebs-Pipeline bleibt späterer Sprint.
- **D-PROD/APS** — Workstation/Routing + endliche Kapazitätsplanung (frePPLe-Sidecar). Einstieg bleibt B9 (Rückwärtsterminierung); APS später.
- **D-ACC** — USt-Sonderfälle (Reverse-Charge/innergemeinschaftlich) + Skonto. Bei Bedarf als kleine Ergänzung nachziehbar.
- **D-UI** — react-admin/Twenty über die REST-API; eigener UI-Sprint (API-first-Entscheidung).
