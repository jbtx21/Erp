# TEXMA-ERP — Roadmap & Backlog-Struktur (Sprint 3+)

> Stand: 2026-06-21, Branch `claude/texma-erp-migration-zrtoab`.
> Grundlage: `docs/sprint-audit.md`. Zweck: das Restbacklog **vollständig planen und
> strukturieren**, bevor gebaut wird. Jedes Item ist implementierungsreif spezifiziert
> (Schema · Shared-Logik · API · Web · Tests · Gate · Abhängigkeit · Aufwand · Klärung).
> Aufwand: **S** ≤ ½ Tag · **M** 1–2 Tage · **L** > 2 Tage.

## Konventionen (Ist-Architektur, an die sich jedes Item hält)
- **Domänenlogik rein** in `packages/shared/src/<thema>.ts` (+ `.test.ts`), geldbeträge in Cent (`money.ts`), keine I/O.
- **API-Modul** in `apps/api/src/modules/<modul>/<modul>.service.ts` (+ `.service.test.ts`), orchestriert Repository + Shared.
- **Repository-Port**: je `in-memory-<x>.repository.ts` (Unit) **und** `prisma-<x>.repository.ts` (+ `.int.test.ts`, DB-Lane).
- **Persistenz**: `packages/db/prisma/schema.prisma`; Migration je Schemaänderung. Kapitel-Provenance als Kommentar.
- **GoBD-Grenzen** unverändert: finalisierte Belege unveränderbar (`packages/audit`), Korrektur via Storno/Gutschrift, kein Hauptbuch (G1).
- **Doku-Pflicht**: jede funktionale Änderung aktualisiert `docs/verfahrensdokumentation/` (G4) — Teil der „Definition of Done".

---

## Sprint 3 — Compliance- & Fundament-Schulden (P0)
*Ziel: die offenen Gates G4/G5 schließen und G6 auf die Persistenzschicht ausdehnen. Reine Doku/Infra, kein Domänencode, niedrigstes Risiko, höchster Pflichtcharakter.*

### B1 · Verfahrensdokumentation füllen — G4 · Kap. 10 · **M**
- **Ziel:** Stub → lebende GoBD-Doku entlang des real gebauten Systems.
- **Artefakt:** `docs/verfahrensdokumentation/README.md` (6 Abschnitte: Allgemein, Anwender, Technik, Betrieb, IKS, Belegarten) + Änderungshistorie v0.2.
- **Belege:** `rbac.ts`, `schema.prisma`, `packages/audit`, `datev.ts`, `einvoice-inbound.ts`, ADR 0001/0002.
- **Ehrlich offen markieren:** RPO/RTO-Werte, Notbetrieb K-17, Löschkonzept (→B12), Addison-DATEV K-01, TSE-Kasse (→B6).
- **Tests/Gate:** keine Tests; schließt G4. **Abh.:** keine. *(Plan-Detail siehe Chatverlauf.)*

### B2 · Domänenmodell als Artefakt — G5 · **S**
- **Ziel:** Entitäten + Beziehungen + Lebenszyklen als prüfbares Dokument (Bus-Faktor).
- **Artefakt:** `docs/domänenmodell.md`: ER-Übersicht (37 Modelle), Vorgangskette Angebot→Auftrag→PA→Faktura, Statusautomaten (QuoteStatus/OrderStatus/…), Nummernkreis-Hoheit.
- **Quelle:** generiert/abgeleitet aus `schema.prisma`; muss mit ihm konsistent bleiben (Hinweis in beiden Dateien).
- **Tests/Gate:** keine; schließt G5-Lücke. **Abh.:** keine.

### B3 · Integrations-Testlane (CI) — G6 · **M**
- **Ziel:** die 19 `*.int.test.ts`-Skips laufen lassen → Persistenzschicht verifiziert.
- **Umfang:** CI-Job mit ephemerem Postgres (service container), `DATABASE_URL` gesetzt, `prisma migrate deploy`, dann Integrationstests; Unit-Lane bleibt DB-frei.
- **Artefakt:** `.github/workflows/*` + ggf. `docker-compose.test.yml`; README-Notiz.
- **Tests/Gate:** aktiviert vorhandene Tests; vollendet G6. **Abh.:** keine. **Klärung:** CI-Provider/Runner bestätigen.

---

## Sprint 4 — Muss-Funktionslücken (P1)
*Ziel: die im Lastenheft als Muss markierten, aber noch nicht modellierten Fähigkeiten. Höchster fachlicher Wert.*

### B4 · Generische Basispreis-Mengenstaffel (T-15 vollständig) — Kap. 4.4 · **M**
- **Befund:** Veredelungs-Staffel existiert (`MarkupRule.minMenge/maxMenge/finishingType/priceGroupId`); Lücke ist die **Artikel-Basispreis-Staffel**.
- **Schema:** `PriceGroupPriceTier` (variantId, priceGroupId, minMenge, netCents, @@unique[variant,group,minMenge]) **oder** `minMenge` an `PriceGroupPrice` ergänzen.
- **Shared:** `pricing.ts` erweitern: Stufenwahl „größte minMenge ≤ Bestellmenge", multiplikativ mit Veredelungs-Markup.
- **API:** Preisfindung im Auftrags-/Angebotspfad.
- **Tests:** `pricing.test.ts` — T-15 generisch (Mengengrenze über-/unterschritten); bestehende Stickerei-Staffel bleibt grün.
- **Gate:** macht T-15 voll. **Abh.:** keine. **Klärung:** K-? Staffelgrenzen verhandelbar je Kunde?

### B5 · Muster-Leihgut + 21-Tage-Automatik — Kap. 37.3 · **M**
- **Schema:** `SampleLoan` (companyId, variantId, menge, ausgegebenAm, status [VERLIEHEN|ZURÜCK|BERECHNET], invoiceId?); getrennter Musterbestand (Flag auf `StockLevel` oder eigener Bestand).
- **Wiedervorlage:** `DueItem(entity="SampleLoan", dueDate = ausgegebenAm+21T)` — Mechanismus existiert bereits.
- **Shared:** `sample.ts` — Fälligkeit prüfen, bei Überschreitung Musterrechnung anstoßen (nutzt `invoice.ts`).
- **API:** `modules/sample/sample.service.ts` (+ in-memory/prisma repo + int-test).
- **Tests:** `sample.test.ts` — Rückgabe < 21T → keine Rechnung; > 21T → Musterrechnung.
- **Gate:** G1 (Faktura, kein Hauptbuch). **Abh.:** B3 (int-test). **Klärung:** Musterpreis = Listenpreis?

### B6 · Bar-/EC-Kasse (Vor-Ort-Zahlung) — Kap. 37.4 · **L**
- **Entscheidung:** **rechtskonform = TSE-pflichtig** (KassenSichV/§146a AO + DSFinV-K). Wird von Anfang an mit zertifizierter TSE (Cloud-TSE) und unveränderbarem Kassenjournal gebaut — nicht als einfache Zahlungsmaske.
- **Schema:** `CashRegister`, `CashSale` (orderId?, betragCents, art [BAR|EC], belegNr, kassiertAm, kassierer, tseSignatur, tseSeriennummer) — append-only (GoBD/WORM, `packages/audit`).
- **Shared:** `pos.ts` — Beleg/Zahlungserfassung, TSE-Signatur-Anbindung, Verknüpfung mit `OpenItem`/`Payment`; **DSFinV-K-Export**.
- **API:** `modules/pos/pos.service.ts` (+ in-memory/prisma repo + int-test) + TSE-Connector unter `services/workers/connectors/tse` (Anbieter hinter Abstraktion, analog Banking).
- **Tests:** `pos.test.ts` — Barzahlung → signierter, unveränderbarer Kassenbeleg + schließt offenen Posten; DSFinV-K-Export valide.
- **Abh.:** B3. **Gate:** G2 (WORM) + KassenSichV. **Begleitschritt (nicht blockierend):** TSE-Anbieterwahl (Procurement) + StB-Gegenzeichnung.

### B7 · Kostenstellen — Kap. 37.1 · **M**
- **Schema:** `CostCenter` (nummer, name) + `costCenterId?` an `Invoice`/`PurchaseOrder`/`TimeEntry`.
- **Shared/API:** Zuordnung + Auswertung in `reporting.ts`/`postcalc`.
- **Tests:** `reporting.test.ts` — Auswertung je Kostenstelle.
- **Gate:** G1-konform (Auswertung, keine Buchung). **Abh.:** keine. **Klärung:** Kostenstellen-Schlüssel mit StB/Addison abstimmen.

### B17 · Notbetrieb & Resilienz (Server-/Internet-Ausfall) — K-17 · Kap. 27 · **L · Muss (hochpriorisiert)**
- **Ziel:** Der kritische Pfad **Produktion + Versand** läuft bei (a) Internet-Ausfall am Standort und (b) Cloud-/Server-Ausfall weiter; nach Wiederanlauf saubere Nacherfassung.
- **Failure-Modus A — Internet am Standort weg, Cloud erreichbar:** Produktionszettel + Lieferscheine als PDF **vorab generiert/gedruckt** (vorhanden: `production-sheet-pdf`); **täglicher Offline-Export** offener Aufträge (PDF/CSV-Bundle) → Produktion arbeitet ohne Netz, Rückmeldungen werden nacherfasst.
- **Failure-Modus B — Cloud/Server-Ausfall:** definierte **RPO/RTO-Ziele**, automatisiertes Backup (Postgres PITR), dokumentierte **Restore-Prozedur** + Notfall-Runbook.
- **Wiederanlauf/Reconciliation:** vorhandene **Outbox/IntegrationLog** liefert ausstehende Shop-/Versand-Events nach; nacherfasste Produktionsrückmeldungen werden **idempotent** eingespielt (Idempotenzschlüssel).
- **Schema/Code:** `modules/continuity/continuity.service.ts` (Offline-Export-Bundle, idempotente Nacherfassung); Idempotenzschlüssel an Rückmeldungs-Eingängen.
- **Doku:** Notfall-Runbook in `docs/verfahrensdokumentation/` Abschnitt 4 (Betrieb) — **füllt K-17**.
- **Tests:** `continuity.test.ts` — Offline-Bundle enthält alle produktionsrelevanten Pflichtfelder; doppelte Nacherfassung bleibt idempotent.
- **Abh.:** B1 (Runbook), B3. **Gate:** Kap. 27 Betrieb. **Entscheidung (Default vorgeschlagen):** RPO ≤ 1 h / RTO ≤ 4 h — TEXMA bestätigt Zielwerte.

---

## Sprint 5 — Termin/Status/Vorgangs-Vervollständigung (P2)
*Ziel: Should-Anforderungen und Konsistenz der Vorgangskette schließen.*

### B8 · Angebot: Verfallsdatum + Verlustgrund — Kap. 35.1 · **S**
- **Befund:** `Quote.wiedervorlageAm` + Status `NACHFASSEN/ABGELEHNT` existieren.
- **Schema:** `gueltigBisAm DateTime?` + `verlustgrund String?` an `Quote`.
- **Shared/API:** Verfall → Wiedervorlage via `DueItem`; bei `ABGELEHNT` Pflichtgrund.
- **Tests:** `pricing.test.ts`/quote-Service — abgelaufenes Angebot, Ablehnung mit Grund.
- **Abh.:** keine.

### B9 · Auftrag: zugesagter Liefertermin + Rückwärtsterminierung — Kap. 35.2 · **M**
- **Befund:** `Order` ohne Termin; `OrderStatus` endet bei `VERSENDET`.
- **Entscheidung K-26 = ja:** `OrderStatus` um **`FAKTURIERT`** und **`ABGESCHLOSSEN`** erweitern (Vorgangskette bis Faktura/Abschluss vollständig). Statusautomat in `docs/domänenmodell.md` (B2) nachziehen.
- **Schema:** `zugesagterLiefertermin DateTime?` an `Order`; OrderStatus-Erweiterung (s. o.).
- **Shared:** `scheduling.ts` — Rückwärtsterminierung aus Liefertermin − Durchlaufzeiten (`FinishingTargetTime`).
- **Tests:** `scheduling.test.ts` — Starttermin korrekt zurückgerechnet; Statusübergänge bis ABGESCHLOSSEN.
- **Abh.:** B2 (Statusmodell dokumentieren). 

### B10 · Mahnwesen: Mahntext/Mahngebühr/Mahnhistorie — Kap. 9.5 · **M**
- **Befund:** `dunning.ts` (T-14) erzeugt Stufen, aber keine Persistenz/Gebühr/Text.
- **Schema:** `DunningNotice` (openItemId, stufe, gebuehrCents, textVorlage, erzeugtAm) — Historie append-only.
- **Shared:** `dunning.ts` erweitern: Gebühr je Stufe, Textvorlage.
- **Tests:** `dunning.test.ts` — Stufe 1/2/3 mit Gebühr + Historieneintrag.
- **Abh.:** keine. **Gate:** Historie GoBD-konform (kein Update).

### B11 · Reklamation: Folge-Vorgang erzeugen — Kap. 20 · **S–M**
- **Befund:** `Complaint.followUp` (NACHPRODUKTION/EXPRESS/GUTSCHRIFT) + `CreditNote` existieren — **nur die Aktion fehlt**.
- **Shared/API:** `reklamation.service.ts` — aus `followUp` automatisch Nachproduktions-`Order` **oder** `CreditNote` erzeugen, mit Kostenträger (`costBearer`).
- **Tests:** `reklamation.test.ts` — je followUp-Typ korrekter Folgevorgang + Kostenzuordnung.
- **Abh.:** keine.

### B12 · DSGVO Sperr-/Löschkonzept — Kap. 28 · **M**
- **Ziel:** Löschanspruch vs. GoBD-Aufbewahrung — **Sperren statt Löschen** für aufbewahrungspflichtige Belege.
- **Schema:** `gesperrtAm`/`anonymisiertAm` an `Company`/`Contact`; Audit-Eintrag.
- **Shared:** `privacy.ts` — Anonymisierung von Stammdaten ohne Belegintegrität zu brechen.
- **Tests:** `privacy.test.ts` — Kontakt anonymisiert, Rechnung bleibt unveränderbar.
- **Entscheidung:** Richtung **Sperren/Anonymisieren statt Löschen** ist gesetzt (rechtskonform). Fristenmatrix als Begleitschritt mit StB gegenzeichnen — **nicht blockierend**.
- **Abh.:** B1 (Doku-Abschnitt IKS). **Gate:** G2 (WORM) + DSGVO.

---

## Sprint 6 — Could/Future (P3, bewusst nachgelagert)
*Erst nach Stabilisierung der Muss/Should-Basis; je eigenes Mini-Konzept vor Bau.*

| ID | Item | Kapitel | Aufwand | Notiz |
|---|---|---|---|---|
| B13 | Kundenportal (Self-Service Aufträge/Status) | 36 | L | eigener Auth-Scope, RBAC-Erweiterung |
| B14 | KI-Freitexterfassung Anfrage→Angebot | 22.2 | L | Claude-API; Prompt+Validierung; Mensch-Freigabe |
| B15 | Lead/Interessent (Pre-Company) | 18.1 | M | leichter Entitätstyp vor `Company` |
| B16 | Inventur (Bestandskorrektur mit Beleg) | 37.1 | M | append-only Korrekturbeleg, kein Direkt-Edit |

---

## Abhängigkeits- & Sequenzlogik
- **B3 zuerst** (Test-Lane) — danach laufen alle neuen `int.test.ts` automatisch grün-geprüft.
- **B1/B2** parallel möglich (reine Doku), idealerweise vor Sprint 4, damit Doku mit jedem Feature mitwächst.
- **B6 (Kasse)** ist **nicht mehr geblockt** — wird TSE-/DSFinV-K-konform gebaut; offen bleibt nur die TSE-Anbieterwahl (parallel beschaffbar).
- **B9** ist durch **K-26 = ja** entschieden — OrderStatus wird um FAKTURIERT/ABGESCHLOSSEN erweitert.
- **B17 (Notbetrieb)** ist hochpriorisiert in Sprint 4; Default RPO/RTO vorgeschlagen, läuft sonst ungeblockt.
- Alle übrigen Items sind unabhängig und nach fachlicher Priorität schiebbar.

## Klärungen (Register) — Stand 2026-06-21
| Ref | Frage | Entscheidung | Status |
|---|---|---|---|
| **K-26** | OrderStatus FAKTURIERT/ABGESCHLOSSEN nötig? | **Ja** — beide Status ergänzen (B9) | ✅ entschieden |
| **TSE** | Kassensicherungs-/DSFinV-K-Pflicht | **rechtskonform = pflichtig** — TSE/DSFinV-K von Anfang an (B6) | ✅ entschieden; Anbieterwahl offen |
| **DSGVO** | Lösch-/Sperrkonzept | **rechtskonform = Sperren/Anonymisieren statt Löschen** (B12) | ✅ entschieden; Fristenmatrix mit StB |
| **K-17** | Notbetrieb Server-/Internet-Ausfall | **wichtig** → eigenes Muss-Item **B17** | ✅ eingeplant; RPO/RTO-Zielwerte bestätigen |
| K-01 | AddisonOne-Import des DATEV-Exports (T-07 End-to-End) | extern, nicht in-repo testbar | ⏳ StB / extern |

## Definition of Done (je Item)
1. Unit-Tests grün (Shared + Service) · 2. Integrationstest grün (DB-Lane, B3) · 3. `typecheck` + `build` sauber ·
4. Verfahrensdoku (G4) + ggf. Domänenmodell (G2) aktualisiert · 5. GoBD-Grenzen unverletzt · 6. Commit + Push auf den Feature-Branch.
