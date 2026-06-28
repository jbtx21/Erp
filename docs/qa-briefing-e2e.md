# QA-Briefing TEXMA-ERP — End-to-End-Funktionstest gegen die XENTRAL-Maxime

> **Stand:** Branch `claude/texma-erp-migration-zrtoab`, HEAD `3146d15`. Alle Datei:Zeilen-Belege sind gegen genau diesen HEAD verifiziert. Vor jeder Eskalation **am laufenden System re-verifizieren** — Zeilennummern driften durch Folge-Commits. Die Belege sind Startpunkte, keine Beweise.
> **Maxime durchgehend:** XENTRAL. Jeder Befund wird gefragt: *Wo weicht TEXMA vom Paradigma ab? Echter Defekt, UX-Hürde oder vertretbare bewusste Abweichung?*
>
> **Korrektur-Hinweis (Integrität vor Vollständigkeit):** Bei der Verifikation dieses Briefings wurden **drei im Vorentwurf/Rohbefund behauptete „Defekte" als Phantome entlarvt** und unten korrigiert: (1) der angebliche Forecast-Rundungsfehler `Math.round(prob/100)=0` **existiert nicht** — der reale Code rechnet korrekt `Math.round((valueCents × prob)/100)`; (2) der angebliche **Navigation-404** auf `#banking/#leads/…` **existiert nicht** — alle sechs Keys haben echte `case`-Routen und rendern; (3) der `auftragsampel`-**NaN-Fall ist bereits durch einen Null-Guard abgefangen**. Diese Korrekturen stehen bewusst im Briefing — ein QA-Dokument, das Phantom-Defekte als KRITISCH führt, untergräbt seine eigene adversariale Glaubwürdigkeit. Prüfe trotzdem alles selbst nach.

---

## 1. Auftrag & Haltung

Du testest das TEXMA-ERP **adversarial** und **end-to-end**. Haltung:

- **Alles belegen.** Kein Befund ohne Repro-Schritte, erwartetem Soll, beobachtetem Ist und Code-/Network-Probe. Jede Behauptung aus diesem Briefing ist eine *Hypothese*, die du am laufenden System verifizierst.
- **Am aktuellen Stand verifizieren.** Zeilennummern driften. Wenn ein Beleg nicht mehr passt, suche die Logik per Grep (z. B. `firstNewPos`, `bezugPosition`, `weightedForecast`), nicht per Zeile.
- **XENTRAL ist der Benchmark, nicht das Pflichtenheft.** TEXMA ist ein eigener modularer Monolith (kein Odoo/Frappe). Manche Abweichungen sind bewusst und vertretbar (append-only `StockMove` statt direkter Bestandssetzung — das ist *besser* als Xentral). Andere sind echte Defekte (Doppel-Bestellung ohne Idempotenz). **Klassifiziere jeden Befund** in: `DEFEKT` / `UX-HÜRDE` / `VERTRETBARE ABWEICHUNG`.
- **Geld ist heilig.** Jeder Cent-Pfad, jede Rundung, jede USt-Aggregation wird mit Grenzwerten beschossen (1 Cent, 0 €, Mischsteuer, 100 % Rabatt, 100 Kleinstpositionen).
- **GoBD ist nicht verhandelbar.** Append-only, lückenlose Nummernkreise, WORM-Archivierung, Audit je Mutation. Lücken hier sind immer mindestens HOCH.
- **Phantom-Befunde sind auch Befunde.** Wenn ein vermuteter Defekt am Code widerlegt wird, dokumentiere die Widerlegung samt Beleg — nicht stillschweigend fallenlassen.

**Die drei schwersten Generalbefunde vorab (wenn du nur 3 Dinge prüfst):**

1. **Akkumulierte USt-Rundung → Steuer 0 bei vielen Kleinstpositionen.** 100 Positionen à 1 Cent / 19 % → je Zeile `round(0.19)=0` → Gesamtsteuer **0 statt 19 ct**. Echter USt-Falschausweis (GoBD!). Kein Test für n≫2 (`invoice.test.ts` prüft nur 2 Positionen). → **KRITISCH**, Test `INV-ROUND-100`.
2. **Keine automatische Verbrauchsbuchung bei Lieferung/Versand.** Das Ledger bleibt stehen, Reservierung wird nur bei Storno freigegeben (`router.ts:355`) → der Bestand divergiert systematisch von der Realität. → **KRITISCH**, Test `TST-012`.
3. **Veredelungsbezug-Ummapping verliert die Bindung bei Alternativpositionen** (`sales-order.service.ts:187-193`) → **KRITISCH**, Fachfehler, Test `QT-04`. **Plus:** `createPurchaseOrders` ohne Idempotenz + Timestamp-Nummer (`prisma-reorder.repository.ts:76-80`) → Doppelklick = Doppelbestellung, **KRITISCH**, Test `DT-REORDER-001`.

---

## 2. Setup & Kontext

### Lokal starten
```bash
pnpm install
pnpm build          # muss grün sein
pnpm typecheck      # muss grün sein
pnpm test           # vitest; Basis muss grün sein
# Integrationstests sind gated:
RUN_DB_TESTS=1 pnpm test     # gegen echtes Postgres
RUN_REDIS_TESTS=1 pnpm test  # Outbox-Relay / BullMQ
```
- `apps/api` (Fastify + tRPC + Prisma), `apps/web` (React + Mantine + Vite), `packages/shared` (IO-freie Domänenlogik), `packages/db` (Prisma + handgeschriebene SQL-Migrationen), `packages/audit` (GoBD-Audit-Trail), `services/workers` (Connectoren + Outbox-Relay).
- **DB seeden:** Achte darauf, dass Nummernkreise (`CUSTOMER`, `ORDER`, `INVOICE`, `ABSCHLAG`, `CREDIT_NOTE`, `PRODUCTION_ORDER`, `SAMPLE_INVOICE` falls vorhanden) und die `STANDARD`-Preisgruppe (`kind='STANDARD'`) angelegt sind — fehlen sie, schlagen Lead-Konvertierung und Faktura mit harten Errors fehl.

### RBAC-Rollen
Vier Rollen: **ADMIN / BUERO / BUCHHALTUNG / PRODUKTION**. Teste jeden Workflow mit mindestens zwei Rollen:
- **PRODUKTION** sieht keine Preise → `redactOrderForRole` setzt `totalNetCents = null` (`shared/rbac.ts`). Verifiziere das **auf Datenebene** (Network-Response), nicht nur in der UI — die Redaktion ist *manuell* je Endpoint aufgerufen, kein Middleware-Zwang (`router.ts:308`). Such nach Endpoints, die `redactOrderForRole` *vergessen*.
- `supplierRoles = [ADMIN, BUERO, BUCHHALTUNG]` vs. `allRoles`. Finanz-Endpoints (`quotes.*`, `invoices.*`, `reporting.*`, `print.invoice`, `opportunity.*`) müssen für PRODUKTION 403 werfen. Belege/PDF ohne Preise (`print.deliveryNote`, `productionSheet.render`) sind `allRoles`.
- **Achtung Silent-Fallback statt 403:** Manche Endpoints liefern für PRODUKTION ein leeres Array statt einer 403 (z. B. `ampel.auftragsampel`, siehe `T-AMP-010`). Das ist kein „Schutz", sondern verdeckter Datenfluss — prüfe jeden Finanz-Read auf hartes Gate vs. stille Leere.

### DevTools / Network-Probing
- **tRPC-Calls** im Network-Tab inspizieren: Bei jeder Mutation prüfen, ob ein zweiter (Doppelklick-)Call durchgeht → Idempotenz.
- **Outbox**: Nach `confirmShipped`/`transition(VERSENDET)` die `OutboxEvent`-Tabelle prüfen (`type='order.status.update'`). Doppel-Events sind ein Befund.
- **Audit-Log** (`audit_log` Tabelle) nach jeder Mutation abfragen: `entity`, `entityId`, `action`, `before`/`after`. Erwartete Eintragszahl je Workflow festlegen (siehe `AUDIT-001`: CREATE + 3× UPDATE = 4).
- **PDFs** base64-decodieren und auf Preisfelder / fehlende Attribute (leere Größe) durchsuchen. Bei E-Rechnung das eingebettete CII-XML extrahieren und gegen EN16931 validieren.
- **Deep-Links / Hash-Routing:** Direkt `#banking`, `#leads`, `#opportunities`, `#zahlungen`, `#finance` in die URL tippen → **erwartet: die jeweilige Seite rendert** (alle sechs haben `case`-Routen in `App.tsx:410/413/430/453/454/457`). Tippe einen *unbekannten* Hash (z. B. `#gibtsnicht`) → erwartet: `EmptyState` „Seite nicht gefunden" (`App.tsx:458-462`), **kein** App-Crash. Siehe Kap. 6.5 für die korrigierte Navigations-Analyse.

---

## 3. Das komplexe Szenario „Bergblick Outdoor GmbH"

Ein einziger, durchgehender Testfall, der fast jeden kritischen Pfad berührt. Lege ihn vollständig an und verfolge ihn bis zur Mahnung **und bis zum Banking-/DATEV-/E-Rechnungs-Export**.

**Kunde:** Bergblick Outdoor GmbH (Neukunde → über Lead/CRM anlegen, KD-Nummer prüfen).

**Anfrage (5 Textilien + Veredelung):**
| Pos | Artikel | Menge | Veredelung | Ausführung |
|-----|---------|-------|------------|------------|
| 1 | Softshell-Jacke Navy | 50 | Siebdruck Brust | **extern** (Veredler A) |
| 2 | Polo Rot | 80 (Größenlauf S/M/L) | Stickerei Brust | **extern** (Veredler B) |
| 3 | T-Shirt Weiß | 195 (200 − 5 Muster) | Transferdruck | **inhouse** (Material vom Transfer-Lieferant) |
| 4 | **Hoodie** Schwarz | 40 | Siebdruck Rücken **+** Stickerei Brust | **gemischt sequenziell** (extern A → extern B, gleiches Textil) |
| 5 | Cap | 30 | — | Freitext-Position |

**Die Härtefälle, die dieses Szenario erzwingt:**

- **Hoodie (Pos 4): zwei Veredler am selben Textil → strikt sequenziell.** `beistellPositionen=[4]` für beide Stufen → `canStartStage` muss S2 blockieren bis S1 zurück ist (`shared/subproduction.ts:109`, Test `T-04-003`). **Gegenprobe:** Polo (B) und Softshell (A) haben disjunkte `beistellPositionen` ([2] vs. [1]) → dürfen **parallel** laufen (`T-04-002`).
- **Inhouse-Transfer (Pos 3) läuft erst nach externem Rücklauf am selben Textil** (`completeInhouse`, `T-04-010`). Material wird beim Transfer-Lieferanten beschafft + auf Lager `TRANSFERDRUCK` reserviert (`transfer-sourcing.service.ts:55-81`, `TST-015`).
- **Größenlauf (Pos 2):** Eine Quote-Position → 3 Auftragszeilen (S/M/L). Beim Wandeln muss der Veredelungsbezug auf die **erste** Größenzeile ummappt werden (`ConvertQuote_SizeRun`, `QT-08`). **Schwund-Falle:** Größenlauf mit qty=0 in einzelnen Zeilen wird *still gefiltert* (`sales-order.service.ts:168`), kein Fehler → Position verschwindet lautlos.
- **5 Muster → 195:** Muster-Leihe (`SampleLoan`) subtrahiert vom Bedarf: `required += source==='LOAN' ? -qty : qty` (`reorder.ts:94`). Erwartung: requiredQty=195, orderQty=187 (abzgl. 8 Bestand) — `DT-REORDER-003`. **Achtung:** Diese Muster-Leihe ist ein `issueMulti`-Kandidat → triggert den dueDate-Bug (`T-SAMPLE-002`).
- **Schwund:** Beistellmenge 50 → Rücklaufmenge 47 erfassen (`RUECKLAUF_ERHALTEN`, Pflicht). `ruecklaufMenge ≤ beistellMenge` validieren (`T-04-004`). Yield = 47/50 = 94 %.
- **Teillieferung:** 195 bestellt, 100 geliefert → Lieferstatus TEIL. **Achtung:** `confirmShipped`/VERSENDET setzt `lieferstatus=VOLL` **hart** (`prisma-shipment.repository.ts:58`), unabhängig vom echten Lieferschein — Konsistenzbefund (`TST-012`, Versand-Kap.).
- **Abschlag:** 30 % Anzahlung auf den Auftragswert → Abschlagsrechnung. **Compliance-Falle:** Abschlag hat **keinen PDF-Generator** und wird **nicht WORM-archiviert** (`ARC-001`, `ARC-002`).
- **Freitext (Pos 5):** Cap ohne Variante → beim Wandeln `materializeArticle` mit SKU `{OrderNumber}-P5` (`TST-014`). Neue Variante ist `bestandsgefuehrt=false` per Default → **keine** Auto-Reservierung trotz `convertQuote` (`TST-014`-Erweiterung, subtile Wechselwirkung).
- **Zahlungseingang & Export (neu im Szenario):** CAMT.053-Import der Restzahlung → Banking-Match auf RE-Nummer → Allokation; danach DATEV-Buchungsexport der Rechnung (BU-Schlüssel) und E-Rechnung (CII-XML) erzeugen. Gutschrift-Fall: prüfe Vorzeichen in DATEV (`datevAmount` `Math.abs` → Vorzeichenverlust, `DATEV-001`).

Halte für jeden Schritt fest: Belegnummer (sprechend?), Status-Maschine (legal?), Audit-Eintrag (vorhanden, Anzahl?), Cent-Summen (korrekt?), Belegkette (klick-navigierbar?), Export-Korrektheit (DATEV-BU, E-Rechnung-XML, SEPA-CtrlSum).

---

## 4. End-to-End-Workflow je Stufe (A–K)

Pro Stufe: konkrete Schritte → Soll-Zustand → eingebettete „Tief prüfen / Edge-Cases"-Liste.

---

### A — CRM / Vertriebspipeline (Lead → Anfrage → Angebot → Verkaufschance)

**Schritte:** Bergblick als CrmLead anlegen (NEU). Qualifizieren (→ KONTAKTIERT → QUALIFIZIERT). Positionen im LinesEditor erfassen (Freitext + Variante). `convertToQuote` → Quote mit AN-Nummer. Parallel: Verkaufschance (Opportunity) anlegen und durch die Phasen führen.

**Soll:** CrmLead in Statusmaschine (lineare Übergänge, NEU→VERLOREN-Shortcut erlaubt), atomares Gate beim Wandeln, Audit je Mutation, Quote mit AN-JJJJ-NNNN.

**Tief prüfen / Edge-Cases:**
- `CRM-001` **KRITISCH** — Doppel-`convertToQuote` parallel: zweiter Call `gate.count==0` → Error „bereits überführt". **Keine** zwei Quotes, keine Nummern-Dublette. Probe: `SELECT count(*) FROM Quote WHERE companyId=...` = 1.
- `CRM-002` **HOCH** — Parallele `advance(KONTAKTIERT)` + `advance(QUALIFIZIERT)` von NEU: **kein Optimistic-Lock**, `stateMachine.assert()` prüft nur die *geladene* Stage, nicht den DB-Stand zum Update-Zeitpunkt → nicht-deterministisches Ergebnis (Last-Writer-Wins). DEFEKT (Praxis-Likelihood niedrig, aber real).
- `CRM-003` **KRITISCH** — `convertToQuote` ohne Firma → exakte Message „Überführung in ein Angebot erfordert eine zugeordnete Firma." Kein Quote erzeugt. UX-Hürde: kein inline Quick-Action zum Firma-Zuordnen.
- `CRM-004` **HOCH** — JSON-lines-Roundtrip: lines persistieren als JSON, beim Wandeln zu echten QuoteLines (position kontinuierlich 1,2,3…, taxRatePct-Fallback 19). Keine Dubletten.
- `CRM-005` **MITTEL** — VERLOREN ohne Grund / nur Whitespace → Error „Verlust-Grund ist Pflicht.", getrimmt; gültiger Grund auditiert.
- `CRM-006` **MITTEL** — **CRM-Statemachine Sackgassen explizit:** `GEWONNEN`/`VERLOREN` sind Endzustände — jeder Folge-Übergang (`advance`, `convertToQuote`) → Error/blockiert. `NEU→ANGEBOT`-Sprung (Überspringen von Zwischenphasen) → blockiert. Test: Endzustand → beliebiger Übergang → muss werfen.
- `INQ-001` **KRITISCH** — Mail-Idempotenz: zweiter `pollInbox` derselben Mail (`externalRef`) → `skipped`, keine Dublette. **Aber:** `inquiryExists()→create` ist **nicht atomar** (`mail.service.ts:45`) — Race bei schnellem Sync möglich (unique-Constraint fängt's, aber roher DB-Fehler statt sauberem Handling).
- `INQ-002` **HOCH** — Company-Match nur exact (`matchCompanyByEmail`): `procurement@acme.de` matcht nicht `info@acme.de` → companyId=null. Datenqualitäts-Schwäche, viele unzugeordnete Anfragen.

**Verkaufschancen / Opportunity-Pipeline (NEU — im Vorentwurf komplett fehlend):**
- `OPP-FORECAST` **MITTEL** *(Phantom-Korrektur — KEIN Rundungs-Defekt!)* — Der Rohbefund behauptete einen Bug `Math.round(prob/100)=round(0.4)=0`. **Verifiziert: dieser Code existiert nicht.** `weightedForecast` (`shared/opportunity.ts:29-33`) rechnet korrekt `sum + Math.round((o.valueCents * clampPct(o.probability)) / 100)`. Bei value=100000 ct, prob=40 → `round(100000*40/100)=40000` ct. **Korrekt.** *Der reale, verbleibende Befund:* **Akkumulations-Drift bei vielen kleinen Chancen** — je Chance wird einzeln gerundet, dann summiert; bei 3× value=1 ct / prob=33 % → je `round(0.33)=0` → Forecast 0 statt ~1 ct. Außerdem `pipelineByStage` (`:44-55`) rundet pro Stage-Bucket separat → Bucket-Summen ≠ Gesamt-Forecast bei Kleinstwerten. Test: 100 Chancen à 1 ct → Forecast-Konsistenz prüfen.
- `OPP-001` **HOCH** — **`mirror()` Hubspot-Sync ohne try/catch** (`opportunity.service.ts:112-116`). `markWon` (`:91-94`) macht erst `repo.update(status=GEWONNEN)`, dann `mirror(id)` → `upsertDeal`. Bei Hubspot-Fehler wirft `HubspotCrmProvider.upsertDeal` (`hubspot-provider.ts:35` `if (!res.ok) throw`) → lokale DB ist bereits auf GEWONNEN, Hubspot driftet, **kein Rollback, kein Retry, keine Outbox**. Externer Konsistenz-Defekt (analog zur Outbox-Maxime: externe Syncs sollen *nicht* synchron im Request laufen — hier tun sie es trotzdem). Repro: `fetchImpl`-Stub, der wirft → `markWon` lokal erfolgreich, Provider-Ausnahme verschluckt/propagiert prüfen.
- `OPP-002` **HOCH** — **Doppelabschluss blockiert:** `markWon`/`markLost`/`setProbability` rufen `requireOpen()` (`:105-110`) → nach erstem `markWon` werfen alle Folge-Mutationen „Verkaufschance ist bereits abgeschlossen." Test: `markWon` → `markLost` → muss werfen, Status bleibt GEWONNEN.
- `OPP-003` **HOCH (GoBD)** — **Opportunity hat keine sprechende Nummer** (nur CUID, `schema.prisma:1990ff`). Gehört in die GoBD-Traceability-Lücke (Kap. 6.4) neben CrmLead/SampleLoan/Mahnung.
- `OPP-004` **MITTEL** — Leerfall: `weightedForecast([])=0`, `pipelineByStage([])` → 4 Buckets mit count=0/value=0. Defensiv, kein Crash.
- `OPP-005` **MITTEL** — `markLost` setzt `probability=0` (`:101`); `advance`/`setStage` hebt prob via `Math.max(o.probability, defaultProbabilityForStage(stage))` (`:77`) — Phasenwechsel kann prob nur erhöhen, nie senken. Prüfen, ob das fachlich gewollt ist (Rückstufung in frühere Phase behält hohe prob).

**XENTRAL-Verdikt A:** **DREI parallele Funnels** (CrmLead / Lead B15 / Inquiry B20) **+ Opportunity** = `HOCH`-Gap. Xentral hat *einen* Funnel mit L-Nummern. CrmLead/Lead/Opportunity haben **keine sprechende Nummer** (nur CUID) → GoBD-Traceability schwach (`HOCH`). Pipeline ist Zahlenkästen statt Kanban-Drag-Drop, AutoTable ohne Stage-Filter (`MITTEL`). Hubspot-Sync synchron statt über Outbox (`HOCH`, verletzt die Outbox-Maxime aus CLAUDE.md).

---

### B — Angebot (Quote): Erfassung, Status, Verfall

**Schritte:** Quote anlegen (≥1 Position, ENTWURF). VERSENDET (0-€-Guard, WORM-Archiv). Gültigkeitsfrist → Wiedervorlage. `convertQuote` → Auftrag.

**Soll:** AN-Nummer, Status-Maschine ENTWURF→VERSENDET→NACHFASSEN→ANGENOMMEN/ABGELEHNT, Alternativpositionen zählen **nicht** in `buildQuoteTotals`, Deckungsbeitrag getrackt.

**Tief prüfen / Edge-Cases:**
- `QT-01` **KRITISCH** — Quote nur mit Alternativ-Position (Netto=0) → VERSENDET muss „Angebot ohne werthaltige Position" werfen. Probe: `buildQuoteTotals` `!isAlternative`-Filter (`quote.service.ts:142-149`).
- `QT-04` **KRITISCH** — **Der Hoodie-Killer.** Pos1 Textil, Pos2 Textil-Alternative, Pos3 Veredelung bezug→1, Pos4 Veredelung bezug→2. Beim Wandeln wird Pos2 (Alternative) gefiltert → `firstNewPos[2]` nie gesetzt → Pos4 `bezugPosition=null` → **Veredelung ungebunden**. DEFEKT. Beleg `sales-order.service.ts:189-193`. Der Test 50-59 prüft nur Happy Path. Probe: nach `convertQuote` `SELECT bezugPosition FROM OrderLine WHERE …veredelung` = NULL (Bug) statt verweisend auf die materialisierte Textilzeile.
- `QT-02` **MITTEL** — Rabatt-Rundung: Listenpreis 9,99 € − 1 % → 9,8901 → **989 Cents** (`quote-totals.ts:34-36`, `Math.round`). **Erweiterung `QT-02b` HOCH:** `effectiveUnitNet = Math.round(listNetCents*(1-pct/100))` — `pct/100` ist Float-Zwischenwert. **Grenzfall 100 % Rabatt:** unitNetCents=0 (Giveaway) — ist das erlaubt? Test: pct=100 → Position mit 0 ct erzeugbar, fließt mit Netto 0 in Totals. pct=33.333 → Float-Drift prüfen.
- `QT-06` **HOCH** — Verfall-Idempotenz: `expireOverdue` zweimal → erste 1 DueItem, zweite 0 neue (`prisma-quote.repository.ts:91-107`, `has`-Set). **Aber:** `createExpiryDueItem` ist **nicht best-effort** (`quote.service.ts:173-182`) — wirft → propagiert → bricht den Lauf für nachfolgende Angebote. DEFEKT (vgl. `autoArchive`, das best-effort ist).
- `QT-08` **MITTEL** — Größenlauf-Expansion: 200 → 3 Auftragszeilen (50/80/70), Veredelung auf Pos 1 ummappt. Leerfall: alle Größen qty=0 → Position **still gefiltert** beim Wandeln, kein Fehler (siehe Schwund-Falle Kap. 3).

**XENTRAL-Verdikt B:** QuotesPage = 11 feste Spalten, **kein** Spalten-Umschalter, **keine** gespeicherten Ansichten, **keine** Bulk-Aktionen, **keine** Checkbox-Spalte (`pages.tsx:2760-2788`) → `MITTEL`. Größenlauf-Matrix erlaubt qty=0, Error erst beim Wandeln (`NIEDRIG`).

---

### C — Auftrag (Vertrieb / Auftragsmanagement)

**Schritte:** Auftrag aus Quote (oder Shop-Import T-01, oder manuell). Status-Maschine ANGELEGT→IN_BEARBEITUNG→IN_PRODUKTION→VERSANDBEREIT→VERSENDET→FAKTURIERT→ABGESCHLOSSEN. Editor-Freeze ab VERSENDET. Auftragsampel (10 Checks).

**Soll:** AB-Nummer, T-05-Produktionsstart-Gate (Wareneingang vollständig), Auto-Lieferschein bei VERSENDET, Rückwärtsterminierung (B9), Fast-Lane, Belegkette.

**Tief prüfen / Edge-Cases:**
- `T-01_Idempotenz` **KRITISCH** — Doppelter Shop-Import gleicher `externalNumber` → `created=false`, gleiche order.id, count bleibt 1. **Aber:** HTTP-Request-Racing kann doppelten INSERT versuchen (unique-Constraint fängt, kein sauberes Handling).
- `T-05_ProductionGate` **KRITISCH** — IN_PRODUKTION bei unvollständigem WE (30/50) → `TRPCError CONFLICT`, Status bleibt VERSANDBEREIT (`router.ts:340`, `startGateForOrder`).
- `Versand_AutoLieferschein` **HOCH** — VERSENDET: Auto-Lieferschein über offene Mengen ist **best-effort** → bei Fehler bleibt Status VERSENDET, aber keine Lieferzeile → **inkonsistenter Lieferstatus** (`router.ts:347-356`). DEFEKT (Xentral: transaktional, kein Lieferschein → kein Statuswechsel).
- `Storno_ReservationRelease` **HOCH** — STORNIERT: `releaseByOrder` best-effort → bei Fehler bleibt Status STORNIERT, Reservierung nicht frei.
- `Editor_Freeze_VERSENDET` **HOCH** — `updateOrder` auf VERSENDET → „nur noch Storno möglich".
- `DeliverProtection` **HOCH** — Teilgeliefert 6/10, Reduktion auf 4 → Fehler (gelieferte Menge schützen); auf 8 → erlaubt.
- `Audit_Trail_Compliance` **KRITISCH** — Jede Status-Änderung, Terminierung, Fast-Lane auditiert. **Präzisiert via `AUDIT-001`:** genau **4 Einträge** (CREATE + 3× UPDATE), `after`-Felder bei allen, `before` nur bei UPDATE. Falsifizierbare Probe: `SELECT count(*), action FROM audit_log WHERE entityId=… GROUP BY action`.
- `RoleGating_PriceRedaction` **HOCH** — PRODUKTION sieht Liste ohne Preise (`router.ts:307-308`). **Präzisiert via `TC-RBAC-001`:** auf Datenebene `totalNetCents===null` in der Network-Response (nicht UI). `TC-RBAC-003`: `redactOrderForRole` mutiert das Original **nicht** (Shallow-Copy reicht für Primitive — Test muss belegen, dass das Quell-Objekt unverändert bleibt).

**XENTRAL-Verdikt C:** **QS-Gate ist nur UI-Hinweis, kein echtes Gating** — VERSENDET geht auch bei QS=OFFEN (`workflow.ts` hat keinen QS-Check) → `MITTEL`, Fachfehler. **GoBD-Archivierung asynchron/best-effort** (`router.ts:92-99`) → `HOCH`. **Auftragsbestätigung** wird nicht auto-erzeugt/archiviert bei IN_BEARBEITUNG → `MITTEL`. Liste ohne Filter/Pagination (`limit:100` hardcoded), keine Spalten-Umschalter, keine Duplikat-Submit-Protection (`pages.tsx:3661`), Größenlauf-Auflösung hat **keine Frontend-Matrix-UI** (nur API-Map) → `MITTEL`.

---

### D — Produktion & mehrstufige Fremdvergabe (T-04)

**Schritte:** Auftrag freigeben (release, K-10-Gate). PA erzeugen (`createFromOrder`, BOM expandieren, Auto-Fremdvergabe je Veredler). Laufzettel (INTERN/EXTERN). Beistellung versenden → Rücklauf buchen → Abschluss. Inhouse abschließen. Plan/Yield/Schwund.

**Soll:** PA-Nummer, sequenzielles Gate mit Parallel-Zulassung für disjunkte Textilien, Schwund/Yield erfasst, Veredelungsauftrag-Mail.

**Tief prüfen / Edge-Cases:**
- `T-04-003` **KRITISCH** — Hoodie: zwei Veredler `beistellPositionen=[4]` → S2 blockiert bis S1 zurück (`canStartStage`).
- `T-04-002` **HOCH** — disjunkte `[1]` vs `[2]` → parallel erlaubt.
- `T-04-004` **KRITISCH** — Rücklauf > Beistell (120 > 100) → Error.
- `T-04-005` **KRITISCH** — Abschluss ohne `ruecklaufMenge` → Error.
- `T-04-006/007` **HOCH** — **Yield/Schwund bei null-Mengen:** `chainYieldPercent` bei `first.beistellMenge=null` → null (kein Crash, kein 0-Division); `stageScrap=null` fließt nicht in `totalScrap`. Test: Stufe ohne erfasste Beistellmenge → Yield=null, nicht NaN/Exception.
- `T-04-010` **HOCH** — Inhouse blockiert ohne externe Vorstufe am selben Textil (`completeInhouse`).
- `T-04-011` **HOCH** — **Inhouse-Parallel-Ablehnung (subtile Pfadunterscheidung):** Inhouse-Stufe an disjunktem Textil (`Pos=[2]`) → `advanceStage` weist Inhouse **generell** ab („inhouse wird über completeInhouse erledigt"), **nicht** `canStartStage`. Der Ablehnungs-Pfad ist ein anderer als beim sequenziellen Block — Test muss beide Fehlermeldungen unterscheiden.
- `T-04-014` **KRITISCH** — Doppelreferenz auf Pos 1 → Beistellmenge **100, nicht 200** (Dedup `g.positionen.has()`, `production.service.ts:256-257`).
- `T-04-015/016/017` **KRITISCH** — Freigabe-Gate (Rabatt>Schwelle + Rolle≠ADMIN), PA ohne Freigabe blockiert, Dublikat-PA blockiert.
- `T-04-020` **HOCH** — Werktage-Rückwärtsterminierung (`subtractWorkingDays`).
- `T-04-LEER` **MITTEL** — Leerfall: `allStagesReturned([])=true` (vacuous truth) — prüfen, ob eine PA *ohne* Stufen fälschlich als „komplett zurück" gilt und Folgeschritte freigibt.

**XENTRAL-Verdikt D:** Code-Reife HOCH, Tests umfassend. UI rudimentär: **manuelle PA-ID-Eingabe** (TextInput) statt Picker über `listOpen` (`pages.tsx:5713-5716`), keine Spaltenkonfiguration, **Mengenerfassung via `window.prompt`** ohne Vorab-Validierung (`pages.tsx:5658`) → `MITTEL`, UX. Überfällig-Zeilen ohne Farb-Highlighting (`MITTEL`). Laufzettel wirft `ProductionSheetIncompleteError` ohne Feld-Feedback (`MITTEL`). Gate-Logik (Parallel vs. Sequenz) in der UI nicht erklärt (`NIEDRIG`). **Vertretbare Abweichung:** Leeres `beistellPositionen` = strikte Kette (Legacy-Kompatibilität) — bewusst, aber undokumentiert.

---

### E — Beschaffung / Bedarf → Bestellung (Reorder T-12, Multi-Lieferant T-05) + Eingangsrechnung / 3-Way-Match

**Schritte:** Reorder-Seite (3 Views: Auftragsübergreifend / Gruppiert / Mindestbestand). Bestellungen aus Mindestbestand erzeugen. Produktionsstart-Gate. Eingangsrechnung gegen Bestellung + Wareneingang prüfen (3-Way-Match).

**Soll:** Nachbestellmenge = minStock − qty; Muster-Leihen subtrahieren; je Lieferant 1 PO; WE-Vollständigkeit gated Produktion; Rechnung sperrt bei Abweichung.

**Tief prüfen / Edge-Cases:**
- `DT-REORDER-001` **KRITISCH** — **Idempotenz fehlt.** Doppelklick → **2 PurchaseOrders**. `setBusy()` schützt nur UX, nicht Business-Logic. Probe: `SELECT COUNT(*) FROM PurchaseOrder WHERE supplierId='s1' AND createdAt > NOW()-INTERVAL '1 second'` = 1 erwartet, 2 beobachtet. DEFEKT.
- `DT-REORDER-002` **HOCH** — Timestamp-Collision: `BV-${Date.now()}-${g.supplierId.slice(0,6)}` (`prisma-reorder.repository.ts:80`). ms-Genauigkeit → parallele Requests gleicher ms + gleicher Lieferant → zweiter INSERT scheitert am unique-Constraint, **kein Retry/Fallback**. Nummernkreis **nicht GoBD-lückenlos** (kein NumberingService).
- `DT-REORDER-003` **MITTEL** — Loan-Abzug 200 − 5 → 195.
- `DT-REORDER-004` **MITTEL** — Muster > Auftrag: orderQty=0, aber requiredQty=0 + sources zeigt ORDER+LOAN → **UX-Verwirrung** (`reorder.ts:104`, `Math.max(0, …)`).
- `DT-REORDER-006/009` **HOCH** — Race: parallele `belowMinStock` + `createPurchaseOrders` → Überbestand, **keine `StockReservation`** trotz vorhandener Tabelle (`schema.prisma:489`). DEFEKT.
- `DT-REORDER-007` **HOCH** — T-05 Multi-Lieferant: Start blockiert bis **alle** Komponenten da (`every(c => c.complete)`).
- `DT-REORDER-008` **MITTEL** — Leerfall: `belowMinStock` **ohne Hauptlieferant** → Vorschlag **still entfernt** (`prisma-reorder.repository.ts:68-72`), keine Warnung → Artikel fällt unbemerkt aus der Nachbestellung.

**Eingangsrechnung / 3-Way-Match (NEU — eigenes Modul, im Vorentwurf nur als Halbsatz):**
- `IIN-001` **HOCH (Geld/Fachfehler)** — **Mindesttoleranz wird bei Kleinbeträgen zur Prozent-Falle.** Der reine Matcher `threeWayMatch` (`shared/three-way-match.ts:42-59`) nutzt eine **feste** `priceToleranceCents` (Default 0). **Aber** der Service-Wrapper `incoming-invoice.service.ts:72` berechnet `const tol = Math.max(Math.round(po.expectedNetCents * 0.02), 100)`. Bei einer 10-€-PO (`expectedNetCents=1000`) → `max(round(20), 100) = 100 ct` → effektiv **10 % Toleranz**. Rechnung 10,99 € (Δ 99 ct < 100 ct) → fälschlich **GEPRUEFT** statt **GESPERRT**. Probe: PO 10 €, Rechnung 10,99 € → Status muss GESPERRT sein, ist GEPRUEFT. **Plus:** keine Obergrenze für die Toleranz; sehr große POs bekommen 2 % absolut (kann ebenfalls zu groß sein).
- `IIN-002` **HOCH** — Status-Maschine GEPRUEFT/GESPERRT: Rechnung über bestellter Menge (`invoicedQty > poQty`) → `MENGE_RECHNUNG_UEBER_BESTELLUNG`; über Wareneingang (`invoicedQty > receivedQty`) → `MENGE_RECHNUNG_UEBER_WARENEINGANG`. Beide Varianzen unabhängig prüfen (`three-way-match.ts:48-52`).
- `IIN-003` **MITTEL** — Zahlungsfreigabe nur bei GEPRUEFT; SEPA-Auszahlung gegen gesperrte Rechnung muss blockieren (Verbindung zu Kap. J SEPA-out).

**XENTRAL-Verdikt E:** **Nummernkreis nicht GoBD-konform lückenlos** (Timestamp statt `NumberingService`) → `HOCH`, GoBD. **Keine Idempotenz** → `HOCH`. **Keine Bestand-Reservation** bei Bestellanlage → `MITTEL`. **3-Way-Match-Toleranz prozentual-fragil bei Kleinbeträgen, keine Obergrenze** → `HOCH`. `SampleLoanLine.status` nicht modelliert (nur Gesamt-Leihe) → `MITTEL`. Größen-Sortierung hardcoded (`SIZE_ORDER`), keine Bulk-Auswahl, statische Tabellen ohne Drawer → `NIEDRIG`.

---

### F — Lager / Bestand (Append-Only Ledger, F4)

**Schritte:** Auftragsanlage → Auto-Reservierung. Lieferung → deliveredQty. Verbrauch. Storno → Release. Inventur. Meldebestand. Shop-Puffer.

**Soll:** Bestand = Σ(StockMove.deltaQty), niemals direkt gesetzt. Multi-Lager getrennt. Verfügbar = onHand − AKTIV-Reservierungen.

**Tief prüfen / Edge-Cases:**
- `TST-001` **KRITISCH** — Ledger append-only: kein direktes Setzen, nur Bewegungen.
- `TST-002` **KRITISCH** — Multi-Lager (HAUPT/MUSTER/SHOWROOM/TRANSFERDRUCK) völlig getrennt.
- `TST-003/004` **KRITISCH** — Reservierung verknappt Bestand sofort (verfügbar sinkt, Ledger ungeändert); Auto-Reservierung bei Auftragsanlage.
- `TST-005` **HOCH** — Meldebestand triggert nur an Flanke (Unterschreitung/Entwarnung), nicht wiederholend.
- `TST-006` **HOCH** — Inventur **nicht idempotent**: zweite Zählung gleichen Werts → delta=0 → keine Bewegung. **Aber:** versehentlich falsche zweite Zählung erzeugt zweiten Korrekturbeleg (`inventory.service.ts:32`). Datenqualitäts-Schwäche.
- `TST-010` **MITTEL** — **warehouseId-Fallback:** `wh_${lager.toLowerCase()}` Auto-Mapping; `warehouseId` verdrängt `lager` nicht. Multi-Lager-Konsistenz-Edge — prüfen, ob dieselbe Variante über `lager`-String und `warehouseId`-FK doppelt geführt werden kann.
- `TST-012` **KRITISCH** — **Lieferung ≠ Verbrauch.** VERSENDET bucht **keine** VERBRAUCH-Bewegung. Ledger bleibt +100, verfügbar bleibt 0. Manueller `stock.move` nötig. `releaseByOrder(ERLEDIGT)` setzt nur Reservation-Status, bucht **nicht** das Ledger. **Der zentrale Fachfehler des Lagermoduls.** Probe: Auftrag liefern → `SELECT SUM(deltaQty) FROM StockMove WHERE variantId=…` unverändert; Reservation-Status=ERLEDIGT, aber onHand nicht reduziert.
- `TST-013` **HOCH** — **Negativ-Verfügbar erlaubt (Repro präzisiert):** `onHand=50` + Auftrag `qty=70` → Reservierung → `verfügbar=-20`, **kein Hard-Stop**. Meldebestand triggert **nicht** auf Negativ; UI markiert nur rot (`pages.tsx:7146`). Overselling ohne Constraint.
- `TST-014` **MITTEL** — Freitext→Bestand: `materializeArticle` setzt neue Variante `bestandsgefuehrt=false` per Default → **keine** Reservierung trotz `convertQuote`. Subtile Wechselwirkung Freitext-Position ↔ Lager (siehe Pos 5 Cap im Szenario).
- `TST-015` **HOCH** — Transfer-Sourcing: Material auf Lager `TRANSFERDRUCK` reserviert (`transfer-sourcing.service.ts:55-81`).

**XENTRAL-Verdikt F:** Append-only-Modell ist **besser als Xentral** → `VERTRETBARE ABWEICHUNG` (sogar Stärke). ABER: **keine Auto-Verbrauchsbuchung** (`KRITISCH`, Fachfehler) ist die Kehrseite — Xentral bucht bei Lieferschein-Druck automatisch. **Keine Lagerstelle/Bin** (`warehouseId` nur FK, kein FEFO/LIFO/Picking) → `HOCH`. **Overselling ohne Constraint** → `HOCH`. Keine Chargen/Serien → `NIEDRIG` (für Textil vertretbar). **`SONSTIGE`-Warehouse mappt auf HAUPT** (`prisma-stock.repository.ts:29`) → Ambiguität, `MITTEL` (eigener Befund: zwei logische Lager kollabieren auf eines).

---

### G — Muster / Leihgut (SampleLoan, B5)

**Schritte:** Muster ausgeben (Abgang Lager MUSTER, DueItem +21 Tage). Rückgabe < 21 Tage (keine Rechnung). Überfällige berechnen (Listenpreis-Rechnung). PDF-Lieferschein.

**Soll:** Status VERLIEHEN→ZURUECK/BERECHNET, transaktional, Preis-Fehler bricht Massenlauf nicht ab.

**Tief prüfen / Edge-Cases:**
- `T-SAMPLE-002` **KRITISCH** — **`issueMulti` setzt `dueDate=ausgegebenAm` statt +21 Tage.** Verifiziert: `prisma-sample.repository.ts:43` → `tx.dueItem.create({ data: { …, dueDate: input.ausgegebenAm, note: "Muster/Anprobe-Rückgabe" } })` — **keine** +21-Tage-Addition. Der Einzel-`issue`-Pfad macht es **korrekt** (`:86` → `dueDate: input.dueDate, note: "Muster-Rückgabefrist (21 Tage)"`). Wiedervorlage läuft bei Sammel-Leihe sofort ab. DEFEKT. Probe: `issueMulti` → `SELECT dueDate FROM DueItem WHERE entityId=loan.id` = ausgegebenAm (Bug) statt +21 Tage.
- `T-SAMPLE-001/003` **KRITISCH** — Einzel-Leihe: 21-Tage-Frist exakt; Rückgabe vor Frist → keine Rechnung, Lager-Saldo 0.
- `T-SAMPLE-004` **HOCH** — Preispflege fehlt → `failed[]`, Nummer **nicht** verbraucht (Preis zuerst).
- `T-SAMPLE-005` **HOCH** — **Hybrid-Leihe Doppelbuchung (Repro präzisiert):** Ein Leih-Record hat **sowohl** `variantId+menge` **als auch** `lines`. `markReturned()` bucht **beide Pfade**: `variantId+menge` (`prisma-sample.repository.ts:100-104`) UND `lines` (`:106-109`) → **+6 statt +3**, **kein Transaktions-Guard** gegen die Doppelquelle. Struktur verhindert das normalerweise, aber kein Schutz. Repro: direktes DB-Insert eines Hybrid-Records (`variantId` gesetzt **und** `lines` befüllt) → `markReturned` → `SELECT SUM(deltaQty) FROM StockMove WHERE entityId=loan.id` = +6 (BUG) statt +3.
- `T-SAMPLE-007` **MITTEL** — Idempotenz: zweiter `billOverdue` → keine Dublette.
- `T-SAMPLE-008` **MITTEL** — **Midnight-UTC-Grenzfall:** 21-Tage-Frist exakt bei `T00:00:00Z` (`isSampleOverdue`). Zeitzone/Stunden-Offset → genau-21-Tage-Fall: überfällig oder nicht? Test mit `ausgegebenAm` an Tag-Grenze + `now` knapp davor/danach.

**XENTRAL-Verdikt G:** **Musterrechnungen teilen `INVOICE`-Nummernkreis** mit echten Rechnungen (`sample.service.ts:165`) → GoBD-/Reporting-Verwirrung, `HOCH`. **Keine sprechende Belegnummer** (CUID + synthetisches `MUSTER-{last6}`) → `HOCH`. SampleLoansPage ohne Filter/Überfällig-Badge/Bulk → `MITTEL`. **Multi-Leihen nicht auto-abrechenbar** (`variantId=null`-Filter) — *by-design* (Xentral würde alle Leihtypen abrechnen), aber dünn dokumentiert → `MITTEL` (der fehlende Hinweis ist der Befund, nicht die Logik).

---

### H — Versand & Tracking (T-06/T-09)

**Schritte:** Versandbereite Aufträge (`listShippable`). `confirmShipped(orderId, trackingNumber, carrier)` → VERSENDET + Outbox-Event. Shop-Push oder Tracking-Mail. DPD-Connector.

**Soll:** Filter status=VERSANDBEREIT ∧ deliveryAddressId ∧ ¬liefersperre ∧ qsStatus=BESTANDEN. Transaktion: Status + Outbox.

**Tief prüfen / Edge-Cases:**
- `T-06-02/03` **KRITISCH/HOCH** — liefersperre / qsStatus≠BESTANDEN filtern aus.
- `T-06-04` **KRITISCH** — `confirmShipped` setzt VERSENDET + lieferstatus=VOLL + Tracking + Outbox-Event atomar. **Payload präzisiert:** `OutboxEvent.payload.status='VERSENDET'`, `.trackingNumber`, `.carrier`; atomar mit `lieferstatus=VOLL`. Probe: ein OutboxEvent mit exakt diesem Payload.
- `T-06-05` **HOCH** — **Doppel-`confirmShipped` → 2 Outbox-Events** (keine Idempotenz) → doppelter Shop-Push. DEFEKT. Probe: `SELECT COUNT(*) FROM OutboxEvent WHERE aggregateId=orderId AND type='order.status.update'` = 2 (Bug) statt 1.
- `T-06-06` **HOCH** — `confirmShipped` ohne Lieferadresse: speichert trotzdem VERSENDET + Tracking, ohne echtes Label → „versendeter Auftrag ohne Label".
- `T-06-10/11` **HOCH** — pushStatuses=[] → kein Push; ohne Shop + Mail → Tracking-Mail.
- `T-06-13/14` **HOCH/MITTEL** — DPD-Label-Validierung (unvollständige Adresse, weight=0).
- `T-06-19/20` **KRITISCH/MITTEL** — RBAC: nur ADMIN/BUERO.

**XENTRAL-Verdikt H:** **`DEFAULT_WEIGHT_GRAMS=1000` hardcoded** (`prisma-shipment.repository.ts:15`) — 100er-Posten als 1 kg → falsche DPD-Kosten, `HOCH`. **Kein Partial-/Multi-Parcel** (`trackingNumber` singular, `parcelCount` fest 1) → `HOCH`. **Adresse nicht vor Versand validiert** (NULL-Felder möglich) → `HOCH`. **DPD-Fehler → Status VERSENDET ohne Label** → `HOCH`. **Worker ohne Claim-Logik** → zwei Instanzen versenden parallel → `HOCH`. Doppelte Lieferstatus-Setzung (`confirmShipped` hart VOLL + `deliverRemaining`) → `MITTEL`. QS-Gate silent → `MITTEL`. Tracking-Nr. nicht validiert/nicht unique → `MITTEL`.

---

### I — Faktura / Abschlag / Gutschrift / E-Rechnung / DATEV

**Schritte:** Auftrag → Rechnung (`createFromOrder`, OP-Anlage, fakturastatus). Gutschrift neutralisiert OP. Abschlag (% / Festbetrag, Restsummen-Tracking). E-Rechnung (CII-XML) erzeugen. DATEV-Buchungsexport.

**Soll:** RE-Nummer, USt je Satz aggregiert, `orderId @unique` gegen Doppel-Faktura, Gutschrift ändert Rechnung nicht (Storno-Prinzip), E-Rechnung EN16931-valide, DATEV-BU-Schlüssel korrekt.

**Tief prüfen / Edge-Cases:**
- `INV-001` **KRITISCH** — Doppel-Faktura: zweiter Call → unique-Violation/„bereits fakturiert".
- `INV-002` **KRITISCH** — Transaktionale Konsistenz: Invoice+OP+Order-Status in einer TX, Rollback bei Mid-TX-Fehler.
- `INV-003` **HOCH** — **USt-Rounding Mischsteuer (Zahlen vollständig):** `taxByRate = [{7%, netCents=3100, taxCents=217}, {19%, netCents=1999, taxCents=380}]`, Summe `netCents=5149`, `taxCents=597`, `grossCents=5746`. Keine Cent-Rounding-Fehler; je-Satz aggregiert, nicht je Position.
- `INV-005` **HOCH** — Reverse-Charge (vatRate=0): kein 19 %-Default.
- `INV-ROUND-100` **KRITISCH (Geld/GoBD)** — **Akkumulierte Rundung → Steuer 0.** 100 Positionen à 1 Cent (19 %) → je Position `round(0.19)=0` → Gesamt-Steuer **0**, mathematisch korrekt wären 19 ct. `buildInvoiceTotals` rundet je Zeile, summiert dann (an sich korrekter Ansatz), aber **kein Summen-Level-Residual**. Kein Test für n≫2 (`invoice.test.ts` nur 2 Positionen). Probe: API-Response `taxCents` vs. mathematischer Soll-Betrag bei 100×1ct. **Echter USt-Falschausweis** — gehört in die Generalbefunde (Kap. 1).
- `GUT-001` **KRITISCH** — Vollgutschrift sperrt Doppel-Storno (`remaining<=0`).
- `GUT-002` **HOCH** — Gutschrift mit Restock=true → StockMove KORREKTUR +qty.
- `ABG-001` **HOCH** — Abschlag-Restsummen: 30 % + 50 € ok, dritter 30 € > Rest 20 € → Error.
- `ARC-001/ARC-002` **KRITISCH/HOCH** — **Abschlag NICHT archiviert** (`abschlag.create` ohne `autoArchive`, `router.ts:930-935`) und **nicht in `archive.missing`-Report**.

**E-Rechnung (ZUGFeRD/XRechnung — NEU, `shared/einvoice.ts`):**
- `EINV-001` **HOCH (GoBD/Compliance)** — XML-Validität gegen EN16931-Kernprofil (CII): `buildEInvoiceXml` (`einvoice.ts:64-113`) erzeugt `<rsm:CrossIndustryInvoice>` mit BT-1/BT-2/BT-106/BT-110/BT-112. Prüfen: `dec(cents)=(cents/100).toFixed(2)` (`:40-42`) — **kein `Math.abs`**, also Vorzeichen korrekt bei Gutschriften (positiver Punkt vs. DATEV, siehe `DATEV-001`).
- `EINV-002` **HOCH** — **Rabattblock `AppliedTradeAllowanceCharge` (BT-147/139):** nur wenn `grossUnitNetCents != null && grossUnitNetCents > unitNetCents` (`einvoice.ts:68`) → `allowance = grossUnitNetCents - unitNetCents`. **Edge:** Rabatt = 100 % → unitNetCents=0, allowance=grossUnit → ChargeAmount > 0, NetPrice=0 (gültig?). **Edge:** `grossUnitNetCents <= unitNetCents` (Aufschlag statt Rabatt) → Rabattblock entfällt still, Aufschlag wird **nicht** als `Charge` ausgewiesen → potenzieller EN16931-Verstoß. Test: Negativ-Rabatt/Aufschlag-Position → XML-Konformität.
- `EINV-003` **MITTEL** — XML-Escaping `esc()` (`:52-57`) deckt `& < >`, **nicht** `'` und `"` ab — in CII-Attributwerten (`currencyID`, `schemeID`) könnte ein `"` im Wert das XML brechen. Test: Verwendungszweck/Name mit Anführungszeichen.

**DATEV-Export (NEU, `shared/datev.ts`):**
- `DATEV-001` **HOCH (Geld/GoBD)** — **Vorzeichenverlust bei Gutschriften.** `datevAmount(cents)` (`datev.ts:81-82`) → `(Math.abs(cents) / 100).toFixed(2).replace(".", ",")` — `Math.abs` **entfernt das Minus**. Bei Gutschriften/Stornobuchungen geht das Vorzeichen verloren → falsche DATEV-Buchung (Soll/Haben-Logik muss das Vorzeichen tragen, sonst Fehlbuchung). Probe: Gutschrift -50 € → DATEV-Zeile zeigt „50,00" ohne Indikator. **Hinweis:** Der im Rohbefund genannte `euroCsv(-5000)`-Bug ist ein **Phantom** — `euroCsv` existiert im Code **nicht**; der reale Sign-Loss steckt ausschließlich in `datevAmount`.
- `DATEV-002` **HOCH** — **BU-Schlüssel-Lookup floating-point-fragil:** `rateKey = t.rate.toFixed(2)` (`datev.ts:60`). Driftet `t.rate` durch Rechenweg zu `0.19000001`, schlägt `BU_BY_RATE['0.19']` fehl; Fallback `>= 0.19` (`:65`) ist Safety-Net. Audit-Risiko bei falschem BU-Schlüssel. Test: Steuersatz aus Division ableiten → `toFixed(2)`-Stabilität prüfen. (Gegenstück in `kontenrahmen.ts:68-69` nutzt `Math.abs(rate-0.19) < 1e-9` — robuster; Inkonsistenz zwischen beiden Modulen ist ein eigener `MITTEL`-Befund.)
- `DATEV-003` **MITTEL** — Reexport-Idempotenz: zweiter DATEV-Export derselben Rechnung aus dem Archiv → keine Doppelbuchung, deterministisches XML/CSV.

**XENTRAL-Verdikt I:** **Abschlag-PDF-Generator fehlt komplett** (`print.service.ts` hat kein `abschlagPdf`) → `KRITISCH`, GoBD — Abschläge nicht WORM-archiviert, theoretisch manipulierbar. **Keine separate Invoices-Listenansicht** (`invoices.list` existiert, keine Page nutzt ihn — nur über Dunning erreichbar) → `HOCH`. **Abschlag-`setBezahlt` nur Boolean-Flag**, keine echte Payment-Allokation/Audit → `MITTEL`. Nur Vollgutschrift (keine Teilgutschrift) → `MITTEL`, by-design aber undokumentiert. **Mischsteuer-Abschlag nutzt globalen 19 %-Satz statt aufgesplittet** → `MITTEL`, Fachfehler (aber konsistent mit der USt-zentral-Maxime). **DATEV-Sign-Loss + BU-Float-Fragilität** → `HOCH`, GoBD.

---

### J — Banking / Zahlungsabgleich (T-13) + SEPA-Auszahlung + Bank-Connection

**Schritte:** CAMT.053-Import (nur CRDT). OP laden. Match (Rechnungsnummer im Verwendungszweck). Allokation. Klärungsliste. SEPA pain.001 (Auszahlung). Bank-Connection-Sync (EBICS/PSD2).

**Soll:** externalRef-Idempotenz, 1 Treffer → Allokation min(open,payment); 0/>1 Treffer → Klärung; Überzahlung → Klärung; SEPA-XML mit korrekter CtrlSum/NbOfTxs; Consent-Gating beim Sync.

**Import-Pfad (CAMT.053):**
- `T-13-001/002` **KRITISCH** — Idempotenz wiederholter Import (`existingExternalRefs` + unique). **Aber:** Check vor TX, Insert in TX → Race-Fenster (`HOCH`).
- `T-13-003` **HOCH** — Teil+Überzahlung: 12000 auf OP 10000 → alloc 10000, Klärung UEBERZAHLUNG 2000, matched=false.
- `T-13-004` **HOCH** — RE-1 + RE-11 im Ref → MEHRDEUTIG (`.includes`-Matching → Falsch-Positive).
- `T-13-007` **MITTEL (Integrität)** — **OpenItem-Cascade-Delete:** `PaymentAllocation.openItemId onDelete:Cascade` (`schema.prisma:1289`) → gelöschtes OpenItem reißt Allocation mit, Payment bleibt mit alloc-count=0 zurück (Geld „verwaist"). Test: OP löschen mit bestehender Allocation → Payment-Restzustand prüfen.
- `T-13-008` **HOCH** — **Fortschreibung über Map:** drei Zahlungen auf RE-1 (3000/4000/5000 auf 10000) → Restbeträge live als **Map** fortgeschrieben. **Reihenfolge-Abhängigkeit:** spätere Zahlungen im selben Batch sehen den fortgeschriebenen Stand; bei abweichender Verarbeitungsreihenfolge anderes Allokationsergebnis. Test: Reihenfolge permutieren → Endsaldo identisch, aber Zwischenallokationen ggf. verschieden.
- `T-13-009` **MITTEL** — Rounding: 119,99 € → 11999 Cent, OP 11900 → alloc 11900, Klärung 99.
- `T-13-011` **HOCH** — Manuelle Zahlung > openCents → **openCents negativ** (kein Min-Check).
- `T-13-010/013` **HOCH/MITTEL** — IBAN mod-97, XML-Escaping.

**SEPA-Auszahlung (pain.001 — NEU, `shared/pain001.ts`):**
- `SEPA-001` **HOCH** — `validateSepaPaymentOrder` (`pain001.ts:58-73`): MsgId/Debtor-Name Pflicht, Debtor-IBAN mod-97 (`ibanIsValid`), `requestedExecutionDate` Format `YYYY-MM-DD`, ≥1 Transfer, je Transfer Empfängername + IBAN gültig + Betrag Integer > 0 + Remittance ≤ 140 Zeichen. Test: Remittance 141 Zeichen → Error; Betrag 0/negativ → Error; ungültige IBAN → Error.
- `SEPA-002` **HOCH** — **Checksummen `NbOfTxs`/`CtrlSum`** (`buildPain001:92-93`, `paymentOrderTotalCents:76-78`): müssen Anzahl/Summe der Transfers exakt spiegeln, **doppelt** im XML (GrpHdr + PmtInf, `:119-120`/`:127-128`). Test: 3 Transfers à 1000/2000/3000 → `NbOfTxs=3`, `CtrlSum=60.00`, beide Vorkommen identisch.
- `SEPA-003` **MITTEL** — `esc()` (`:30-31`) deckt `< > & ' "` ab (vollständiger als E-Rechnung-`esc`!). `endToEndId`-Fallback `${messageId}-${i+1}` (`:97`); `agent()` ohne BIC → `NOTPROVIDED` (`:80-84`). Test: Transfer ohne BIC → `<Othr><Id>NOTPROVIDED</Id>`.
- `SEPA-004` **HOCH** — **Auszahlung gegen gesperrte Eingangsrechnung blockieren:** SEPA-Order, deren Position auf eine `GESPERRT`-Eingangsrechnung verweist (siehe `IIN-001`), darf nicht ins pain.001 gelangen. Querverbindung Kap. E.

**Bank-Connection / EBICS/PSD2-Sync (NEU, `banking/bank-connection.service.ts` + `.provider.ts`):**
- `BC-CONN-001` **HOCH** — **Consent-Gating:** PSD2-Provider hat 90-Tage-SCA-Zustimmung (`bank-connection.provider.ts:92-122`). `consentStatus(conn, now)` (`:107`) prüft `consentValidUntil`; `sync()` (`:122`) wirft, wenn `!consentStatus(...).ok`. Test: `consentValidUntil < now` → Sync wirft „Re-Consent erforderlich". Default-Consent = `now + NINETY_DAYS_MS` (`service.ts:166`).
- `BC-CONN-002` **HOCH** — **DBIT/CRDT-Filter:** Import berücksichtigt nur CRDT (Gutschriften). Provider liefert DBIT (Lastschrift/Abbuchung) → muss gefiltert/ignoriert werden, nicht als Zahlungseingang verbucht. Test: gemischter Batch CRDT+DBIT → nur CRDT erzeugt Payments.
- `BC-CONN-003` **MITTEL** — Provider-Duplikate (gleiche `externalRef` aus zwei Sync-Läufen) → Idempotenz greift (`existingExternalRefs`). EBICS-Provider (`:87`) hat `consentStatus` ohne Ablauf (Dauer-Zugang) — anderer Pfad als PSD2.

**XENTRAL-Verdikt J:** **Klärungsliste read-only** — keine Inline-Resolution, keine Bulk-Aktionen (`Banking.tsx:256-272`) → `HOCH`, UX. **`.includes`-Matching zu simpel** (RE-1/RE-11-Falsch-Positive) → `HOCH`, Fachfehler. **Keine Sammelüberweisungs-Aufsplitterung** → `HOCH`. **Negative openCents erlaubt** → `MITTEL`. **OpenItem-Cascade verwaist Allocations** → `MITTEL`, Integrität. Audit nur auf Payment-Ebene, nicht OP-Restbeträge → `MITTEL`, GoBD. Keine Plausibilitätsprüfung (Betrag vs. Rechnungsbetrag) → `MITTEL`.

---

### K — Mahnwesen (Dunning, T-14)

**Schritte:** Mahnlauf (`dunning.run`). Posten analysieren (daysOverdue, targetLevel, +1/Lauf). Atomare Eskalation + DunningNotice. WORM-Archiv. PDF/Outlook.

**Soll:** 3 Stufen, Gebühren (0/5/10 €), Mahnsperre, Optimistic-Guard `WHERE dunningLevel=N-1`.

**Tief prüfen / Edge-Cases:**
- `dun-02` **KRITISCH** — Doppelklick-Mahnlauf parallel → nur 1 Notice, zweiter `noticeId=null` (Guard, `prisma-dunning.repository.ts:42-46`).
- `dun-13` **KRITISCH** — Race: 2× `applyDunningStep` → erste count=1+INSERT, zweite count=0+null.
- `dun-04` **HOCH** — **`dunningLevel` wird nach Vollzahlung NICHT zurückgesetzt** (`dunning.ts:71` skip bei openCents≤0, aber Level bleibt 3). Semantisch widersprüchlich (offen=0, Mahnstufe=3). DEFEKT/Fachfehler.
- `dun-10` **HOCH** — Max +1 Stufe/Lauf (30 Tage überfällig, Level 0 → toLevel 1, nicht 3).
- `dun-14` **HOCH** — Mahnsperre blockt alle Posten der Firma.
- `dun-15` **MITTEL** — **Mahnbeleg-Idempotenz via SHA-256:** `autoArchive` mit deterministischem PDF → zweiter Archive-Call idempotent (gleicher Hash → kein zweiter Archiveintrag). Test: zweimal archivieren → 1 Archiveintrag, identischer SHA-256.
- `dun-08/09` **MITTEL** — Gebühren-Konsistenz; Stufe 4+ → Error.
- `dun-SCHEMA` **NIEDRIG** — **`@@unique(openItemId, stufe)` fehlt im Schema** → Eindeutigkeit nur „by Contract" über den Optimistic-Guard, nicht „by Schema". Eigener Datenqualitäts-Befund: bei Guard-Umgehung (direkter Insert) wären Doppel-Mahnstufen möglich.

**XENTRAL-Verdikt K:** **Mahnnummer nicht sprechend** (`MA-1-ABC123` statt `MA-2026-00001`, kein `number`-Feld in `DunningNotice`) → `MITTEL`. **`DunningOverviewItem` ohne companyId/companyName** (`read.ts:183-192`) → Kunde in der Liste nicht sichtbar, `MITTEL`. **Keine Automatisierung** (nur manueller Button, kein Scheduler) → `MITTEL`. Keine Filter/Bulk/Summenzeile → `MITTEL`. Mahnsperre nicht inline auf Mahnseite editierbar → `NIEDRIG`.

---

## 5. Modul-Tiefenkapitel

Pro Domäne: (a) Funktionsweise, (b) Xentral-Gap-Tabelle, (c) tiefe Testfälle, (d) vermutete Schwächen mit Code-Beleg. Querschnittsmodule (CRM/Opportunity, Quote, Auftrag, Produktion, Beschaffung/Eingangsrechnung, Lager, Muster, Versand, Faktura/E-Rechnung/DATEV, Banking/SEPA, Mahnwesen) sind in Kap. 4 abgehandelt — hier die *systemübergreifenden* Tiefenkapitel.

---

### 5.1 Stammdaten (Kunden / Lieferanten / Artikel / Matrix, B3/B6/B16)

**(a) Funktionsweise:** CompaniesPage / SuppliersPage / ProductsPage / MatrixStammPage. Kunden mit case-insensitive Dedup + sprechender KD-Nr. + Löschschutz. Artikel mit PIM-Feldern + Bestandsführungs-Flag + Varianten (Farbe×Größe). Matrix-Generator idempotent (überspringt vorhandene Combos). Lieferanten mit Katalog (SupplierItem: SKU+EK+Menge+Priorität).

**(b) Xentral-Gap:**
| Aspekt | Xentral | TEXMA | Schwere |
|--------|---------|-------|---------|
| Artikel-Status-Filter | Filter Typ/Status-Pillen | Kein Veredelung/Handelsware-Filter (`isVeredelung` nur Label) | MITTEL |
| Preise je Preisgruppe | VK staffelweise je Preisgruppe sichtbar | nur STANDARD-Gruppe (`prisma-product.repository.ts:74-92` hardcoded) | HOCH |
| Artikel-Duplikat-Check | SKU+Name+Brand fuzzy | nur Company-Dedup, kein `findBySku` | MITTEL |
| Matrix-Achsen-Duplikate | `@@unique(axis,value)` | nur Trim-Check, kein DB-Unique | MITTEL |
| Varianten-Picker-Aggregat | Artikel + Variantenanzahl | direkt Varianten-Katalog (max 50), keine Aggregation | MITTEL |

**(c) Tiefe Testfälle:**
- `M_COMPANY_001` **KRITISCH** — Dedup-Race „ACME AG"/„acme ag" parallel → genau 1 Firma. `findByName`→Numbering→insert ist **nicht atomar** → Concurrency-Risk. Probe: `count(*) WHERE name='ACME AG'`=1, Audit-Logs=1 CREATE. (Gehört auch in die Idempotenz-Tabelle 6.2 als ❌-Zeile.)
- `M_VARIANT_001` **HOCH** — **Matrix-Generator Idempotenz (Repro):** zweite Regeneration mit Überlappung → nur Neue erzeugt, vorhandene `skipped`; Dedup über `comboKey` (exact match, Farbe×Größe). Probe: 1. Lauf erzeugt N Varianten, 2. Lauf mit 50 % Überlappung → `created=N/2`, `skipped=N/2`, Gesamt unverändert.
- `M_SUPPLIER_001` **MITTEL (Datenverlust)** — **Dezimal-Parsing „9,90"** → `Number("9,90")`=NaN → ekCents=0 statt 990. Backend muss `replace(',', '.')` vor `Number()`. Probe: SupplierItem mit EK „9,90" anlegen → `SELECT ekCents` = 990 (Soll) statt 0 (Bug).
- `M_VEREDLUNG_001` **MITTEL** — Platzierungen `["","Brust","Brust",""]` → dedupliziert/getrimmt → `["Brust"]`.
- `M_BESTAND_OVERRIDE_001` **NIEDRIG** — Varianten-Override `bestandsgefuehrt=true` contra Artikel `false` → Override-Precedence, keine Konsistenz-Warnung (`prisma-product.repository.ts:69-72`).

**(d) Vermutete Schwächen:**
- **Matrix-/CSV-Import ohne TX-Rollback bei Teilerfolg** (`HOCH`) — Zeile 500/1000 scheitert → 1-499 committed, inkonsistenter State, Summary statt Fehlerzeilen-Detail. Test mit 10k-Zeilen-CSV, Fehler künstlich in Zeile 500.
- **PIM-Vollständigkeit zu einfache Heuristik** (`HOCH`) — zählt nur null-Felder, keine Geschäftsregel (Veredelung braucht Veredler+Platzierung).
- **CSV-Import keine Encoding-Validierung** (`MITTEL`) — ANSI → Mojibake bei Umlauten.
- **Bestandsführungs-Flag false→true ohne Migrations-Logik** (`MITTEL`) — Altbestand bleibt unreserviert.

---

### 5.2 Belegkette / Verknüpfungen

**(a) Funktionsweise:** Read-only-Aggregator (`links.forOrder`/`documents.forOrder`) über Prisma-ForeignKeys → einheitliche `LinkRef[]` (Angebot bis Mahnung). RBAC-korrekt (Finanzbelege für PRODUKTION ausblendbar), GoBD-Archivstatus, `pdfKind`-Dispatch.

**(b) Xentral-Gap:**
| Aspekt | Xentral | TEXMA | Schwere |
|--------|---------|-------|---------|
| Rechnung/Gutschrift/Barverkauf-Navigation | jeder Beleg öffnet als browsbare Liste | `navKey=null` — nur druckbar, nicht browsbar (`prisma-links.repository.ts:50-58`) | HOCH |
| Abschlag druckbar | alle Belege druckbar | `pdfKind` fehlt (`abschlagPdf` existiert nicht) | HOCH |
| Bestellung/WE Deep-Link | Einzelansicht | keine id/pdfKind, nur Listenseite (`:37-39`) | MITTEL |
| Anfrage/Laufzettel | in Belegkette | nur Ad-hoc, nicht verlinkt | MITTEL |
| Nachproduktion | bidirektional | nur Vorwärts-Link | NIEDRIG |

**(c) Tiefe Testfälle:**
- `BC-1` **KRITISCH** — Komplette Belegkette: alle 13+ Typen mit korrektem type/label/navKey/pdfKind/id; Finanzbelege für PRODUKTION ausgeblendet (`links.length` kleiner).
- `BC-2` **KRITISCH** — Abschlag-PDF-Dispatch: Button fehlt (`pdfKind undefined`) oder wirft 404.
- `BC-3` **HOCH** — Bestellung Deep-Link landet nur auf Listenseite ohne Parameter (kein Einzelsatz).
- `BC-4` **HOCH** — RBAC: PRODUKTION-Antwort ohne Rechnung/Gutschrift/Mahnung/Abschlag.
- `BC-5` **HOCH** — **Mehrfach-`executeFollowUp` (Reklamation→Nachproduktion), Repro:** zweimal `executeFollowUp` auf derselben Reklamation (`reklamation.service.ts:120`, `numbering.next` ohne Constraint) → wie viele Nachproduktions-Orders/Gutschriften? Erwartet 1, Risiko 2 (kein DB-Constraint gegen Duplikat-Gutschrift). Probe: `SELECT count(*) FROM CreditNote WHERE sourceReklamationId=…`.

**(d) Vermutete Schwächen:**
- **Abschlag nicht druckbar trotz druckbar-sein-sollens** (`KRITISCH`) — `prisma-links.repository.ts:42` ohne pdfKind, kein `print.abschlag`.
- **Rechnung/Gutschrift/Barverkauf Sackgassen** (`navKey=null`) (`HOCH`) — verletzt die Xentral-Maxime „jeder Beleg ist eine browsbare Liste".
- **Race in `executeFollowUp`** ohne Idempotenz (`reklamation.service.ts:120`) (`MITTEL`).
- **GoBD-Archive-Status für Abschlag undefiniert** (fehlende `sourceEntity`) (`MITTEL`).

---

### 5.3 Reporting / Dashboard / Ampel (Kap. 29, 35.4)

**(a) Funktionsweise:** Termin-Ampel (`buildAmpelOverview`), **Auftragsampel** (`auftragsampel.ts`, ~10 Checks → Gesamtlampe), Reporting (Umsatz/Margen nach Granularität+Dimension mit Periodenvergleich), Dashboard-Widgets (KPI-Katalog).

**(b) Xentral-Gap:**
| Aspekt | Xentral | TEXMA | Schwere |
|--------|---------|-------|---------|
| Ampel-Trend über Zeit | tägl. Snapshots + 7-Tage-Trend | nur aktueller Stand, keine History (`ampel.service.ts:37-39`) | HOCH |
| Ampel-Rollenfilter | PRODUKTION nur eigene PA | alle aktiven Aufträge, silent fallback statt 403 | HOCH |
| Reporting-RBAC | Marge/Kosten rollengefiltert | `ReportingService` kennt anfragende Rolle nicht | HOCH |
| Metrik-Katalog | UI-konfigurierbar | hardcoded 6 Metriken (`dashboard.service.ts:19`) | MITTEL |
| Eskalation | 1/2/3 + Trigger | nur 0/1/2, kein Trigger | MITTEL |
| Reporting-Default-Range | Last-12-Months | ohne Range = alle Zeiten (2020+2026 gemischt) | MITTEL |

**(c) Tiefe Testfälle:**
- `T-AMP-002` **KRITISCH** — **Auftragsampel-Redaktion nach Versand:** Nach VERSENDET werden Fulfillment-Checks zu GRUEN neutralisiert, **aber Zahlung + Liefersperre bleiben** → `overall=ROT` wegen genau dieser zwei (`auftragsampel.ts:154-158`). Test: versendeter Auftrag mit offener Zahlung → Gesamtlampe ROT, nicht GRUEN.
- `T-AMP-003` **MITTEL (Phantom-Korrektur)** — Der Rohbefund behauptete NaN-Risiko bei `openCents < grossCents` mit `grossCents=null`. **Verifiziert: bereits abgefangen.** `auftragsampel.ts:92` guardet explizit `if (input.openCents === null || input.grossCents === null) return {…, lamp: "GRAU"}` **vor** dem Vergleich `:94`. `null < 0` ist **nicht** erreichbar. Test bleibt als Regressionsschutz: stelle sicher, dass der Null-Guard vor jedem numerischen Vergleich steht (kein künftiger Refactor entfernt ihn).
- `T-AMP-010` **HOCH (RBAC-Leck)** — **PRODUKTION lädt `ampel.auftragsampel` → leeres Array (silent) statt 403** (`router.ts:944`). Silent-Fallback-Muster: kein hartes Gate, verdeckter Datenfluss. Test: PRODUKTION-Rolle → Endpoint → erwartet 403, beobachtet `[]`.
- `TC-RBAC-REPORTING-LEAK` **HOCH (Security)** — `revenuePoints()`/`orderPoints()` ohne Rollen-Filter → Kosten/Marge potenziell für PRODUKTION sichtbar; `ReportingService` bekommt die anfragende Rolle gar nicht übergeben. Test: PRODUKTION ruft `reporting.*` → muss 403 (Endpoint-Gate) **und** auf Datenebene keine Marge enthalten.

**(d) Vermutete Schwächen:**
- **Reporting ohne RBAC-Redigierung** (`HOCH`, Security) — siehe `TC-RBAC-REPORTING-LEAK`.
- **Dashboard-Metriken sequenziell** statt `Promise.all` (`MITTEL`, Performance) — 6 Metriken seriell laden.
- **HomePage Safe-Fallback verdeckt echte Fehler** (`safe<T>` → silent `[]`) (`MITTEL`).
- **Eskalation hart +3 Tage** nicht pro Ebene konfigurierbar (`MITTEL`).
- **Leerfälle:** `summarizeAmpel(leer)→mostUrgent=null`, `bucketRevenue(leer)→totalNetCents=0` — defensiv, kein Crash; als Regressionstests fixieren.

---

### 5.4 RBAC / Security (PRODUKTION ohne Preise)

**(a) Funktionsweise:** `canViewFinancials`/`redactOrderForRole` (`shared/rbac.ts`), `supplierRoles` vs `allRoles`, `roleProcedure`-Middleware. Feld-Redaktion auf Datenebene (totalNetCents → null).

**(b/c) Testfälle:**
- `TC-RBAC-001/002` **KRITISCH** — PRODUKTION: null totalNetCents in `orders.list`; 403 auf `orders.lines`.
- `TC-RBAC-003` **KRITISCH** — `redactOrderForRole` mutiert Original **nicht** (shallow-copy reicht für Primitive; Test belegt Unveränderlichkeit der Quelle).
- `TC-RBAC-005/006` **KRITISCH** — Delivery-Note-PDF / ProductionSheet-PDF ohne Preise.
- `TC-RBAC-009` **KRITISCH** — `reporting.*` für PRODUKTION → 403.
- `TC-RBAC-OPP` **KRITISCH** — `opportunity.*` (Forecast = Geldwert!) für PRODUKTION → 403.
- `TC-RBAC-AMPEL` **HOCH** — `ampel.auftragsampel` → 403 statt silent `[]` (siehe `T-AMP-010`).

**(d) Vermutete Schwächen:**
- **Keine middleware-erzwungene Redaktion** (`HOCH`) — manueller `redactOrderForRole`-Aufruf je Endpoint, Dead-Code-Risk bei neuen Endpoints (ein vergessener Aufruf leakt Preise). Größte systemische Security-Schwäche.
- **Silent-Fallback statt 403** (`HOCH`) — `ampel.auftragsampel`, ggf. weitere Reads; verdeckt fehlendes Gate.
- **Frontend `pages.tsx` minimiert** → UI-Gate nicht statisch verifizierbar (`MITTEL`) — **am laufenden System** prüfen, ob Preise in Tooltips/Detail-Drawers für PRODUKTION durchsickern.
- **Shallow-Copy** schützt nested objects nicht (aktuell nur Primitives, also OK) (`MITTEL`).
- `ampel.overview` nutzt `protectedProcedure` statt `roleProcedure` (`NIEDRIG`, Konsistenz).

---

### 5.5 PDF & Mail / Outlook (.eml) — Belegausgabe & -versand

**(a) Funktionsweise:** Server erzeugt PDFs über `print.*` (`router.ts`): `quote`, `invoice`,
`auftragsbestaetigung`, `deliveryNote`, `creditNote`, `mahnung`, `veredelungsauftrag`,
`sampleLoanLieferschein`, `inquiry` (Anfrage), `laufzettel`, `customerDataSheet`,
`supplierDataSheet` — jeweils `{ filename, base64 }`. Renderer in `packages/shared/src/beleg.ts`
(`angebotDokument`/`anfrageDokument`/`rechnungDokument`/… → fester `titel` je Typ).
**Mailweg = Outlook-Entwurf, nicht SMTP:** `mail.buildDraft({kind,id})` bündelt
`{ to, subject, body, pdf }` (Empfänger über `print.recipientEmailForBeleg` aus der FK-Kette
zur Company), das Frontend baut daraus eine RFC-822-`.eml` (`apps/web/src/outlook-draft.ts`:
`buildEml`/`openOutlookDraft`, `X-Unsent:1`, UTF-8-Betreff RFC 2047, base64-Body + PDF-Part) →
Doppelklick öffnet Outlook als Entwurf. Frontend-Helfer `printBeleg`/`belegDocActions`/
`openBelegMail`/`openVeredelungsauftragMail` (in `pages.tsx`) speisen die `DocActionMenu`-
Einträge „… – PDF" / „… – In Outlook". `mail.buildVeredelungsauftragDraft` adressiert den
Veredler (`suppliers.emailForSubProduction`). Der alte SMTP-Pfad `mail.sendBeleg` existiert noch
(Fallback). Versendete/finalisierte Belege werden per `autoArchive` GoBD-archiviert.

**(b) Xentral-Gap:**
| Aspekt | Xentral | TEXMA | Schwere |
|---|---|---|---|
| Versandkanal | direkter Mailversand aus dem System (Postausgang) + Vorlagen-Editor | bewusst **Outlook-Entwurf** (Nutzer prüft + sendet selbst); SMTP nur Fallback | VERTRETBAR — aber Vorlagen (`emailTemplates`) sind in `buildDraft` **nicht** verdrahtet (statischer Text), das ist eine echte Lücke (`MITTEL`) |
| Vollständigkeit | jeder Beleg druck-/mailbar | **Abschlagsrechnung hat KEINEN PDF-Generator** (`print.abschlag` fehlt) → weder PDF noch Outlook | `HOCH` (Beleg-Lücke) |
| Empfänger | Kontakt-Rolle (Rechnung/Lieferung getrennt) | nur **eine** `Company.email`; keine Rollen-Adresse (Rechnungs- vs. Lieferkontakt) | `MITTEL` |
| Sammelversand | Stapel-Mail an N Belege | kein Bulk-„In Outlook" über Mehrfachauswahl | `NIEDRIG` |

**(c) Tiefe Testfälle:**
- `PDF-MAIL-001` (HOCH): Jeden Belegtyp aus **Liste UND Belegkette** als „… – PDF" laden →
  base64 dekodieren, prüfen: korrekte Belegnummer im Titel, **keine** Preise im Lieferschein/
  Veredelungsauftrag (rollenneutrale Belege), Empfängerblock = Rechnungsadresse.
- `PDF-MAIL-002` (HOCH): „In Outlook" je Typ → die `.eml` öffnen: **To** = Kontakt-Mail,
  **Subject** korrekt (Umlaute lesbar, nicht `=?UTF-8?B?…` kaputt), **PDF als Anhang** vorhanden,
  `X-Unsent:1` → öffnet als **Entwurf** (nicht als empfangene Mail). Nichts wird automatisch versendet.
- `PDF-MAIL-003` (MITTEL): Beleg **ohne hinterlegte Kontakt-E-Mail** → Entwurf öffnet trotzdem
  (leeres An-Feld) **+ klarer Hinweis**; kein stiller Leerversand, kein 500.
- `PDF-MAIL-004` (HOCH, Lücke): Abschlagsrechnung anlegen → **kein** „PDF"/„In Outlook" verfügbar
  (dokumentierte Lücke). Verifiziere, dass die UI das nicht vortäuscht (kein toter Button).
- `PDF-MAIL-005` (MITTEL): Veredelungsauftrag „In Outlook (Veredler)" → To = `Supplier.email`
  (z. B. hi5 GmbH); fehlt sie → Hinweis. Werkstattblatt-PDF enthält Größen-Matrix + Beistellung.
- `PDF-MAIL-006` (MITTEL): `emailTemplates.upsert` eine Vorlage anlegen → erscheint sie im
  `buildDraft`-Betreff/Text? (Erwartung laut Xentral: ja. Ist: statischer Text → Befund.)
- `PDF-MAIL-007` (NIEDRIG): Sehr großes PDF (300-Positionen-Rechnung) → `.eml` base64 korrekt
  in 76-Zeichen-Zeilen umgebrochen (RFC 2045), Outlook öffnet ohne Anhang-Korruption.
- `PDF-MAIL-008` (MITTEL): Auto-Archiv — nach „In Outlook"/Finalisierung prüfen, dass der Beleg
  im WORM-Archiv landet (Archiviert-Badge); `mail.sendBeleg`-SMTP-Fallback bei fehlendem Mailkonto
  → sauberer `BAD_REQUEST`, kein 500.

**(d) Vermutete Schwächen:**
- **Abschlags-PDF fehlt komplett** (`print`-Router hat kein `abschlag`) — Beleglücke (`HOCH`).
- **`emailTemplates` nicht an `buildDraft` angebunden** → Betreff/Text statisch, Vorlagenpflege
  wirkungslos (`MITTEL`, `router.ts` `mail.buildDraft`).
- **Nur eine `Company.email`** → kein getrennter Rechnungs-/Lieferkontakt; bei abweichendem
  Rechnungsempfänger landet die Mail beim falschen Kontakt (`MITTEL`).
- **`.eml`-Erzeugung clientseitig** (`outlook-draft.ts`): kein serverseitiger Fallback; Browser
  ohne `btoa`/`Blob` scheitern still (`NIEDRIG`).

---

## 6. Querschnitts-Kapitel

### 6.1 Geld / Cent-Arithmetik

Grundregel eingehalten: alles Integer-Cent, `roundCents = Math.round`, Feldsuffix `…Cents`, Anzeige `euro()`, Eingabe `eurToCents`. **Aber konzentrierte Risikopunkte:**

- **`INV-ROUND-100` KRITISCH** — **Akkumulierte Rundung:** 100 Positionen à 1 Cent (19 %) → je Position `round(0.19)=0` → Gesamt-Steuer **0**, mathematisch 19. `buildInvoiceTotals` rundet je Zeile, dann summiert (an sich korrekt), aber **kein Summen-Level-Residual**. Kein Test für n≫2. **Echter USt-Falschausweis (GoBD)** — KRITISCH, nicht nur „Risiko". Probe: API-Response `taxCents` vs. math. Soll.
- **`floating-point-datev-rate` HOCH** — DATEV BU-Schlüssel via `rateKey = t.rate.toFixed(2)` (`datev.ts:60`). Drift `0.19→0.19000001` → Lookup `BU_BY_RATE['0.19']` fehlschlägt; Fallback `>= 0.19` (`:65`) als Safety-Net. **Audit-Risiko.** Inkonsistenz zu `kontenrahmen.ts:68-69` (`Math.abs(rate-0.19)<1e-9`, robuster) — eigener `MITTEL`-Befund.
- **`datev-sign-loss` HOCH** — `datevAmount` (`datev.ts:81-82`) `Math.abs(cents)` → **Vorzeichenverlust bei Gutschriften** → falsche DATEV-Buchung. **Hinweis:** der im Rohbefund genannte `euroCsv`-Zwilling **existiert nicht** (`euroCsv` ist im Code nicht vorhanden); `pos.ts:33`/`pain001.ts:36`/`einvoice.ts:41` nutzen `toFixed(2)` **ohne** `Math.abs`, sind also vorzeichenkorrekt. Der einzige reale Sign-Loss ist `datevAmount`.
- **Inline-Parser in `pages.tsx`** (`HOCH`) — `Math.round(Number(valueEur.replace(",", "."))*100)` an 3 Stellen (`:4508/4655/5520`), **kein** `isNaN`-Check, **nutzt nicht** das zentrale `eurToCents` (`money.ts:29`). Code-Duplikation + Maintenance-Falle. **Zweit-Implementierung in `woocommerce.ts:84`** — beide Parser müssen bit-identisch runden (Shop-Import-Geldpfad). Test: „abc"/leerer String → erwartet sauberer Fehler, nicht `NaN→0`.
- **`tolerance-2pct-micro` HOCH** — 3-Way-Match `max(round(po*0.02), 100)` (`incoming-invoice.service.ts:72`): bei 10-€-PO effektiv 10 % Toleranz → Rechnung 10,99 € fälschlich GEPRUEFT statt GESPERRT (siehe `IIN-001`). **Keine Obergrenze** für große POs.
- **`payment-reconciliation-idempotency` HOCH** — Doppel-Buchung gleicher Zahlung nicht verhindert (siehe Banking J).

**Anker:** Cent-Disziplin ist insgesamt HOCH/produktiv. Die Geld-Defekte sind **nicht nur** Akkumulation und DATEV-Float, sondern **auch**: `datevAmount`-Sign-Loss (Gutschriften), 3-Way-Match-Toleranz bei Kleinbeträgen, doppelte/ungeschützte `eurToCents`-Implementierungen (`pages.tsx` + `woocommerce.ts`). Das Wort „einzige" ist gestrichen — es sind mehrere, mit Stress-Tests (100×1ct, gemischte Sätze, Gutschrift-Vorzeichen, 10-€-PO) zu belegen.

### 6.2 Idempotenz / Transaktionalität / Race Conditions

**Übersicht — Idempotenz-Status der Beleg-Konvertierungen (vervollständigt):**
| Konvertierung / Mutation | Idempotenz | Mechanismus / Lücke |
|---------------|-----------|-------------|
| Quote→Order | ✅ | `existingOrderId`-Check |
| Order→Invoice | ✅ | `orderId @unique` |
| Inquiry→Quote | ✅ | `updateMany WHERE status IN (...)` Gate |
| CrmLead→Quote | ✅ | `updateMany` Gate |
| Lead→Company | ✅ | Gate |
| Sample→Invoice | ✅ (aber) | status-Guard — **Hybrid-Leihe doppelte Rückbuchung** (`T-SAMPLE-005`) |
| Banking-Import (CAMT) | ✅ (aber) | `existingExternalRefs` — **Check-vor-TX-Race** (`T-13-002`) |
| **Reorder→PurchaseOrders** | ❌ | **KEINE** — Timestamp-Nummer, kein Gate (`DT-REORDER-001`) |
| **confirmShipped (Outbox)** | ❌ | **Doppel-`confirmShipped` → 2 Outbox-Events** (`T-06-05`) |
| **Reklamation→Gutschrift** | ❌ | **kein Constraint** gegen Doppel-Gutschrift (`BC-5`) |
| **Company-Dedup** | ❌ | `findByName→Numbering→insert` **nicht atomar** (`M_COMPANY_001`) |
| **Opportunity→Hubspot** | ❌ | `mirror()` synchron, kein try/catch, kein Rollback (`OPP-001`) |

Die Tabelle suggeriert **nicht** mehr nur EINE ❌ — real sind es mindestens **fünf** (Reorder, confirmShipped, Reklamation, Company-Dedup, Hubspot-Sync) plus zwei „✅ aber"-Race-Fenster.

**Kern-Defekte:**
- **`R-001` KRITISCH** — `createPurchaseOrders` ohne Gate, `BV-${Date.now()}-${supplierId.slice(0,6)}` (`prisma-reorder.repository.ts:80`) nicht effektiv unique.
- **`N-005` HOCH** — **Numerierung vor `$transaction`** in mehreren Services (`numbering.next()` außerhalb TX) → bei TX-Fehler **Nummernlücke** (GoBD-relevant). Konkrete Stellen: `invoice.service.ts:82`, `production.service.ts:317`, Quote-Services. Jede Stelle produziert einzeln eine Lücke.
- **`P-003` HOCH** — `production.createFromOrder`: `createProductionOrder()` (`:319`) + `setOrderInProduction()` (`:320`) **nicht** in einer TX → Zwischenzustand (PA existiert, Order noch ANGELEGT). Repro: nach `createProductionOrder`, vor `setOrderInProduction` DB abfragen → Order-Status inkonsistent.
- **`R-008/Bestand-Snap` MITTEL** — `proposals()` außerhalb TX vom Write (`reorder.service.ts:125-129`) → Bestandsdrift.
- Tests: `T-13-002` (parallele CAMT-Imports), `dun-13` (paralleler Mahnschritt), `M_COMPANY_001` (Dedup-Race), `OPP-001` (Hubspot-Drift).

### 6.3 UI-Konsistenz (Kebab / CUID / Farbe / i18n)

- **Farb-Semantik verletzt** (`MITTEL`) — `color='orange'`/`'grape'` für **nicht-destruktive** Aktionen („Variante offen" `:2293`, „PA erzeugen" `:3211/3317`, „Logo/Veredelung" `:2251`). Xentral: EIN Akzent, Farbe bedeutet etwas. Orange suggeriert Warnung, ist aber Normalhandlung.
- **Toggle-Farblogik verkehrt** (`MITTEL`) — `color={active ? 'red' : 'green'}` (`:1498/1521/6902`): Rot = „ist aktiv", obwohl Nutzer bewusst deaktiviert. Sollte konstante navy + Label.
- **CUID-Display** korrekt: `#suffix` + title-Tooltip (`:133-140`), `id`-Spalte versteckt wenn `number`/`sku` vorhanden (`:186-187`). **Vertretbar**, aber kein UI-Toggle zum Einblenden.
- **Loading-States gemischt** (`NIEDRIG`) — teils `Loader`+„lädt…", teils nur `Loader` (`:3439/2482`).
- **Empty-States** roh „Keine Daten." in AutoTable (`:176`) statt EmptyState-Komponente (`NIEDRIG`).
- **i18n** — UI 100 % deutsch (gut), aber **API-Enums hardcoded englisch** (`SALES`, `CUSTOMER`, `LEAD`, `router.ts:2617`) — Map-Labels leben nur im Frontend (`MITTEL`).
- **Kebab/Zeilen-Vokabular** — `DocActionMenu` mit `stopPropagation` korrekt (`doc-layout.tsx:80`), aber durchgängig **keine** Bulk-Aktions-Pill bei Mehrfachauswahl über die Listen hinweg (Xentral-Kernmuster).

### 6.4 GoBD / Audit

- **Append-only StockMove** ✅ (Stärke über Xentral).
- **Audit je Mutation** ✅ in CRM/Order/Stock/Dunning/Opportunity — `AUDIT-001` verifiziert 4 Einträge (CREATE + 3× UPDATE mit before/after).
- **Lücken (alle min. HOCH/MITTEL):**
  - Abschlag **nicht WORM-archiviert** + **nicht in `archive.missing`** (`ARC-001/002`).
  - Reorder-PO-Nummern **nicht lückenlos** (Timestamp statt NumberingService).
  - Musterrechnungen im **falschen Nummernkreis** (INVOICE statt SAMPLE_INVOICE).
  - **Numerierung vor TX → Lücken** bei Fehler (`N-005`, konkrete Stellen `invoice.service.ts:82`, `production.service.ts:317`).
  - Banking-Audit nur auf Payment-Ebene, **nicht** OP-Restbeträge.
  - **DATEV-Vorzeichenverlust** bei Gutschriften (`datevAmount` `Math.abs`).
  - Mahnnummer / CrmLead / **Opportunity** / SampleLoan **nicht sprechend** (nur CUID) → Traceability schwach.

### 6.5 Navigation / Deep-Links / Browsability (KORRIGIERT)

> **Phantom-Korrektur:** Der Vorentwurf führte einen „KRITISCHEN Navigation-404" auf `#banking/#leads/#opportunities/#zahlungen/#finance`. **Am HEAD `3146d15` verifiziert: dieser 404 existiert NICHT.** Belege:
> - `hashKey()` (`App.tsx:85-89`) endet mit `return ALL_KEYS.includes(h) ? h : h;` — **beide Branches geben `h` zurück** (Tautologie). Die Funktion filtert **nicht** auf einen Fallback; sie reicht den rohen Hash durch.
> - `Page()` (`App.tsx:401-463`) hat explizite `case`-Routen für **alle sechs** angeblich „versteckten" Keys: `leads` (`:410`), `inquiries` (`:413`), `opportunities` (`:430`), `banking` (`:453`), `zahlungen` (`:454`), `finance` (`:457`). Sie **rendern ihre echten Seiten**.
> - Der `default`-Zweig (`:458-462`) ist eine **graceful `EmptyState`** „Seite nicht gefunden" mit Button „Zur Startseite" — **kein HTTP 404, kein Crash**.
> Damit landen HomePage→`#banking` (`pages.tsx:8308`) und GlobalSearch→`navKey=leads` (`prisma-search.repository.ts:28`) auf **funktionierenden** Seiten. `TC-NAV-001/002` als „404"-Befunde sind **widerlegt**.

**Was real bleibt (neue, korrekte Befunde):**
- `NAV-001` **NIEDRIG (Dead Code / Wartungsfalle)** — `ALL_KEYS` (`App.tsx:84`, aus `NAV` generiert) wird in `hashKey()` (`:89`) durch die `? h : h`-Tautologie **faktisch nicht mehr ausgewertet**. Der Validierungs-Guard ist tot. Risiko: künftige Annahme „unbekannte Hashes werden gefiltert" ist falsch — jeder beliebige Hash wird an `Page()` durchgereicht. Fix: entweder `return ALL_KEYS.includes(h) ? h : "home";` (echter Fallback) **oder** `ALL_KEYS` entfernen und auf den `default`-Case vertrauen.
- `NAV-002` **MITTEL (UX)** — Unbekannter/Tippfehler-Hash (z. B. veralteter Bookmark `#altmodul`) zeigt `EmptyState` ohne automatische Weiterleitung. Akzeptabel, aber der Nutzer landet in einer Sackgasse statt auf Home. Xentral würde auf eine gültige Default-Route umleiten.
- `TC-NAV-005` **HOCH** — **GlobalSearch unvollständig:** Reklamation/Procurement **fehlen** in der globalen Suche (`prisma-search.repository.ts:12-31`). Diese Module sind nur über die Sidebar erreichbar, nicht über die zentrale Suche — Browsability-Lücke (echter Befund, unabhängig vom Phantom-404).
- `TC-NAV-006` **MITTEL** — Test: Deep-Link auf jeden der 56 `case`-Keys → rendert; Deep-Link auf Nonsens-Key → `EmptyState` (nicht Crash). Regressionsschutz, falls `hashKey` künftig „repariert" wird und dann doch filtert.

**Verdikt 6.5:** Die „durchgängige Browsability" ist **nicht** durch tote Deep-Links verletzt (Phantom), **aber** durch (a) den toten `ALL_KEYS`-Guard, (b) fehlende Module in der GlobalSearch und (c) die `navKey=null`-Sackgassen der Finanzbelege in der Belegkette (Kap. 5.2). Diese drei zusammen sind der reale Browsability-Befund.

### 6.6 RBAC / Security (Querschnitt)

Siehe 5.4. Zusätzlich querschnittlich prüfen: **Jeder neue/finanz-tragende Endpoint** auf `roleProcedure`-Gate + ggf. `redactOrderForRole`. Da Redaktion *manuell* ist (kein Zwang), ist das die größte systemische Security-Schwäche — ein vergessener Aufruf leakt Preise. **Zwei konkrete Verdachtsfälle:** Reporting-Endpoints (`TC-RBAC-REPORTING-LEAK`, 5.3) und `ampel.auftragsampel` (Silent-`[]` statt 403, `T-AMP-010`). Opportunity-Forecast (Geldwert!) muss für PRODUKTION ebenfalls 403 sein (`TC-RBAC-OPP`).

---

## 7. Xentral-Parität-Scorecard

| Modul | Gap-Schwere | Klassifikation | Lücke in einem Satz |
|-------|-------------|----------------|---------------------|
| CRM / Pipeline | **HOCH** | UX-HÜRDE + DEFEKT | Drei parallele Funnels + keine sprechenden Nummern statt eines Lead-Funnels mit L-Nummern. |
| **Opportunity / Forecast** | **HOCH** | DEFEKT | `mirror()`-Hubspot-Sync synchron ohne try/catch/Rollback; keine sprechende Nummer. (Forecast-Mathematik korrekt — kein Bug.) |
| Angebot (Quote) | **KRITISCH** | DEFEKT | Veredelungsbezug-Ummapping verliert Bindung bei Alternativen; keine Spalten-Umschalter/Bulk. |
| Auftrag | **HOCH** | DEFEKT | Best-Effort-Versand/Storno → inkonsistenter Lieferstatus; QS-Gate nur Hinweis; keine Filter/Pagination. |
| Produktion / Fremdvergabe | **MITTEL** | UX-HÜRDE | Logik stark, UI rudimentär (prompt-Mengen, manuelle PA-ID, keine Spaltenkonfig). |
| Beschaffung / Reorder | **KRITISCH** | DEFEKT | Keine Idempotenz + Timestamp-Nummer (nicht GoBD-lückenlos) + keine Bestand-Reservation. |
| **Eingangsrechnung / 3-Way-Match** | **HOCH** | DEFEKT | Mindesttoleranz `max(po*2%,100ct)` → bei Kleinbeträgen 10 %, keine Obergrenze → Falsch-GEPRUEFT. |
| Lager / Bestand | **HOCH** | DEFEKT + VERTRETBARE ABWEICHUNG | Keine Auto-Verbrauchsbuchung bei Lieferung (Defekt); Append-only (Stärke); Overselling ohne Stop; keine Bins. |
| Muster / Leihgut | **HOCH** | DEFEKT | `issueMulti` dueDate-Bug (sofort fällig); Hybrid-Leihe Doppelbuchung; Musterrechnung im echten INVOICE-Kreis. |
| Versand / Tracking | **HOCH** | DEFEKT | Hardcoded 1 kg; kein Multi-Parcel; DPD-Fehler → VERSENDET ohne Label; Doppel-Outbox-Events. |
| Faktura / Abschlag / Gutschrift | **KRITISCH** | DEFEKT | Abschlag ohne PDF + ohne WORM-Archiv (GoBD); keine Invoices-Liste. |
| **E-Rechnung (ZUGFeRD/XRechnung)** | **HOCH** | DEFEKT | Aufschlag-Position nicht als Charge ausgewiesen; `esc()` ohne `'`/`"`; EN16931-Konformität bei Rabatt-Edge ungeprüft. |
| **DATEV-Export** | **HOCH** | DEFEKT | `datevAmount` `Math.abs` → Vorzeichenverlust bei Gutschriften; BU-Lookup floating-point-fragil. |
| Banking / Zahlungsabgleich | **HOCH** | DEFEKT + UX-HÜRDE | Klärungsliste read-only; `.includes`-Matching (Falsch-Positive); keine Sammel-Aufsplitterung; OpenItem-Cascade verwaist Allocations. |
| **SEPA-Auszahlung (pain.001)** | **MITTEL** | VERTRETBARE ABWEICHUNG | Builder solide (CtrlSum/NbOfTxs/IBAN-mod97/140-Zeichen); offen: Gating gegen gesperrte Eingangsrechnungen. |
| **Bank-Connection (EBICS/PSD2)** | **MITTEL** | DEFEKT | Consent-Ablauf gated Sync (gut); DBIT/CRDT-Filter + Provider-Duplikate prüfen. |
| Mahnwesen | **MITTEL** | DEFEKT + UX-HÜRDE | dunningLevel nach Zahlung nicht zurückgesetzt; Mahnnummer/Kunde nicht in Liste; keine Automatik. |
| Stammdaten | **MITTEL** | DEFEKT + UX-HÜRDE | CSV-Import ohne Rollback; PIM-Vollständigkeit zu einfach; Dezimal-Parsing-Falle (`9,90`→NaN). |
| **Cashsale / Barverkauf** | **MITTEL** | DEFEKT | `navKey=null`-Sackgasse in Belegkette; kein eigener Geld-/Belegpfad-Test, Vorzeichen ungeprüft. |
| Belegkette | **HOCH** | DEFEKT | Rechnung/Gutschrift/Abschlag/Barverkauf = Sackgassen (navKey=null / kein PDF). |
| Reporting / Ampel | **HOCH** | DEFEKT | Keine Ampel-History/Trend; Reporting ohne RBAC-Redigierung; silent `[]` statt 403. |
| RBAC / Security | **HOCH** | DEFEKT | Redaktion manuell statt middleware-erzwungen; Silent-Fallback statt 403 (Leak-Risk bei neuen Endpoints). |
| Navigation / Browsability | **HOCH** | DEFEKT + UX-HÜRDE | **KEIN 404 (Phantom widerlegt)**; aber toter `ALL_KEYS`-Guard, GlobalSearch unvollständig, Finanzbeleg-Sackgassen. |
| Geld / Cent | **KRITISCH** | DEFEKT | 100×1ct-Akkumulation → Steuer 0 (USt-Falschausweis); DATEV-Sign-Loss + Float-Lookup; doppelte ungeschützte Parser. |
| Idempotenz / TX | **HOCH** | DEFEKT | Numerierung vor TX (Lücken); PA-Create nicht atomar; ≥5 Mutationen ohne Idempotenz. |
| UI-Konsistenz | **MITTEL** | UX-HÜRDE | Farb-Semantik verletzt (orange für Normalaktionen, rot für Toggle). |

---

## 8. Defekt-Report-Format & Schweregrade

**Format (jeden Befund so anlegen):**
```
[ID] Titel
Schwere: KRITISCH | HOCH | MITTEL | NIEDRIG
Klassifikation: DEFEKT | UX-HÜRDE | VERTRETBARE ABWEICHUNG | PHANTOM (widerlegt)
Modul / Datei:Zeile (am HEAD verifiziert: ja/nein)
Repro: 1. … 2. … 3. …
Soll (XENTRAL-Maßstab): …
Ist (beobachtet): …
Probe: SQL / Network-Response / Audit-Eintrag / decoded PDF / XML
XENTRAL-Bezug: welche Maxime verletzt?
```

**Schweregrade:**
- **KRITISCH** — Datenverlust, Geld falsch, GoBD-Verstoß, Doppelbeleg, Bestand divergiert, 404 auf verlinkter Route, Security-Leak. Blockiert Abnahme.
- **HOCH** — Konsistenz-/Idempotenz-Lücke, fehlende WORM-Archivierung, externer Sync-Drift, Race mit realer Likelihood, fehlender RBAC-Schutz auf Finanzdaten.
- **MITTEL** — UX-Hürde, die Workflow merklich bremst; Datenqualitäts-Risiko; Konsistenz-Inkonsistenz ohne Geldfolge.
- **NIEDRIG** — Kosmetik, fehlende Bequemlichkeit, dünne Doku, theoretischer Edge-Case, toter Code.
- **PHANTOM** — im Rohbefund behauptet, am Code widerlegt. **Trotzdem dokumentieren** (mit Beleg der Widerlegung), damit der Befund nicht erneut „entdeckt" wird.

---

## 9. Erwartungs-Anker (bewusste Designentscheidungen vs. echte Bugs vs. Phantome)

**Bewusst / vertretbar — NICHT als Bug melden:**
- **Append-only StockMove**, Korrekturen als Bewegung — Stärke über Xentral.
- **USt zentral** (`settings.defaultTaxRate`), nicht je Position — Projektkonvention (CLAUDE.md). Mischsteuer-Abschlag mit globalem Satz ist deshalb *grenzwertig*, aber konsistent mit der Architektur.
- **Drei CRM-Funnels** existieren parallel als Legacy-Strangler — die *Existenz* ist gewollt (Migration), die fehlende *Bündelung/UI-Klarheit* ist der Befund.
- **Multi-Leihen nicht auto-abrechenbar** (`variantId=null`-Filter) — by-design.
- **Nur Vollgutschrift** — by-design (einfache Logik), aber undokumentiert → der *fehlende Hinweis* ist der MITTEL-Befund.
- **Leeres `beistellPositionen` = strikte Kette** — bewusste Legacy-Rückwärtskompatibilität.
- **CUID-Masking** (`#suffix`) — korrektes Xentral-konformes Muster.
- **`materializeArticle` SKU `{OrderNumber}-P{pos}`** — durch Order-Nummer eindeutig, **kein** Kollisionsrisiko (positiver Befund).
- **Best-Effort `autoArchive`** — bewusst non-blocking, ABER nur *wenn* es nachgezogen wird; die *fehlende* Archivierung bei Abschlag ist echter Bug.
- **`allStagesReturned([])=true` / `weightedForecast([])=0`** — vacuous truth bzw. neutrale Leersumme; defensiv, kein Bug (aber als Regressionstest fixieren).

**Echte Bugs (keine Designentscheidung, egal wie es aussieht):**
- `issueMulti` dueDate=ausgegebenAm (`T-SAMPLE-002`, `prisma-sample.repository.ts:43`).
- Veredelungsbezug→null bei Alternativen (`QT-04`, `sales-order.service.ts:189-193`).
- Reorder ohne Idempotenz (`DT-REORDER-001`, `prisma-reorder.repository.ts:76-80`).
- Keine Auto-Verbrauchsbuchung (`TST-012`).
- Akkumulierte USt-Rundung → 0 (`INV-ROUND-100`).
- Abschlag ohne PDF/WORM (`ARC-001`).
- dunningLevel nicht zurückgesetzt (`dun-04`, `dunning.ts:71`).
- Numerierung vor TX (`N-005`).
- DATEV-Sign-Loss bei Gutschriften (`DATEV-001`, `datev.ts:82`).
- Hubspot-Sync synchron ohne Rollback (`OPP-001`, `opportunity.service.ts:112-116`).
- 3-Way-Match-Toleranz bei Kleinbeträgen (`IIN-001`, `incoming-invoice.service.ts:72`).
- Hybrid-Leihe Doppelbuchung (`T-SAMPLE-005`, `prisma-sample.repository.ts:100-109`).

**Phantome — im Rohbefund behauptet, am Code WIDERLEGT (nicht erneut melden):**
- **Opportunity-Forecast-Rundungsfehler** `Math.round(prob/100)=0` — existiert nicht; reale Formel `Math.round((valueCents*prob)/100)` ist korrekt (`shared/opportunity.ts:29-33`).
- **Navigation-404** auf `#banking/#leads/#opportunities/#zahlungen/#finance` — existiert nicht; alle sechs haben `case`-Routen (`App.tsx:410/413/430/453/454/457`), `default` ist graceful EmptyState. (Reale Befunde: toter `ALL_KEYS`-Guard `NAV-001`, GlobalSearch-Lücke `TC-NAV-005`.)
- **`auftragsampel` NaN** bei `grossCents=null` — bereits durch Null-Guard `:92` abgefangen (`T-AMP-003`).
- **`euroCsv` Vorzeichenverlust** — `euroCsv` existiert im Code nicht; der reale Sign-Loss steckt nur in `datevAmount`.

---

## 10. Abnahmekriterien

Die Abnahme gilt als **bestanden**, wenn:

1. **Alle KRITISCH-Befunde geschlossen oder als vertretbare Abweichung dokumentiert+akzeptiert:**
   - Veredelungsbezug-Ummapping bei Alternativen korrekt (`QT-04` grün).
   - Reorder `createPurchaseOrders` idempotent (Gate oder Idempotency-Key) + NumberingService-Nummer (`DT-REORDER-001/002`).
   - Auto-Verbrauchsbuchung bei Lieferung/Versand **oder** explizit dokumentierter manueller Prozess mit Bestands-Reconciliation (`TST-012`).
   - Abschlag-PDF + WORM-Archivierung + `archive.missing`-Erfassung (`ARC-001/002`).
   - `issueMulti` dueDate = +21 Tage (`T-SAMPLE-002`).
   - Akkumulierte USt-Rundung mathematisch korrekt (Summen-Level-Residual) bei 100×1ct (`INV-ROUND-100`).
   - Doppel-Faktura / Doppel-Konvertierung / Doppel-Mahnung / Doppel-Bestellung nachweislich blockiert.
   - PRODUKTION sieht **nirgends** Preise (Datenebene, alle Endpoints + PDFs + Opportunity-Forecast + Reporting + Ampel).

2. **Geld:** Stress-Test 100×1ct (alle Sätze) liefert mathematisch korrekte Steuer (Residual-Korrektur); DATEV-Export liefert korrekte BU-Schlüssel auch bei Floating-Point-Drift **und** korrektes Vorzeichen bei Gutschriften (`datevAmount` ohne unbeabsichtigten `Math.abs`); 3-Way-Match-Toleranz mit Obergrenze und ohne Kleinbetrag-Falle; alle UI-Preiseingaben gehen durch validiertes `eurToCents` (kein Inline-Parser ohne `isNaN`); beide `eurToCents`-Implementierungen (`money.ts` + `woocommerce.ts`) runden bit-identisch.

3. **GoBD:** Alle finalen Belege (inkl. Abschlag, E-Rechnung, DATEV) WORM-archiviert; alle Nummernkreise lückenlos via NumberingService (auch Reorder-PO, auch Opportunity/CrmLead/SampleLoan sprechend nummeriert); Numerierung transaktional mit Beleg-Erstellung; Audit je Mutation mit before/after; E-Rechnung EN16931-valide (inkl. Rabatt-/Aufschlag-Edge).

4. **Idempotenz:** Jede Beleg-erzeugende Mutation gegen Doppelklick + parallelen Request abgesichert (Gate oder Unique-Constraint mit sauberem Error, nicht rohem Prisma-Fehler) — insbesondere die fünf aktuellen ❌-Fälle (Reorder, confirmShipped/Outbox, Reklamation→Gutschrift, Company-Dedup, Hubspot-Sync). Externe Syncs (Hubspot) laufen über Outbox, **nicht** synchron im Request.

5. **Konsistenz:** Versand/Storno transaktional (kein „VERSENDET ohne Lieferschein/Label"); Reservierung wird bei Lieferung korrekt aufgelöst; Lieferstatus spiegelt echten Lieferschein; PA-Create + Status-Setzung in einer TX (`P-003`).

6. **Banking/SEPA:** CAMT-Import idempotent (kein Check-vor-TX-Race); SEPA pain.001 mit korrekter CtrlSum/NbOfTxs/IBAN-Validierung; Bank-Connection-Sync gated bei Consent-Ablauf; nur CRDT verbucht, DBIT gefiltert; SEPA-Auszahlung gegen GESPERRT-Eingangsrechnungen blockiert.

7. **`pnpm build` · `pnpm typecheck` · `pnpm test` grün**; neue/geänderte Services + Mapper haben Unit-Tests; Integrationstests (`RUN_DB_TESTS`/`RUN_REDIS_TESTS`) grün.

8. **HOCH-Befunde** entweder geschlossen oder mit Ticket + Termin + akzeptiertem Risiko versehen (insbesondere Overselling-Hard-Stop, Banking-Klärungsliste-Aktionen, Versand-Multi-Parcel, Reporting-RBAC-Redigierung, Silent-`[]`-statt-403, 3-Way-Match-Toleranz, GlobalSearch-Vollständigkeit).

9. **Navigation/Browsability:** `hashKey`-Guard entweder echt gemacht (Fallback auf `home`) oder bewusst entfernt (`NAV-001`); kein toter Validierungs-Pfad; alle Module in GlobalSearch erreichbar (inkl. Reklamation/Procurement); keine `navKey=null`-Sackgassen für Finanzbelege. **Hinweis:** Der behauptete 404 ist widerlegt — die Abnahme prüft hier die *realen* Browsability-Lücken, nicht das Phantom.

10. **Das vollständige „Bergblick Outdoor GmbH"-Szenario** läuft end-to-end von Lead über Verkaufschance, Angebot, Auftrag, Produktion (sequenzielle + parallele Fremdvergabe), Versand, Faktura, Abschlag, Banking-Abgleich, DATEV-/E-Rechnungs-Export bis zur Mahnung — ohne Datenverlust, mit korrekten Cent-Summen, vollständiger klick-navigierbarer Belegkette und vollständigem Audit-Trail durch.
