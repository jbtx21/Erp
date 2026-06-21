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
- **Schema:** `CashSale`/`PosPayment` (orderId?, betragCents, art [BAR|EC], beleg, kassiertAm, kassierer).
- **Shared:** `pos.ts` — Beleg/Zahlungserfassung, Verknüpfung mit `OpenItem`/`Payment`.
- **API:** `modules/pos/pos.service.ts`.
- **Tests:** `pos.test.ts` — Barzahlung erzeugt Zahlungsbeleg + schließt offenen Posten.
- **⚠️ Klärung (blockierend):** **TSE/DSFinV-K-Pflicht mit Steuerberater** klären, bevor gebaut wird — kann Umfang/Architektur stark ändern. Bis dahin geparkt.
- **Abh.:** StB-Entscheid. **Gate:** GoBD/Kassensicherung.

### B7 · Kostenstellen — Kap. 37.1 · **M**
- **Schema:** `CostCenter` (nummer, name) + `costCenterId?` an `Invoice`/`PurchaseOrder`/`TimeEntry`.
- **Shared/API:** Zuordnung + Auswertung in `reporting.ts`/`postcalc`.
- **Tests:** `reporting.test.ts` — Auswertung je Kostenstelle.
- **Gate:** G1-konform (Auswertung, keine Buchung). **Abh.:** keine. **Klärung:** Kostenstellen-Schlüssel mit StB/Addison abstimmen.

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
- **Befund:** `Order` ohne Termin; `OrderStatus` ohne FAKTURIERT/ABGESCHLOSSEN (K-26).
- **Schema:** `zugesagterLiefertermin DateTime?` an `Order`; ggf. OrderStatus-Erweiterung (K-26 bestätigen).
- **Shared:** `scheduling.ts` — Rückwärtsterminierung aus Liefertermin − Durchlaufzeiten (`FinishingTargetTime`).
- **Tests:** `scheduling.test.ts` — Starttermin korrekt zurückgerechnet.
- **Abh.:** K-26 (Statusmodell). 

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
- **Abh.:** B1 (Doku-Abschnitt IKS). **Gate:** G2 (WORM) + DSGVO. **Klärung:** Fristenmatrix mit StB.

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
- **B6 (Kasse) blockiert** durch StB-/TSE-Entscheid → nicht vor Klärung einplanen.
- **B9** wartet auf **K-26** (Statusmodell-Erweiterung) — vorab mit Fachbereich bestätigen.
- Alle übrigen Items sind unabhängig und nach fachlicher Priorität schiebbar.

## Offene Klärungen (Register)
| Ref | Frage | Adressat | Blockt |
|---|---|---|---|
| K-01 | AddisonOne-Import des DATEV-Exports (T-07 End-to-End) | Steuerberater | T-07-Abnahme |
| K-17 | Notbetrieb bei Cloud-Ausfall (RPO/RTO) | TEXMA/Hosting | B1-Abschnitt 4 |
| K-26 | OrderStatus FAKTURIERT/ABGESCHLOSSEN nötig? | Fachbereich | B9 |
| TSE | Kassensicherungs-/DSFinV-K-Pflicht | Steuerberater | B6 |
| DSGVO | Aufbewahrungs-/Löschfristenmatrix | Steuerberater | B12 |

## Definition of Done (je Item)
1. Unit-Tests grün (Shared + Service) · 2. Integrationstest grün (DB-Lane, B3) · 3. `typecheck` + `build` sauber ·
4. Verfahrensdoku (G4) + ggf. Domänenmodell (G2) aktualisiert · 5. GoBD-Grenzen unverletzt · 6. Commit + Push auf den Feature-Branch.
