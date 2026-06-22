# TEXMA-ERP auf ERPNext — Schritt-für-Schritt von 0 (Managed-Test)

> **Für wen:** TEXMA-Mitarbeiter ohne IT-Vorkenntnisse. Ziel: ERPNext (EU-gehostet,
> **deutschsprachig**) aufsetzen, die TEXMA-Custom-App `texma_veredelung` installieren und die
> Abnahme-Testfälle aus dem Lastenheft durchspielen — **ohne** etwas selbst zu programmieren.
>
> **Was wo liegt:** App-Code: `erpnext/texma_veredelung/` · Architektur/Abbildung: `erpnext-aufbau-plan.md`
> · Strukturbegründung: `erpnext-tiefenabgleich.md` · Fachliche Wahrheit: `lastenheft.md`.
>
> **Kosten klein halten:** Frappe Cloud EU im günstigsten Tarif; die großen 70 % (Buchhaltung,
> Lager, Updates, Backups) pflegt der Anbieter/die Community — du baust/pflegst nur die 30 % Custom.

---

## Schritt 0 — Voraussetzungen (einmalig)

- Ein **GitHub-Konto** (kostenlos) — um die App `texma_veredelung` für Frappe Cloud bereitzustellen.
- Eine **Zahlungskarte** für Frappe Cloud (kleinster Tarif; Testphase oft kostenlos).
- Dieser Repo-Ordner `erpnext/texma_veredelung/` (die fertige App).

---

## Welche Installationsvariante? (wichtig wegen Custom-App)

TEXMA braucht die **Custom-App** `texma_veredelung`. Das schließt eine Variante aus:

| Variante | Custom-App installierbar? | Aufwand | Für uns |
|---|---|---|---|
| **Frappe Cloud (Managed, EU)** | **Ja** (App aus GitHub anbinden) | gering | **✅ empfohlen** — Backups/Updates/Support inklusive |
| Docker **`pwd.yml`** (Schnell-Demo) | **❌ Nein** (laut Frappe: „You will not be able to install custom apps") | sehr gering | nur zum *Anschauen* von ERPNext, **nicht** für unseren Test |
| Docker **Produktions-Setup** (`frappe_docker`, volle Doku) | Ja | hoch (Self-Host, Server, Wartung selbst) | nur wenn bewusst Self-Host gewünscht |
| **Lokaler Bench** (`bench`-Install-Skript, MariaDB etc.) | Ja | mittel (Entwicklermaschine) | für *meine* Iteration / Entwicklung sinnvoll |

> **Fazit:** Für „Kosten klein halten + wenig Eigenaufwand + Custom-App" → **Frappe Cloud (EU)**.
> Der schnelle `docker compose -f pwd.yml up` ist **bewusst eine Wegwerf-Demo ohne Custom-Apps** —
> damit lässt sich unsere TEXMA-Logik nicht prüfen.

---

## Schritt 1 — App auf GitHub bereitstellen

1. Neues **privates** GitHub-Repo anlegen, z. B. `texma_veredelung`.
2. Den Inhalt von `erpnext/texma_veredelung/` (also `pyproject.toml`, `texma_veredelung/`, …) in
   dieses Repo hochladen (Wurzel = `pyproject.toml`).
3. Repo-URL notieren (z. B. `https://github.com/<konto>/texma_veredelung`).

---

## Schritt 2 — ERPNext-Site auf Frappe Cloud (EU) erstellen

1. Auf **frappecloud.com** registrieren, **Region: Europe (EU)** wählen (DSGVO).
2. **New Bench Group** (Frappe Version `version-15`), App **ERPNext** hinzufügen.
3. **Custom-App hinzufügen:** im Bench unter „Apps" → „Add App" → „From GitHub" das Repo
   `texma_veredelung` verbinden (privat = Zugriff erlauben).
4. **New Site** erstellen (z. B. `texma.frappe.cloud`), bei den Apps **ERPNext** *und*
   **texma_veredelung** anhaken → Site wird gebaut.

> Beim Site-Bau werden ERPNext-Standard **und** unsere Custom-App installiert; die Custom Fields
> (Shop-ID, Mahnsperre, Standard-Stückliste, „Ist Veredler") legt die App automatisch an (Fixtures).

---

## Schritt 3 — Oberfläche auf Deutsch stellen (Pflicht, Lastenheft Z. 939/986)

1. Als Administrator einloggen.
2. Suche oben → **„System Settings"** öffnen → Feld **Language** = **Deutsch (de)** → Speichern.
3. Pro Benutzer zusätzlich: **„Meine Einstellungen" → Sprache = Deutsch**.
4. Region: **Country = Germany**, **Time Zone = Europe/Berlin**, **Währung = EUR**.

Danach ist die gesamte Oberfläche deutsch; die TEXMA-Begriffe (Veredelung, Veredelungspreis,
Stickerei-Partner, Logo) kommen aus der Custom-App.

---

## Schritt 4 — Grunddaten anlegen (Stammdaten)

In dieser Reihenfolge (jeweils über die Suche den Listennamen eingeben → „Neu"):

1. **Unternehmen** prüfen (bei Site-Erstellung gesetzt): Name, Steuernummer/USt-IdNr.
2. **Kunde** (Customer) anlegen. Wichtig für **T-01**: Feld **„TEXMA Shop-ID"** mit der Kennung des
   WooCommerce-Shops füllen (genau **ein** Firmenkunde je Shop).
3. **Artikel** (Item) mit Varianten (**T-02**): „Hat Varianten" = ja, **Artikelattribute**
   „Farbe" und „Größe" hinterlegen → Varianten erzeugen.
4. **Lieferanten** (Supplier): TEXMAs Veredler mit Häkchen **„Ist Veredler"** (z. B. Siebdruck-Partner,
   3 Stickerei-Partner — Lastenheft Z. 130).
5. **Stickerei Partner** (Custom): die 3 Partner anlegen, Priorität setzen, „Aktiv".
6. **Veredelungspreis** (Custom, **T-08**): je Veredelungsart (DTF/Transferdruck, Flex/Flock,
   Silberreflex, Plastisol-Transfer, Siebdruck, Stickerei) **EK** eintragen → **VK = EK × 1,88**
   wird automatisch berechnet. Für einzelne Kunden eigene Zeile mit Feld „Kunde" = kundenindividuell.

---

## Schritt 5 — Standardprozesse konfigurieren (je Testfall)

Kurzfassung; Details in `erpnext-aufbau-plan.md`, Abschnitt 3.

| Lastenheft | Einstellung in ERPNext |
|---|---|
| **T-03** kundenspez. Stückliste | Pro Artikel eine **Stückliste (BOM)**; am Kunden/Artikel Feld „TEXMA Standard-Stückliste" setzen |
| **T-04** mehrstufige Fremdvergabe | **Subcontracting** aktivieren; Kette Siebdruck → Stickerei als zwei Subcontracting-Aufträge; Rücklauf über „Subcontracting Receipt" buchen |
| **T-05** Multi-Lieferant-Gate | Mehrere **Bestellungen** je Fertigungsauftrag; Start blockt, bis alle Wareneingänge da sind |
| **T-08** Staffel/Preisgruppen | **Preislisten** je Kundengruppe + **Preisregeln** (Mindest-/Höchstmenge); Veredelungs-VK über Custom-App |
| **T-11** Produktionszettel | **Druckformat** auf Fertigungsauftrag (separate Vorlagen DTF/Flex/Flock) |
| **T-12** Mindestlager-Reorder | Am Transferdruck-Artikel **Nachbestellpunkt** setzen → autom. Materialanfrage |
| **T-14** Mahnwesen | **Zahlungsbedingungen** + **Mahnwesen**; Kunde „Mahnsperre" wird respektiert |

**Integrationen (nächste Stufe, brauchen Zugangsdaten):** WooCommerce-Ingest (**T-01**) + Status-Push
(**T-09**), DPD-Label (**T-06**), DATEV/Addison-Export (**T-07**), Banking-Import (**T-13**). Diese
Logik liegt als Gerüst in der App (`api/woocommerce.py`, `api/shipping.py`) mit markierten
Integrationspunkten — sie wird scharf geschaltet, sobald Shop-/DPD-/Bank-Zugänge vorliegen.

---

## Schritt 6 — Abnahme: die 14 Testfälle durchspielen

Genau die Fälle aus dem Lastenheft (Kap. 25, Tabelle T-01…T-14). Erfolg = Spalte „Erwartetes Ergebnis".

1. **T-01:** Mehrere Shop-Bestellungen importieren → alle landen beim **einen Firmenkunden**, **0** neue Kundensätze.
2. **T-02:** „Polo Blau XL" → korrekte Variante, kein Mapping-Fehler.
3. **T-03:** Auftrag eines Kunden → richtige Veredelungs-Stückliste automatisch.
4. **T-04:** Fertigungsauftrag → Unterauftrag Siebdruck → Stickerei; **Rücklauf buchbar**.
5. **T-05:** Textil von 2 Lieferanten → Start erst nach **beiden** Wareneingängen.
6. **T-06:** DPD-Label erzeugt, Tracking am Auftrag.
7. **T-07:** DATEV-Export → fehlerfrei in Addison importierbar (mit Steuerberater).
8. **T-08:** Premium-Kunde → Premium-Preise; Veredelungs-VK = EK × 1,88.
9. **T-09:** Status „Versendet" → Shop aktualisiert + Tracking.
10. **T-10:** Auftrag abschließen → DB-Soll vs. DB-Ist angezeigt.
11. **T-11:** Produktionszettel-PDF mit allen Pflichtfeldern.
12. **T-12:** Transferdruck unter Mindestlager → Bestellvorschlag.
13. **T-13:** Zahlungseingang → offener Posten automatisch ausgeglichen; Unklares in Klärungsliste.
14. **T-14:** Überfällige Rechnung → Mahnung Stufe 1; **Mahnsperre** respektiert.

---

## Schritt 7 — Laufender Betrieb (klein halten)

- **Backups/Updates:** macht Frappe Cloud automatisch (RPO 24 h / RTO 8 h, Kap. 27).
- **Ein menschlicher Owner bei TEXMA:** eine Person als Verantwortliche/r (Benutzer/Rechte,
  Stammdatenpflege). Kein 24/7-Dienst nötig.
- **Custom-Anpassungen:** kommen als App-Update über GitHub → Frappe Cloud („Update available").

---

## Abgleich mit dem Lastenheft (Kontrolle)

| Lastenheft-Vorgabe | Umsetzung | Status |
|---|---|---|
| Aufschlagsfaktor **1,88** EK→VK (Z. 116) | `api/pricing.py` `DEFAULT_MARKUP = 1.88` | ✓ |
| Veredelungsverfahren DTF/Transfer, Flex/Flock, Silberreflex, Plastisol-Transfer, Siebdruck, Stickerei (Z. 25) | Auswahl in `Veredelungspreis.finishing_type` | ✓ (angeglichen) |
| **Durchgängig deutsche** Oberfläche, TEXMA-Begriffe (Z. 939/986) | Sprache = Deutsch (Schritt 3); deutsche Feld-/DocType-Labels | ✓ |
| Stickerei **3 Partner**, Siebdruck 1 Partner, gelegentlich mehrstufig (Z. 130) | `Stickerei Partner`-DocType; Subcontracting-Kette (T-04) | ✓ |
| **T-01** Firmenkunde, kein Phantom-Kunde | `api/woocommerce.py` `ingest_order` (mappt auf 1 Customer) | ✓ |
| **Mahnsperre** respektieren (T-14) | Custom Field `Customer.texma_mahnsperre` | ✓ |
| GoBD/keine Vollbuchhaltung (G1) | GL schlank + DATEV-Export (Schritt 5/aufbau-plan) | ⚠ im Workshop fixieren |
| DATEV→**Addison** (T-07, K-01) | Export-App/Custom; Format mit Steuerberater | ⚠ extern abzustimmen |

> **Hinweis:** Technische Feldnamen sind (wie im übrigen Code) englisch in snake_case
> (`texma_shop_id`) — die **sichtbare Oberfläche** ist vollständig deutsch. Das entspricht der
> Lastenheft-Vorgabe („deutschsprachige Oberfläche"), nicht „deutsche Variablennamen".
