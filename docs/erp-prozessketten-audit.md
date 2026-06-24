# Prozessketten-Audit — TEXMA ERP

Stand: 2026-06-24. Quelle: zwei manuelle End-to-End-Durchläufe (Lead → FAKTURIERT) durch
TEXMA + code-gestützter Foundation-up-Audit. Befund: **Das Grundgerüst der Kette steht**
(CRM-Funnel, Angebot/Auftrag-Kern, Statusmaschine), aber **prozessübergreifende
Verkettungen reißen** — der Status-Automat schaltet isolierte Labels, ohne die
nachgelagerten Vorgänge (Rechnung, Lager, Lieferung, Beschaffung) real auszulösen.

Legende: 🔴 kritisch (bricht Kernprozess) · 🟠 hoch (Daten/Konsistenz) · 🟡 mittel (UI/UX)
· ✅ behoben · 🟦 offen · 🔧 in Arbeit

---

## 1. Verkettungen (fachlich)

| # | Befund | Schwere | Status | Ort |
|---|--------|---------|--------|-----|
| 1 | **„Fakturiert" ohne Rechnung.** „→ FAKTURIERT" schaltete nur das Statuslabel; kein Beleg, keine RE-Nr., kein OP, kein DATEV/E-Rechnung. | 🔴 | ✅ | `pages.tsx` Order-Aktion → `invoices.createFromOrder` |
| 2 | Rechnungsliste zeigt nur `grossCents`. | 🟠 | ✅ | `listRecent` liefert jetzt Netto/USt/offen/Fälligkeit |
| 3 | **Auftrag bucht keinen Lagerbestand.** Verkauf/Produktion/Versand lösten keine `StockMove` aus → Hauptlager blieb 0. | 🔴 | ✅ | `prisma-delivery`/`prisma-goods-receipt` posten jetzt StockMove + StockLevel |
| 4 | Negativer Bestand (−3 MUSTER) unmarkiert. | 🟡 | ✅ | `fmtCell`: negative Zahlen rot |
| 5 | **Lieferstatus entkoppelt vom Status.** Auftrag „VERSENDET" ohne Lieferschein. | 🔴 | ✅ | → VERSENDET erzeugt Auto-Lieferschein (Bestandsabgang + `lieferstatus`). Produktions-Gate (canStart vor IN_PRODUKTION) bleibt als Verfeinerung offen |
| 6 | Offene Aufträge erzeugen keinen Beschaffungsbedarf. | 🔴 | ✅ | `openDemand` schließt jetzt IN_BEARBEITUNG ein (war fälschlich ausgeschlossen) |
| 7 | **Anfrage → Angebot ohne Inhalt** (nur Kunde, Text/Mengen verloren → 0,00 €). | 🟠 | ✅ | `convertToQuote` legt Start-Position aus Anfragetext an |
| 8 | **Anfrage-Anlage bricht hart** (`Unique constraint (number)`). | 🟠 | ✅ | Seed hebt INQUIRY-Kreis; zentraler errorFormatter filtert rohe DB-Fehler app-weit |
| 9 | Geister-Auftrag AB-2026-0005 (0 €, keine Positionen). | 🟠 | ✅ | Nachproduktion übernimmt jetzt die Positionen des Ursprungsauftrags |
| 10 | Quotes ohne Brutto/USt im Beleg/Liste. | 🟠 | ✅ | Angebotsliste zeigt Netto/USt/Brutto getrennt |

### Status-Automat vs. Folgeprozesse (Kern des Audits)
- **IN_PRODUKTION** ohne Bestands-/Wareneingangs-Gate (`canStartProduction` greift nicht).
- **VERSENDET** ohne Lieferschein/DPD/Bestandsabgang.
- **FAKTURIERT** früher ohne Rechnung (✅ behoben).
- Keine durchgehende Kette Auftrag → Produktionszettel → Wareneingang → Versand; jede Seite
  verlangt manuelle ID-Eingabe (Reklamation, Beschaffung, Lager: „ID eintippen statt auswählen").

### Weitere code-gestützte Befunde (Foundation-up-Audit)
- 3-Way-Match: **Auto-Trigger beim E-Rechnungs-Empfang** ✅ — sole-offene-PO wird verknüpft +
  Netto-Betrag automatisch abgeglichen (GEPRUEFT/GESPERRT). Separater `GoodsReceipt`-FK bewusst
  weggelassen (PO-Aggregation deckt die Wareneingänge ab).
- `StockReservation` bei Auftragsanlage ✅ — Lebenszyklus Anlage→Lieferung(verbraucht)→Storno(frei).
- `CreditNote`-Retoure bucht Lager-Zugang ✅ — optional beim Storno (kehrt den Versand-Abgang um).
- Produktions-Gate (canStart vor IN_PRODUKTION) ✅ — Statuswechsel blockiert bei unvollständigem WE.
- `DeliveryNote` → `Order.status` nicht auto-transitioniert (nur `lieferstatus`). 🟡 🟦 (bewusst manuell, K-26)

---

## 2. UI/UX-Defekte

| # | Befund | Status |
|---|--------|--------|
| 11 | Roh-JSON in „Nachbestellung" Spalte „Lines". | ✅ (`hide=["lines"]`) |
| 12 | Header „Total Ek Cents" + Euro-Wert widersprüchlich. | ✅ („EK gesamt" + EUR-Format) |
| 13 | Aufträge-Tabelle zu breit; Status-Buttons abgeschnitten. | ✅ (`Table.ScrollContainer`, Aktionen nowrap) |
| 14 | Rohe Enums (IN_PRODUKTION, NICHT, TEILWEISE) in Spalten. | ✅ (`prettyStatus`) |
| 15 | ID-/Sprachmix (cuid neben ord-1; „Quote Id"/„External Ref"). | ✅ teil (COL_LABELS dt.); cuid-Anzeige offen |
| 16 | Doppelaktions-Risiko: „→ Auftrag" bleibt nach Wandlung; kein Toast. | ✅ (Order-Toast + Badge „Auftrag erstellt", Button ausgeblendet) |

**Frühere QA-Listen (UI):** Kalender (echtes Monatsraster + Zeitzonen-Fix) ✅ · ID-Picker
(Reklamation/Beschaffung/Lager) ✅ · Nav-Köpfe navigierbar ✅ · Lieferanten-Redundanz ✅ ·
Lager/Banking in Tabs ✅ · Preis-Staffel-Eingabe in Euro ✅. Offen: cuid→sprechende Nummern;
Produktions-Gate (canStart vor IN_PRODUKTION); StockReservation bei Auftragsanlage;
CreditNote→Lager-Zugang; 3-Way-Match-Auto-Trigger; IncomingInvoice↔GoodsReceipt-FK.

---

## 3. Priorisierter Weiterbau (Reihenfolge)

**P0 — restliche Kern-Verkettung**
1. (✅) Faktura real · (✅) Wareneingang/Lieferung → Lager · (✅) Anfrage-Inhalt · (✅) AF-Nummern.
2. Offener Bedarf → Beschaffung (#6): offene Auftragszeilen in die Reorder-/Bedarfsrechnung.
3. Lieferschein-Auto-Trigger bei Versandbuchung + `canStartProduction`-Gate vor IN_PRODUKTION (#5).

**P1 — Konsistenz**
4. Guard „Auftrag/Faktura ohne Positionen" (#9); Rechnungs-/Quote-Liste um Netto/USt/Brutto (#2/#10).
5. `StockReservation` bei Auftragsanlage; `CreditNote`→Lager-Zugang; 3-Way-Match-Auto-Trigger.
6. tRPC-Fehler benutzerfreundlich filtern (kein roher Prisma-Text in der UI, #8).

**P2 — UI/UX**
7. ID-Picker statt Freitext (Reklamation/Beschaffung/Lager); Aufträge-Tabelle Horizontal-Scroll (#13);
   sprechende Belegnummern statt cuid (#15); „→ Auftrag" nach Wandlung ausblenden (#16).
</content>
