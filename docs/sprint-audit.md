# TEXMA-ERP — Sprint-Audit-Report

> Stand: Commit `98499e6`, Branch `claude/texma-erp-migration-zrtoab`, 2026-06-20.
> Abgleich gegen `docs/lastenheft.md` (v3.4) und verifizierten Repo-Stand.
> Methode: gemessen (Tests/Typecheck/Build) + Beleg-Suche im Code — nichts aus dem Gedächtnis.

## 0. Verifikations-Baseline (G6-Backbone)

| Prüfung | Ergebnis |
|---|---|
| **Tests** | **410 passed / 19 skipped** (audit 4, shared 205, orchestration 5, api 172, woo 7, dpd 7, supplier 7, runtime 3) |
| **Typecheck** | **11/11 Pakete sauber** (exit 0) |
| **Build** | **exit 0**, inkl. `apps/web` vite build |
| Skips | 19 = `*.int.test.ts` (Prisma-Integration) + workers-orchestration — laufen nur mit Live-Postgres. Persistenzschicht ist im Standardlauf **nicht** abgedeckt → Testschuld (Backlog P0-3). |

## 1. Gate-Compliance (nicht verhandelbare Grenzen G1–G6)

| Gate | Anforderung | Beleg | Urteil |
|---|---|---|---|
| **G1** Buchhaltungs-Grenze | Operativ + DATEV-Export, kein Hauptbuch | `packages/shared/src/datev.ts` (EXTF); kein Konten-/Buchungssatz-Modell | ✅ eingehalten |
| **G2** GoBD by Design | WORM, Append-only-Audit, alt→neu | `packages/audit`: Append-only-Sink, `ImmutableViolationError`, `Invoice.finalized`, `AuditLog(before/after)` | ✅ eingehalten |
| **G3** E-Rechnung | XRechnung+ZUGFeRD erzeugen, Eingang validieren | `einvoice.ts` (CII/Factur-X) + `einvoice-inbound.ts` (Empfang+EN16931-Validierung, K-13) | ✅ eingehalten |
| **G4** Verfahrensdoku *mitgeschrieben* | Lebende GoBD-Doku | `docs/verfahrensdokumentation/README.md` = 28-Zeilen-Stub, nicht mitgewachsen | ⚠️ Schuld — größte Gate-Lücke |
| **G5** Verständlichkeit / Bus-Faktor | ADRs, Modul-READMEs, sprechende Namen | ADR 0001/0002; Kapitel-Provenance im Schema; aber Domänenmodell nicht als Artefakt | ⚠️ teilweise |
| **G6** Verifikation-First | T-01..T-15 grün, typecheck+build sauber | s. §0 + §3 | ✅ eingehalten (Vorbehalt Integrationsschicht) |

## 2. Sprint-Reconciliation

| Sprint | Soll | Ist (Beleg) | Urteil |
|---|---|---|---|
| **0 Fundament** | Schema, Audit/WORM, Auth+RBAC, Test-Harness, Doku-Gerüst | `schema.prisma` (37 Modelle), `packages/audit`, `auth`+`rbac.ts`, T-01..T-15 als Tests, Doku-Stub, ADRs | ✅ erledigt |
| **1 Must-Kern** | Kunde/Kontakt, Varianten, Preisgruppen+Staffel, Auftrag→PA+BOM, Woo+T-01, Rechnung+E-Rechnung, DATEV | `Company/Contact`, `Variant`, `markup`/`stickerei`, `bom`/`production`, `shop-import`, `einvoice.ts`, `datev.ts` | ✅ erledigt |
| **2 Should** | Fremdvergabe T-04, Banking+Mahnwesen, Lieferanten-API, Nachkalkulation | `subproduction`, `banking`+`dunning`, `supplier-import`, `postcalc`, `three-way-match`, `shipment`, + EBICS/PSD2+PIS | ✅ weitgehend, teils über Soll |
| **Später** (Could/Future) | Muster-Leihgut, Kasse, Kundenportal, KI-Erfassung | nicht vorhanden | ⬜ offen (geplant) |

## 3. Pflicht-Testfälle T-01..T-15 (Kap. 15)

| # | Inhalt | Kanonischer Test | Urteil |
|---|---|---|---|
| T-01 | Woo→Firmenkunde (kein Mitarbeiterkonto) | `order-import.service` + `router` | ✅ |
| T-02 | Varianten-Mapping Farbe×Größe | `variants.test.ts` | ✅ |
| T-03 | Kundenspez. Stückliste | `bom.test.ts` | ✅ |
| T-04 | Mehrstufige Fremdvergabe | `subproduction.*` | ✅ |
| T-05 | Multi-Lieferant-Gate | `procurement.*` | ✅ |
| T-06 | DPD-Label + Tracking→Shop | `shipping`/`dpd`/`connector` | ✅ |
| T-07 | AddisonOne-Import des DATEV-Exports | `datev.test.ts` (Export-Logik) | ⚠️ Logik grün; End-to-End hängt an externem Addison/K-01 — in-repo nicht testbar |
| T-08 | Preisgruppe→Shop | `shop-sync.test.ts` | ✅ |
| T-09 | Statusrückmeldung „Versendet" | `shop-sync`/`order-status-handler` | ✅ |
| T-10 | Nachkalkulation DB Soll/Ist | `postcalc.*` | ✅ |
| T-11 | Produktionszettel extern (Pflichtfelder) | `production-sheet.*` | ✅ |
| T-12 | Transferdruck-Mindestlager | `reorder.*` | ✅ |
| T-13 | Banking-Abgleich | `banking-match`/`camt053` | ✅ |
| T-14 | Mahnlauf Stufe 1 + Sperre | `dunning.*` | ✅ |
| T-15 | Staffelpreis bei Mengengrenze | `stickerei.*` nur | ⚠️ grün, aber eng: nur Stickerei-Logo-Staffel. Generische Artikel-/Veredelungs-Staffel (Kap. 4.4, multiplikativ über Preisgruppe) fehlt |

## 4. Architektur-Leitplanken

| Leitplanke | Befund |
|---|---|
| Trennung Kern/Integration (Middleware, Outbox, Retry) | ✅ `OutboxEvent`+`IntegrationLog`, `services/workers/connectors/*`, `retry.ts` |
| Veredelung = Stückliste + PA, extern als Unterauftrag | ✅ `BomItem`+`SubProductionOrder` (Beistellung→Rücklauf) |
| Statuswechsel automatisch ableiten | ⚠️ teils — `OrderStatus` schlanker als Kap. 35.2 (kein FAKTURIERT/ABGESCHLOSSEN-Status; `freigegeben` als Boolean). Bewusst schlank, mit K-26 zu bestätigen |
| Shop→Firmenkunde (T-01) | ✅ strukturell erzwungen (`ShopConnector.companyId`) |

## 5. Priorisiertes Restbacklog

**P0 — Compliance-/Bus-Faktor-Schuld (klein, aber Pflicht):**
1. **G4 Verfahrensdoku** vom Stub zur echten GoBD-Doku ausbauen (wer/was/wann/wie/wo, Systembeschreibung, Zugriffskonzept, versionierte Historie).
2. **Domänenmodell** als `docs/domänenmodell.md` persistieren (Gate des Implementierungs-Prompts; G5).
3. **Integrations-Testlane** mit ephemerem Postgres in CI, damit die 19 Skips die Persistenzschicht abdecken (G6 vollständig).

**P1 — Muss-Funktionslücken (Lastenheft Kap. 37.1):**
4. **Generische Mengenstaffel** je Artikel/Veredelung, multiplikativ über Preisgruppe → T-15 vollständig (Kap. 4.4).
5. **Muster-Leihgut** mit 21-Tage→Musterrechnung-Automatik + getrenntem Musterbestand (Kap. 37.3).
6. **Bar-/EC-Kasse** Vor-Ort-Zahlung + Beleg; TSE/DSFinV-K-Frage mit StB (Kap. 37.4).
7. **Kostenstellen** (Kap. 37.1 Finanzen).

**P2 — Termin/Status-Vervollständigung (Should/Konsistenz, Kap. 35):**
8. Angebot: Verfallsdatum + Verlustgrund (35.1).
9. Auftrag: zugesagter Liefertermin + Rückwärtsterminierung (35.2).
10. Mahnwesen: Mahntext/Mahngebühr/Mahnhistorie als Vorgang (9.5).
11. Reklamations-Folgevorgang verknüpfen (20).
12. DSGVO Sperr-/Löschkonzept (28).

**P3 — Could/Future (bewusst später):** Kundenportal (36), KI-Freitexterfassung (22.2), Lead/Interessent (18.1), Inventur (37.1).

## 6. Fazit

Das System steht solide am **Ende von Sprint 2**: alle 15 Pflicht-Testfälle grün, Architektur-Grenzen G1–G3/G6 eingehalten, Kern + Should-Funktionen gebaut. Die echten Schulden liegen **an den Rändern**: lebende Verfahrensdoku (G4), Integrations-Testabdeckung, zwei Muss-Funktionen ohne Entität (Muster-Leihgut, Kasse), eng abgedeckter Staffelpreis (T-15). Zwei Vorbehalte sind extern bedingt: T-07 (Addison/K-01) und die TSE-Frage der Kasse.
