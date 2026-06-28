# QA-Briefing — TEXMA ERP: End-to-End-Funktionstest (Vertriebspipeline → Mahnung)

**Auftrag:** Teste jede Funktion des ERP entlang des kompletten Geschäftsworkflows. Decke **alle
Schwächen, Lücken, Inkonsistenzen, Hürden und Fehler** auf — fachlich (falsche Berechnungen,
fehlende Verknüpfungen), technisch (Fehler/Abbrüche), UX (Klickpfade, Beschriftungen, Überlauf)
und Konsistenz (Muster über Module hinweg).

**Du bist Elite-Webentwickler & QA-Engineer.** Maxime = **Xentral**: jede Funktion startet als
browsbare Liste, ein einheitliches Zeilen-Aktionsmenü, verlustfreie Belegkette, keine rohen IDs,
Geld immer in Cent, Rollen sauber getrennt. Bewerte gegen diese Maxime.

---

## 0. Setup & Kontext

**Stack:** pnpm-Monorepo. `apps/web` (React + Mantine + Vite, Hash-Routing), `apps/api`
(Fastify + tRPC + Prisma), `packages/shared` (reine Domänenlogik), `packages/db` (Prisma + SQL-
Migrationen). DB = PostgreSQL (Docker `docker-compose.dev.yml`, Port 5432, `texma/texma`).

**Lokal starten:**
```
docker compose -f docker-compose.dev.yml up -d
pnpm install
pnpm --filter @texma/db exec prisma generate
pnpm --filter @texma/db migrate:deploy
pnpm db:seed                 # Demo-Stammdaten
pnpm --filter @texma/api build && pnpm dev:api      # Terminal 1
pnpm dev:web                                          # Terminal 2
```
Web: `http://localhost:5173`, API: `http://localhost:3000`.

**Rollen (RBAC) — mit jeder durchspielen:**
- `ADMIN`, `BUERO` → dürfen alles Kaufmännische (`canAct`).
- `BUCHHALTUNG` → Finanzdaten/Ampel, aber keine Produktionsfreigaben.
- `PRODUKTION` → **darf KEINE Preise/Kundendaten sehen** und keine kaufmännischen Folgeaktionen
  auslösen. **Prüfe gezielt:** Sind in den Auftrags-/Angebotslisten als PRODUKTION wirklich
  Preise/Summen/Kundennamen ausgeblendet? Fehlt die Aktionsspalte? Tauchen Preise irgendwo durch
  (Tooltip, PDF, Netzwerk-Response) doch auf? → **Security-relevant, hoch priorisieren.**

**Technik-Tipp:** Vite-Dev-Server liefert den Quelltext (`/src/*.tsx`) und das tRPC-Backend ist
unter `/trpc/*` abklopfbar. Nutze die Browser-DevTools (Network-Tab) — prüfe HTTP-Status,
Response-Payloads (leckt PRODUKTION Preise?), falsche Verben (Query als POST → 405) und ob
Fehlermeldungen benutzerlesbar sind statt roher tRPC-Stacktraces.

---

## 1. Das komplexe Test-Szenario (so realitätsnah wie möglich)

Lege diese **eine konkrete Anfrage** an und ziehe sie durch den **gesamten** Workflow. Sie ist
bewusst so gebaut, dass sie jede Mechanik triggert (mehrere Textilien, mehrere Veredelungsarten
extern + inhouse, Größenlauf, Muster, Beschaffung, Teilrücklauf/Schwund, Teillieferung, Faktura,
Mahnung).

**Kunde:** „Bergblick Outdoor GmbH" (Neukunde — erst im CRM, dann anlegen).
**Anlass:** Team-Ausstattung + Merchandise für eine Messe, Liefertermin in 4 Wochen.

**Positionen der Anfrage:**

| # | Textil | Farbe / Größenlauf | Menge | Veredelung |
|---|--------|--------------------|-------|------------|
| 1 | Poloshirt Premium (Stanley/Stella) | Navy, S–XXL | 200 | Siebdruck Brust + Rücken (**extern**, 2 Stufen) |
| 2 | Softshell-Jacke | Schwarz, S–XXL | 60 | Stickerei Logo links (**extern**) |
| 3 | T-Shirt Basic | Weiß, S–XXL | 300 | Transferdruck Vorderseite (**inhouse**) |
| 4 | Cap | One-Size | 150 | Stickerei Frontlogo (**extern**) |
| 5 | Hoodie | Grau, S–3XL | 80 | Siebdruck Brust (**extern**) + Transfer Ärmel (**inhouse**) — 2 Stufen, gemischt |

**Sonderfälle, die bewusst getestet werden sollen:**
- **Freitext-Position** mitten in der Anfrage (z. B. „Sonderanfertigung Bandana, Design folgt") —
  ohne Stammartikel. → Muss erfassbar sein und sich später in einen festen Artikel wandeln lassen.
- **Muster/Leihgut:** Von Position 1 (Polo Navy) gehen **5 Stück als Anprobe-Muster** an den Kunden
  raus, kommen zurück und werden auf die Gesamtbestellung angerechnet (Bestellung **195**, nicht 200).
- **Teilrücklauf/Schwund** bei der externen Veredelung (Siebdruck): 200 beigestellt, **195 zurück**,
  5 Ausschuss.
- **Teillieferung + Teilrechnung (Abschlag).**

---

## 2. End-to-End-Workflow (Schritt für Schritt) — jede Stufe prüfen

Arbeite die Stufen **in dieser Reihenfolge** ab. Notiere bei jeder Stufe: Funktioniert es?
Ist alles verknüpft? Stimmen Zahlen/USt/Cent? Gibt es UX-Brüche?

### Stufe A — Vertriebspipeline (CRM)
1. `#pipeline` öffnen → ist es eine **sofort befüllte, durchsuchbare Liste** (kein leerer Picker)?
2. Neuen CRM-Eintrag „Bergblick Outdoor GmbH" anlegen (Quelle, Ansprechpartner, Budget, Wunschtermin).
3. **Anfrage-Positionen erfassen:** Eintrag bearbeiten → die **Positions-Maske wie im Angebot** nutzen.
   - Artikel/Variante per Picker wählen **und** mind. eine **Freitext-Position** schreiben.
   - **Größenlauf** (Navy S–XXL je Stückzahl) als Mengen-Matrix erfassen → löst es in Einzelpositionen auf?
4. **PDF-Export** der Anfrage testen (Button „Anfrage – PDF"). Stimmen Empfänger, Positionen, Summen?
5. Funnel durchschalten: NEU → Kontaktiert → Qualifiziert → **„→ In Angebot wandeln"**.
   - **Prüfe:** Springt die Ansicht direkt in den neuen Auftrag/das Angebot? Sind die Anfrage-
     Positionen (inkl. Freitext) **verlustfrei** im Angebot? Bleibt die Verknüpfung sichtbar?
   - **Sonderfall:** Wandeln **ohne** zugeordnete Firma → klare Meldung (BAD_REQUEST/Tooltip),
     **kein** 500er, Button ggf. deaktiviert.

### Stufe B — Angebot
6. Angebot öffnet im Editor (Tabs, Sticky-Save-Bar, Live-Summen). Positionen prüfen/ergänzen.
   - **Freitext → fester Artikel:** Lässt sich die Freitext-Position über den Picker „+ anlegen"
     in einen echten Artikel/Variante wandeln? Trägt die Position danach `variantId` + EAN?
   - **Preis-Eingabe-Härtetest:** Tippe „9.90", „9,90", „1.234,56" — ergeben alle drei in
     **Angebots- UND Auftrags-Editor identische** Cent-Werte (990/990/123456)? (Kein 100×-Fehler!)
   - **0-€-/Leer-Validierung:** Angebot mit leerer/0-€-Position speichern → wird sauber blockiert?
7. Angebot als **PDF herunterladen** und **„In Outlook öffnen"** (Aktionsmenü) → öffnet die `.eml`
   in Outlook mit **Empfänger (aus Kontakt), Betreff, Text und PDF-Anhang**? (Keine leere An-Zeile,
   kein stiller Versand.) **Fehlt die Kontakt-E-Mail → klarer Hinweis.**
8. Status: ENTWURF → „→ Versendet". Dann **„Annehmen & in Auftrag wandeln"**.
   - **Größenlauf-Auflösung:** Beim Wandeln müssen offene/freie Positionen auf konkrete Varianten
     aufgelöst werden (Größen-Matrix). Prüfe, dass jede Auftragsposition eine `variantId` trägt.
   - Erneutes Wandeln desselben Angebots → **kein zweiter Auftrag** (Idempotenz/„Auftrag erstellt").

### Stufe C — Auftrag
9. Auftrag öffnet sich (View springt hinein). Belegkette-Tab: Angebot ↔ Auftrag verknüpft sichtbar?
10. **Folgeaktionen direkt am Auftrag** vorhanden? („Produktionsauftrag/Fremdvergabe erzeugen",
    „Auftragsbestätigung – PDF / In Outlook", Transferdruck-Bezug, Beschaffung).
11. **Auftragsbestätigung** als PDF + Outlook aus der **Auftragsliste** UND dem Detail testen.
12. **Auftragsliste-Layout:** Bei Fensterbreite ≥1280 px — sind Eil-Stern, Ampel und „Aktionen ▾"
    **ohne horizontales Scrollen** sichtbar? Bleibt die Aktionsspalte beim Scrollen rechts fixiert
    (sticky, deckend)? Erscheint beim Laden ein Loader statt „Keine Daten."-Flackern?

### Stufe D — Muster / Leihgut
13. Aus dem Angebot/Auftrag 5 Polo Navy als **Muster-Leihgut** ausgeben (`#samples`).
    - Bucht es den Muster-Lagerstand (append-only Bewegung, kein direktes Setzen)?
    - Leihgut-Lieferschein als **PDF + Outlook** testen.
14. Muster als **zurückgenommen** buchen → Muster-Zugang gebucht? Rückgabefrist/DueItem?

### Stufe E — Beschaffung (Bedarf → Bestellung)
15. `#procurement`/Beschaffung öffnen → **sofort befüllte** Bedarfsübersicht (lieferantengruppiert)?
16. **Kernrechnung prüfen (kritisch):** Für Polo Navy sind **200 im Auftrag**, **5 als Muster**
    (zurückkommend) → **Bestellmenge muss 195** sein (nicht 200, nicht 205). Bestand zusätzlich
    abgezogen. Quellen je Variante nachvollziehbar?
17. Bestellungen je Lieferant erzeugen → 1 Klick = 1 Bestellung? Lieferant verlinkt (Name, kein cuid)?

### Stufe F — Produktion & mehrstufige Fremdvergabe
18. **Produktionsauftrag** aus dem Auftrag erzeugen → werden die **Fremdvergabe-Stufen automatisch
    geplant** (Polo: 2 Siebdruck-Stufen; Hoodie: Siebdruck extern → Transfer inhouse, sequenziell)?
19. `#subproduction` (Fremdvergabe) → **browsbare Übersicht aller offenen Stufen** (kein ID-Picker)?
20. **Beistell-Positionen prüfen:** Kennt der Veredler-Auftrag die konkrete beigestellte Ware
    (Variante + Menge), oder ist `beistellPositionen` leer?
21. Stufe durchschalten: **Beistellung versenden** → **Rücklauf buchen (200 raus, 195 zurück,
    5 Schwund)** → **Abschließen**. Sequenzgate: Startet Stufe 2 erst nach Rücklauf von Stufe 1?
    Inhouse-Stufe (Transfer) ohne Beistellung abschließbar?
22. **Veredelungsauftrag (Werkstattblatt)** als PDF + **„In Outlook (Veredler)"** — Empfänger =
    hinterlegte Veredler-E-Mail (z. B. hi5 GmbH)? Größen-Matrix + Veredelungspositionen drauf?
23. **Produktionsstart-Gate (T-05):** Startet die Produktion erst bei vollständigem Wareneingang?
24. QS-Foto / Qualitätssicherung am Auftrag.

### Stufe G — Wareneingang & 3-Way-Match
25. `#wareneingang` → Wareneingang zur Bestellung buchen. Multi-Lieferant-Gate?
26. Eingangsrechnung erfassen → **3-Way-Match** (Bestellung = Wareneingang = Eingangsrechnung):
    Abweichung → Sperre/Klärung?

### Stufe H — Versand
27. `#shipments` (Versand) → versandbereite Aufträge gelistet (inkl. `lieferstatus VOLL`)?
28. Versand bestätigen (Carrier + Tracking) → Status VERSENDET, **Tracking-Link** carrierspezifisch
    klickbar? **Teillieferung** testen (nicht alle Positionen) → Status korrekt (teilgeliefert)?
29. **Lieferschein** als PDF + Outlook.

### Stufe I — Faktura
30. Auftrag **fakturieren** (aus der Auftragsliste „Fakturieren (Rechnung erzeugen)") → erzeugt
    **echte Rechnung** (RE-Nr., USt **zentral** aus Settings, offener Posten), Status FAKTURIERT?
    Meldung mit RE-Nr. + Brutto?
31. **Abschlags-/Teilrechnung** am Auftrag anlegen (Abschläge-Tab) → Summen korrekt, „bezahlt"-Toggle?
32. **Rechnung** als PDF + **„In Outlook"** aus Auftragsliste UND Belegkette.
33. **Gutschrift/Storno** zu einer Rechnung → neutralisiert korrekt, Lagerbewegung, PDF + Outlook?
34. **USt zentral:** USt kommt aus `settings.defaultTaxRate`, **nicht** je Position frei. Steuerbefreit
    (0 %) sauber durchgereicht von Angebot → Auftrag → Rechnung?

### Stufe J — Zahlung & Banking
35. `#zahlungen` / Banking-Abgleich (CAMT.053-Import) → Zahlung dem offenen Posten zuordnen.
    Teil-/Überzahlung → Allokation, Rest → Klärungsliste?

### Stufe K — Mahnwesen (Abschluss)
36. Rechnung **nicht** bezahlen, Fälligkeit überschreiten → `#dunning` (Mahnwesen).
37. **Mahnlauf starten** → eskaliert Stufe 0→1→2→3 nach Fälligkeit? **Mahnsperre** (am Kunden
    setzbar) respektiert? Mahngebühr/Skonto korrekt?
38. **Mahnung je Posten** als **PDF + „In Outlook"** (mit Mahnbeleg-Anhang, Empfänger aus Kontakt).
39. **Kontextspalten prüfen:** Zeigt die Mahnwesen-Liste **Debitor/Schuldnername** und
    **Rechnungsnummer** (kein roher cuid als erste Spalte)? Summenzeile offener Beträge?

---

## 3. Querschnitts-Checks (in JEDEM Modul mitprüfen)

| Thema | Soll-Zustand |
|---|---|
| **Browsbarkeit** | Jede Funktion startet als gefilterte Liste — nie „erst ID wählen, dann erscheint etwas". |
| **Einheitliches Aktionsmenü** | Überall dasselbe „Aktionen ▾"-Kebab (Gruppen: Allgemein/Dokumente/Status & Folgeaktion/Gefahr). Keine überlaufenden Button-Reihen. Dropdown nicht abgeschnitten. |
| **PDF + Outlook überall** | Jeder Beleg mit PDF (Angebot, AB, Rechnung, Lieferschein, Gutschrift, Mahnung, Leihgut, Veredelungsauftrag, Anfrage) ist **als PDF UND als Outlook-Entwurf** erreichbar. **Ausnahme/Lücke prüfen:** Abschlagsrechnung hat (noch) kein PDF. |
| **Keine rohen CUIDs** | Nirgends `cmqwoqa6e…` in einer Tabellenzelle. Stattdessen Klarname + Beleg-/Kunden-Nr.; CUID höchstens als kurzes „#xxxxxx" mit Tooltip. |
| **Geld in Cent** | Alle Beträge korrekt (kein Float-Rundungsfehler, kein 100×-Fehler bei Punkt/Komma). |
| **Belegkette** | Jeder Beleg ist mit Vor-/Nachfolgern verknüpft und klickbar (Angebot↔Auftrag↔PA↔Rechnung↔Mahnung). Keine Sackgassen. |
| **Farbsemantik** | Rot nur destruktiv/Fehler/Storno/Löschen. Überfälligkeit/Warnung = Amber/Orange. |
| **Lokalisierung** | Keine englischen Tokens in deutscher UI („MANUAL"→„Manuell", „Invoice Number"→„Rechnungsnr."). |
| **Ladezustände** | Skeleton/Loader beim Laden, „Keine Daten" nur bei wirklich leerer Liste. Keine leeren `„"`-Empty-States. |
| **Filter ≠ Anlegen** | Kopfzeile = Such-/Filterleiste; „+ anlegen" öffnet Modal — keine als-Filter-getarnten Anlagefelder. |
| **Abgeschnittene Labels** | Keine Ellipsen in Steuerelementen („STAND…", „WIEDER…", „0…"). |
| **GoBD/Audit** | Finalisierte/versendete Belege werden archiviert (Archiviert-Badge). Bestand nur über Bewegungen (kein direktes Setzen). |
| **Fehlerbild** | Fachfehler als lesbare deutsche Meldung (kein roher Stacktrace, kein 500 für Validierung). Keine Dead-Links/404 im Menü. |

---

## 4. Defekt-Report — Format je Befund

Liefere die Befunde als priorisierte Liste. **Pro Befund:**

```
[ID]  Kurztitel
Schwere: KRITISCH | HOCH | MITTEL | NIEDRIG
Bereich/Screen: z. B. #orders Auftragsliste / Faktura
Schritte zur Reproduktion: 1) … 2) … 3) …
Erwartet: …
Tatsächlich: …
Beleg: Screenshot / Netzwerk-Response (Status + Payload) / Quelltext-Stelle (Datei:Zeile)
Einordnung: Fachfehler | Technik/Abbruch | UX | Konsistenz | Security
Fix-Vorschlag (optional): …
```

**Schweregrade:**
- **KRITISCH:** Datenverlust, falsche Beträge/Bestände, Security (PRODUKTION sieht Preise), Workflow
  bricht ab, Beleg nicht erzeugbar.
- **HOCH:** Funktion fehlt/verkettet nicht, falscher Status, Validierung als 500 statt 400.
- **MITTEL:** Konsistenz/UX-Bruch, abgeschnittene Spalten, englische Tokens, fehlende PDF/Mail-Option.
- **NIEDRIG:** Beschriftung, Politur, Tooltip.

**Wichtig:** Verifiziere jeden Befund am **aktuellen** Stand (`git pull origin main`) und prüfe im
Quelltext/Network-Tab gegen, ob es ein echter Defekt ist oder ein Bedienfehler — frühere Audits
liefen teils gegen veraltete Builds und meldeten bereits behobene „Fehler".

---

## 5. Erwartungs-Anker (damit du echte Fehler von Designentscheidungen trennst)

- **Freitext ist erlaubt** (Sonderleistung ohne Stammartikel) — der Picker ist Standard, Freitext
  bleibt als bewusster Fallback. Kein „Bug", wenn Freitext speicherbar ist.
- **Muster werden vom Auftragsbedarf abgezogen** (200 − 5 = 195) — bewusste Geschäftsregel.
- **USt zentral** über Settings, nicht je Position frei wählbar — bewusst.
- **Mahnwesen/Lieferanten** dürfen wenige Inline-Buttons behalten, wenn kein Überlauf entsteht.
- **Inline-Controls** (Eil-Toggle bei Aufträgen, Stage-Select bei Verkaufschancen, Versand-Bestätigung)
  stehen bewusst neben dem Kebab, nicht darin.

**Aber:** Wenn eine dieser „Designentscheidungen" zu falschen Zahlen, leckenden Preisen oder toten
Verknüpfungen führt → **trotzdem als Defekt melden.**

---

## 6. Abnahme — der Test gilt als bestanden, wenn:

1. Die komplexe Anfrage läuft **ohne Abbruch** von Pipeline → Anfrage-PDF → Angebot → Auftrag →
   Produktion/Fremdvergabe → Beschaffung (195!) → Muster → Versand (Teil) → Faktura + Abschlag →
   Mahnung durch.
2. **Jeder** erzeugte Beleg ist als PDF **und** Outlook-Entwurf erreichbar (außer dokumentierte
   Abschlags-Lücke).
3. Alle Beträge/USt/Bestände stimmen (Stichproben gegen Handrechnung).
4. Als **PRODUKTION** sind nirgends Preise/Kundendaten sichtbar (UI **und** Netzwerk-Response).
5. Keine rohen CUIDs, keine Dead-Links, keine 500er für Validierungen, keine überlaufenden
   Aktionsspalten bei ≥1280 px.
6. Jede Liste ist browsbar und nutzt dasselbe Aktionsmenü-Muster.

> Ziel ist **nicht**, den Test zu „bestehen", sondern **maximal viele echte Schwächen aufzudecken**.
> Sei gründlich, adversarial und belege jeden Befund.
