# QA-Run-Sheet — Stufe B–K als ADMIN (Fortsetzung des E2E-Durchstichs)

**Zweck:** Ausführbare Fortsetzung des Browser-E2E aus `qa-briefing-e2e.md`. Stufe A
(CRM/Angebot-Anlage) lief bereits; dieses Blatt führt **Schritt für Schritt** von der
Angebots-Erfassung (B) bis zur Mahnung (K). Pro Schritt: konkrete Eingabe → erwartetes
Ergebnis (Häkchen) → **falsifizierbare Probe** (aktiv versuchen zu brechen).

- **Rolle:** durchgängig **ADMIN** (volle Rechte; RBAC-Redaktion separat in `qa-briefing-e2e.md` §5.4).
- **Szenario:** „Bergblick Outdoor GmbH" — 5 Positionen, siehe `qa-briefing-e2e.md` §3.
- **Tiefe Edge-Cases & Code-Belege:** jeweils referenzierte IDs (`QT-…`, `T-04-…`) im Briefing nachschlagen.
- **Daten-Ebene prüfen:** DevTools → Network → tRPC-Response inspizieren (nicht nur die UI).

> Legende: ☐ = manuell abhaken · 🔎 = falsifizierbare Probe (soll fehlschlagen lassen) · ⚠ = bekannter Defekt laut Briefing (bestätigen)

---

## B0 — FACH-PRICE-Regression (zuerst! frisch gefixt)

Der Tausenderpunkt-Bug im Preisfeld ist behoben (`MoneyInput` + `parseEuroInput`). **Vor**
dem Angebot gegenprüfen:

1. Angebot anlegen → Position frei erfassen → ins **VK (€)**-Feld tippen:
   - ☐ `1.234,56` eingeben, Feld verlassen → zeigt **`1.234,56`** (NICHT `1,23`).
   - ☐ `9,90` → `9,90`. ☐ `9.90` (Ziffernblock-Punkt) → `9,90`. ☐ `1234,56` → `1.234,56`.
   - ☐ `1.500` (nur Punkt, 3 Stellen) → `1.500,00` (= 1500 €, Tausendergruppe).
2. Angebot speichern → Network-Response prüfen:
   - 🔎 `unitNetCents` der `1.234,56`-Position muss **`123456`** sein (vor dem Fix war es `123`).
   - ☐ Gegenprüfen in der Summenzeile: Position fließt mit **1.234,56 €** in die Angebotssumme.
3. Gleiches Feldverhalten auf: EK (€), Staffel-VK, Festbetrag, Kreditlimit, Max-Auftragswert,
   Reklamationskosten, Gutschein-Wert/-Betrag, Banking-Betrag, Stickerei-EK, Nachkalkulation.

---

## B — Angebot (Quote)

1. **Erfassung:** Bergblick-Angebot mit allen 5 Positionen anlegen (Pos 2 als Größenlauf S/M/L,
   Pos 5 Cap als Freitext). Status **ENTWURF**.
   - ☐ AN-Nummer vergeben (sprechend, kein CUID). ☐ Deckungsbeitrag je Position sichtbar.
2. **Alternativposition:** Pos 2 zusätzlich als **Alternative** markieren (Switch „Alt.").
   - ☐ Alternative zählt **nicht** in die Angebotssumme (`buildQuoteTotals`, `!isAlternative`).
3. **Versenden:** Status → **VERSENDET**.
   - 🔎 `QT-01`: Angebot, das **nur** eine Alternativposition (Netto 0) enthält → VERSENDET muss
     „Angebot ohne werthaltige Position" werfen. (Probe mit einem Wegwerf-Angebot.)
   - ☐ WORM-Archiv-Eintrag entsteht (Beleg ist „Archiviert").
4. **Verfall:** Gültigkeitsfrist in die Vergangenheit setzen → Wiedervorlage/Verfall auslösen.
   - ⚠ `QT-06`: `expireOverdue` zweimal → 2. Lauf legt **0** neue DueItems an (idempotent),
     bricht aber bei einem Preis-Fehler den Lauf für Folge-Angebote ab (nicht best-effort).
5. **Rabatt-Grenzfälle:**
   - 🔎 `QT-02b`: Position mit **100 % Rabatt** → unitNetCents = 0 (erlaubt? fließt mit 0 in Totals).
   - 🔎 `33,333 %` Rabatt → Float-Drift in der Cent-Rundung prüfen.
6. **Wandeln:** „In Auftrag wandeln" (`convertQuote`).
   - ⚠ **`QT-04` (Hoodie-Killer, KRITISCH):** Aufbau Pos1 Textil, **Pos2 Textil als Alternative**,
     Pos3 Veredelung→bezug 1, Pos4 Veredelung→bezug 2. Nach dem Wandeln:
     🔎 `SELECT bezugPosition FROM OrderLine WHERE kind='VEREDELUNG'` — Pos4-Veredelung zeigt
     **NULL** (Bug: Alternative wird gefiltert → Index-Versatz) statt Verweis auf die Textilzeile.
   - 🔎 `QT-08`-Leerfall: Größenlauf mit **allen** Größen = 0 → Position wird beim Wandeln **still**
     gefiltert (kein Fehler).
   - ☐ Nach dem Wandeln: **Navigation springt in den neuen Auftrag** (AP1-Pipeline-Chaining).

**Xentral-Abgleich B:** ☐ Spalten-Umschalter? (nein → MITTEL) ☐ gespeicherte Ansichten? (nein) ☐ Bulk/Checkbox? (nein)

---

## C — Auftrag (Auftragsmanagement)

1. **Aus Quote** entstanden (oben). Status **ANGELEGT**. AB-Nummer.
2. **Statusmaschine** durchschalten: ANGELEGT → IN_BEARBEITUNG → (Produktion, s. D) → …
   - 🔎 `T-05`-Gate: **IN_PRODUKTION** setzen, solange Wareneingang unvollständig (z. B. 30/50) →
     muss `CONFLICT` werfen, Status bleibt VERSANDBEREIT/aktuell (`startGateForOrder`).
   - ☐ `AUDIT-001`: genau **4 Audit-Einträge** (CREATE + 3× UPDATE); `before` nur bei UPDATE.
     (Network: `audit.forEntity` oder DB `SELECT count(*),action FROM audit_log WHERE entityId=… GROUP BY action`.)
3. **Editor-Freeze:** Auftrag auf **VERSENDET** → versuchen zu editieren.
   - 🔎 `updateOrder` muss ablehnen („nur noch Storno möglich").
4. **Lieferschutz:** teilgeliefert 6/10 → Menge auf **4** reduzieren.
   - 🔎 muss Fehler werfen (gelieferte Menge schützen); auf **8** reduzieren → erlaubt.
5. **Auto-Lieferschein:** bei VERSENDET wird Lieferschein über offene Mengen erzeugt.
   - ⚠ `Versand_AutoLieferschein`: ist **best-effort** → bei Fehler bleibt Status VERSENDET **ohne**
     Lieferzeile (inkonsistenter Lieferstatus). Prüfen, ob Lieferschein wirklich entstand.

**Xentral-Abgleich C:** ⚠ QS-Gate ist nur UI-Hinweis (VERSENDET geht auch bei QS=OFFEN). ⚠ GoBD-Archivierung async/best-effort. ☐ Liste ohne Filter/Pagination (limit 100 hart).

---

## D — Produktion & mehrstufige Fremdvergabe (T-04)

1. **Freigeben** (release, K-10-Gate): bei Rabatt über Schwelle + Rolle≠ADMIN blockiert
   (als ADMIN durchlassen — Gegenprobe mit BUERO separat).
2. **PA erzeugen** (`createFromOrder`): BOM expandieren, Auto-Fremdvergabe je Veredler.
   - 🔎 **`T-04-014` (KRITISCH):** zwei Veredelungen referenzieren **dieselbe** Textil-Pos 1 →
     Beistellmenge muss **100** sein (dedupliziert), **nicht 200**.
3. **Hoodie (Pos 4), sequenziell:** zwei Veredler, beide `beistellPositionen=[4]`.
   - 🔎 **`T-04-003`:** Stufe 2 (Stickerei) **blockiert**, bis Stufe 1 (Siebdruck) zurück ist (`canStartStage`).
   - 🔎 **Gegenprobe `T-04-002`:** Softshell (A, `[1]`) und Polo (B, `[2]`) disjunkt → **parallel** erlaubt.
4. **Beistellung → Rücklauf:**
   - 🔎 `T-04-004`: Rücklauf **120** > Beistell **100** → Error.
   - 🔎 `T-04-005`: Abschluss **ohne** `ruecklaufMenge` → Error.
5. **Inhouse (Pos 3, Transfer):** `completeInhouse`.
   - 🔎 `T-04-010`: Inhouse blockiert ohne externe Vorstufe am selben Textil.
   - 🔎 `T-04-011`: Inhouse an disjunktem Textil → `advanceStage` weist **generell** ab (anderer
     Fehlerpfad als der sequenzielle Block — Fehlermeldung unterscheiden).
6. **Veredelungsauftrag-Mail:** „In Outlook" → `.eml` mit PDF-Anhang + Empfänger des Veredlers.
   - ☐ Empfänger korrekt aufgelöst (Lieferanten-E-Mail), Betreff/Text vorbereitet.

**Xentral-Abgleich D:** ⚠ PA-Auswahl per TextInput-ID statt Picker. ⚠ Mengenerfassung via `window.prompt`. ☐ Überfällig-Zeilen ohne Highlight.

---

## E — Beschaffung / Reorder (T-12) + Multi-Lieferant (T-05) + Eingangsrechnung / 3-Way-Match

1. **Reorder-Seite**, 3 Views: Auftragsübergreifend / Gruppiert / Mindestbestand.
   - 🔎 **`DT-REORDER-003`:** Pos 3 T-Shirt 200 − 5 Muster → Bedarf **195** (Loan subtrahiert).
   - ⚠ **`DT-REORDER-001` (KRITISCH):** Doppelklick „Bestellungen erzeugen" → **2 PurchaseOrders**
     (keine Business-Idempotenz, nur `setBusy()`-UX-Schutz). Probe: schnell 2× klicken, PO-Count prüfen.
   - ⚠ `DT-REORDER-002`: PO-Nummer = `BV-${Date.now()}-…` (kein NumberingService → **nicht** GoBD-lückenlos).
   - ⚠ `DT-REORDER-008`: Mindestbestand-Vorschlag **ohne Hauptlieferant** wird **still** entfernt (keine Warnung).
2. **Produktionsstart-Gate (T-05):** Multi-Komponenten-Artikel → Start erst, wenn **alle**
   Komponenten-Wareneingänge vollständig (`every(c => c.complete)`).
3. **Eingangsrechnung → 3-Way-Match (PO = WE = Rechnung):**
   - ⚠ **`IIN-001` (HOCH, Geld):** PO **10 €**, Rechnung **10,99 €** (Δ 99 ct) → wegen
     `tol = max(round(1000·0,02), 100) = 100 ct` fälschlich **GEPRUEFT** statt **GESPERRT**.
     Probe: genau diese Beträge → Status muss GESPERRT sein, ist GEPRUEFT.
   - 🔎 `IIN-002`: Rechnung über bestellter Menge → `MENGE_RECHNUNG_UEBER_BESTELLUNG`; über WE →
     `MENGE_RECHNUNG_UEBER_WARENEINGANG` (beide Varianzen unabhängig).

---

## F — Lager / Bestand (Append-Only Ledger)

1. **Auto-Reservierung** bei Auftragsanlage (oben): verfügbar sinkt, Ledger unverändert.
   - 🔎 `TST-003/004`: `verfügbar = onHand − AKTIVE Reservierungen`.
2. **Lieferung/Versand:** Auftrag liefern.
   - ⚠ **`TST-012` (KRITISCH, zentraler Fachfehler):** VERSENDET bucht **keine** VERBRAUCH-Bewegung.
     Probe: nach Versand `SELECT SUM(deltaQty) FROM StockMove WHERE variantId=…` **unverändert**;
     Reservation-Status = ERLEDIGT, aber onHand **nicht** reduziert.
3. **Overselling:**
   - 🔎 `TST-013`: onHand 50 + Auftrag 70 → `verfügbar = −20`, **kein Hard-Stop** (nur UI rot).
4. **Inventur / Multi-Lager:**
   - 🔎 `TST-001`: kein direktes Setzen, nur Bewegungen. 🔎 `TST-002`: HAUPT/MUSTER/SHOWROOM/TRANSFERDRUCK getrennt.
   - 🔎 `TST-014`: Freitext-Pos 5 (Cap) → `materializeArticle` setzt `bestandsgefuehrt=false` → **keine** Reservierung.

---

## G — Muster / Leihgut (SampleLoan)

1. **Muster ausgeben:** Pos 3, 5 Stück → Abgang Lager MUSTER, DueItem.
   - ⚠ **`T-SAMPLE-002` (KRITISCH):** Sammel-Ausgabe (`issueMulti`) setzt `dueDate = ausgegebenAm`
     **statt +21 Tage**. Probe: `SELECT dueDate FROM DueItem WHERE entityId=loan.id` = Ausgabedatum (Bug).
     Gegenprobe Einzel-`issue`: korrekt +21 Tage.
2. **Rückgabe < 21 Tage:** keine Rechnung, Lager-Saldo 0 (`T-SAMPLE-001/003`).
3. **Überfällige berechnen:** Listenpreis-Rechnung; Preis-Fehler bricht Massenlauf **nicht** ab (`T-SAMPLE-004`).
   - ⚠ Musterrechnung teilt den **INVOICE-Nummernkreis** mit echten Rechnungen (GoBD-Verwirrung).

---

## H — Versand & Tracking (T-06/T-09)

1. **`listShippable`:** nur status=VERSANDBEREIT ∧ Lieferadresse ∧ ¬liefersperre ∧ qsStatus=BESTANDEN.
   - 🔎 `T-06-02/03`: Auftrag mit liefersperre / qsStatus≠BESTANDEN → **nicht** in der Liste.
2. **`confirmShipped(orderId, trackingNumber, carrier)`** → VERSENDET + lieferstatus=VOLL + Outbox-Event.
   - 🔎 `T-06-04`: genau **ein** OutboxEvent, payload `status='VERSENDET'`, `.trackingNumber`, `.carrier`.
   - ⚠ **`T-06-05` (HOCH):** `confirmShipped` **zweimal** → **2** Outbox-Events (keine Idempotenz →
     doppelter Shop-Push). Probe: `SELECT COUNT(*) FROM OutboxEvent WHERE aggregateId=orderId AND type='order.status.update'` = 2 (Bug).
   - ⚠ `T-06-06`: ohne Lieferadresse trotzdem VERSENDET + Tracking ohne echtes Label.
3. **Tracking-URL** je Carrier korrekt (DPD/DHL/UPS/GLS).

**Xentral-Abgleich H:** ⚠ `DEFAULT_WEIGHT_GRAMS=1000` hart → falsche DPD-Kosten. ⚠ kein Multi-Parcel.

---

## I — Faktura / Abschlag / Gutschrift / E-Rechnung / DATEV

1. **Rechnung** (`createFromOrder`): RE-Nummer, OP-Anlage, USt je Satz aggregiert.
   - 🔎 `INV-001`: zweiter Call → „bereits fakturiert"/unique-Violation (`orderId @unique`).
   - 🔎 **`INV-ROUND-100` (KRITISCH, Geld):** 100 Positionen à 1 ct (19 %) → je Zeile `round(0,19)=0`
     → Gesamt-Steuer **0** statt 19 ct (kein Summen-Residual). Probe: `taxCents` der Response.
   - 🔎 `INV-003`: Mischsteuer 7 %+19 % → je Satz aggregiert, korrekte `taxCents`/`grossCents`.
2. **Gutschrift:** Vollgutschrift neutralisiert OP, ändert Rechnung **nicht** (Storno-Prinzip).
   - 🔎 `GUT-001`: zweite Vollgutschrift → gesperrt (`remaining<=0`). 🔎 `GUT-002`: Restock → StockMove KORREKTUR +qty.
3. **Abschlag (% / Festbetrag):** Restsummen-Tracking.
   - 🔎 `ABG-001`: 30 % + 50 €, dann 30 € > Rest 20 € → Error.
   - ⚠ **`ARC-001` (KRITISCH, GoBD):** Abschlag wird **nicht** WORM-archiviert und **nicht** im
     `archive.missing`-Report gelistet. ⚠ Abschlag hat **keinen PDF-Generator** → weder PDF noch Outlook.
4. **E-Rechnung (CII-XML):** EN16931-Kernprofil; 🔎 `EINV-003`: Name/Verwendungszweck mit `"` → XML-Escaping (`esc` deckt `'`/`"` **nicht** ab).
5. **DATEV-Export:** ⚠ **`DATEV-001` (HOCH, GoBD):** Gutschrift −50 € → `datevAmount` nutzt `Math.abs` →
   Zeile zeigt `50,00` **ohne** Vorzeichen (Soll/Haben-Fehlbuchung).

---

## J — Banking / Zahlungsabgleich (T-13) + SEPA-Auszahlung

1. **CAMT.053-Import** (nur CRDT): 🔎 `BC-CONN-002`: gemischter Batch CRDT+DBIT → nur CRDT erzeugt Payments.
   - 🔎 `T-13-001/002`: wiederholter Import idempotent (`existingExternalRefs`).
2. **Match** (Rechnungsnummer im Verwendungszweck):
   - ⚠ **`T-13-004` (HOCH):** Ref enthält „RE-1" **und** „RE-11" → `.includes`-Matching → MEHRDEUTIG/Falsch-Positiv.
   - 🔎 `T-13-003`: 120 € auf OP 100 € → alloc 100, Klärung UEBERZAHLUNG 20, matched=false.
   - 🔎 `T-13-011`: manuelle Zahlung > openCents → **negative** openCents (kein Min-Check).
3. **SEPA pain.001 (Auszahlung):**
   - 🔎 `SEPA-002`: 3 Transfers 10/20/30 € → `NbOfTxs=3`, `CtrlSum=60.00`, in GrpHdr **und** PmtInf identisch.
   - 🔎 `SEPA-001`: Remittance 141 Zeichen / Betrag 0 / ungültige IBAN → Error.
   - 🔎 **`SEPA-004`:** Auszahlung gegen eine **GESPERRT**-Eingangsrechnung (aus E/`IIN-001`) muss blockieren.

---

## K — Mahnwesen (Dunning, T-14)

1. **Mahnlauf** (`dunning.run`): überfälligen OP analysieren (daysOverdue, targetLevel).
   - 🔎 `dun-10`: 30 Tage überfällig, Level 0 → **Level 1** (max +1 Stufe/Lauf, nicht 3).
   - 🔎 `dun-02`/`dun-13`: Doppelklick parallel → nur **1** Notice (Optimistic-Guard `WHERE dunningLevel=N-1`).
2. **Gebühren** (0/5/10 €) je Stufe; **Mahnsperre** blockt alle Posten der Firma (`dun-14`).
3. **Vollzahlung nach Mahnung:**
   - ⚠ **`dun-04` (HOCH, Fachfehler):** `dunningLevel` wird nach Vollzahlung **nicht** zurückgesetzt
     (openCents=0, aber Mahnstufe bleibt 3). Probe: OP voll bezahlen → Level prüfen.
4. **WORM-Archiv + Outlook:** Mahnung-PDF deterministisch, `dun-15`: zweimal archivieren → 1 Eintrag,
   identischer SHA-256. ☐ „In Outlook" → `.eml` mit Mahnungs-PDF + Empfänger.

**Xentral-Abgleich K:** ⚠ Mahnnummer nicht sprechend (`MA-1-ABC123`). ⚠ Kunde in der Mahnliste nicht sichtbar (kein companyName). ⚠ keine Automatisierung (nur Button).

---

## Ergebnis-Erfassung

Pro Stufe notieren: **PASS** / **GAP (Xentral)** / **DEFEKT (bestätigt)** / **NEU (nicht im Briefing)**.
Die mit ⚠ markierten Punkte sind **erwartete** Defekte aus dem Briefing — Ziel ist sie zu **bestätigen**
oder zu widerlegen. Alles, was ein 🔎 unerwartet bricht (Crash, 500, Dateninkonsistenz), ist ein
**NEU**-Befund und gehört zurück an die Entwicklung.
