# Lastenheft ERP-Migration TEXMA Textilveredelung (v3.2)

Ablösung von CDH Office

| | |
|---|---|
| **Unternehmen** | TEXMA Textilveredelung GmbH, Herrenberg |
| **Dokument** | Lastenheft für ERP-Beratung und -Umsetzung (Make-or-Buy) |
| **Version** | 3.3 — Staffelpreise (Mengenstaffeln) in Angebotskalkulation (Kap. 4.4), Funktionsabdeckungs-Matrix (Kap. 31) und Pflicht-Testfälle (T-15, Kap. 15) ergänzt (ohne Budget) |
| **Funktionaler Maßstab** | Xentral (State of the Art / Benchmark) — Zielsystem offen, Make-or-Buy zu prüfen |
| **Altsystem** | CDH Office (lokal) |
| **Status** | Zur Angebotsanfrage freigegeben |

> **Xentral wird in diesem Lastenheft als State of the Art / funktionaler Maßstab verwendet** — es beschreibt, was ein gutes Zielsystem leisten muss. Das Zielsystem selbst ist offen. Kernauftrag der Beratung ist die Make-or-Buy-Bewertung: Lässt sich die beschriebene Funktionalität wirtschaftlich und dauerhaft betreibbar durch ein Standardsystem (Kauf/SaaS) abdecken, oder durch eine Eigenentwicklung bzw. einen Eigenbetrieb? Details in Kapitel 24.

# 1. Unternehmens- und Projektprofil

| **Merkmal** | **Ausprägung** |
|---|---|
| Branche | Textilveredelung (B2B/B2C-Mischmodell) |
| Mitarbeiter gesamt | 6 (2 Produktion, 4 Büro/Vertrieb) |
| Standorte | 1 |
| Aufträge pro Jahr | ca. 2.015 |
| Geschäftsmodell | Make-to-Order, kein Warenlager (Ausnahme: vorgefertigte Transferdrucke) |
| Veredelungsverfahren | DTF/Transferdruck (intern), Flex/Flock (intern), Silberreflex (intern), Plastisol-Transfer (extern bestellt, intern gepresst), Siebdruck (Fremdvergabe), Stickerei (Fremdvergabe, Ziel 2027 intern) |
| Mitarbeitershops | 10–12 aktiv, Ziel 30 in 3 Jahren |
| Aktive Artikel | über 5.000 + Varianten |
| Aktive Lieferanten | ca. 20 |

# 2. Ziele des Systemwechsels

## 2.1 Primäre Treiber

- **Variantenstruktur:** CDH kann keine echten Varianten (Farbe × Größe) — führt zu Artikelduplikaten und Datenchaos
- **Preisgruppenlogik:** in CDH nicht ausreichend abbildbar — manuelle Überschreibungen und Fehler entstehen
- **Prozessautomatiserung:** Von Anfrage bis Versand
- **Shopautomatisierung:** Ziel 30 Mitarbeitershops erfordert API-fähige ERP-Architektur
- **Technologische Modernisierung:** CDH ist lokal installiert, kein Cloud-Zugang, keine API-Fähigkeit, veraltete Software

## 2.2 Zielbild nach erfolgreichem Go-Live

- Vollständig digitaler Make-to-Order-Workflow ohne Excel-Parallelsysteme
- Automatischer Auftragsimport aus WooCommerce-Shops
- Strukturierte Produktionsaufträge mit Stücklisten je Veredelungsart
- Deckungsbeitrag je Auftrag und Artikel in Echtzeit sichtbar
- Nachkalkulation (Soll vs. Ist) eingeführt
- Lieferanten-API-Anbindung (wo vorhanden) für Stammdaten und Bestellungen
- Skalierung auf 30 Shops ohne proportionalen Büroaufwand

# 3. Shopstruktur & WooCommerce-Anbindung

## 3.1 Technische Shopstruktur

| **Parameter** | **Spezifikation** |
|---|---|
| Shoparchitektur | Separate WordPress-Installationen je Kunde (eigene Domain/Subdomain – Multisites); offen für flexiblere Modelle; Shopify Multistore |
| Anzahl Shops heute | 10–12 Installationen |
| Anzahl Shops Ziel | 30 + x |
| Produktstruktur | Standard WooCommerce Variable Products (Attribut: Farbe × Größe) |
| Preisanzeige | Nur nach Login sichtbar (login-geschützt) |
| Mitarbeiter-Login | Jeder Mitarbeiter hat eigenes WooCommerce-Kundenkonto |
| Lieferadresse | Unterschiedlich je Shop (teils freie Eingabe, teils fest — je Shop dokumentieren) |
| Technischer Betreuer | Externe Agentur mit WooCommerce-Erfahrung |
| Sortimentspflege | Sehr unterschiedlich je Kunde — Prozess muss vor Go-Live je Shop definiert sein |

## 3.2 Pflichtanforderungen WooCommerce-Connector

- Je Shop ein eigener WooCommerce-Connector in Xentral (10–12 zum Go-Live, skalierbar auf 30)
- Automatischer bidirektionaler Auftragsimport: WooCommerce → Xentral bei Status „processing“
- Alle Bestellungen aus einem Shop müssen dem Firmenkunden-Kundensatz in Xentral zugeordnet werden — nicht dem Mitarbeiter-Einzelkonto (kritische Konfiguration, im PoC testen)
- Produktattribut-Namen einheitlich in allen Shops: zwingend „Farbe“ und „Größe“ — keine Abweichungen
- Preisgruppe aus Xentral-Kundensatz wird via Connector an Shop übermittelt
- Statusrückmeldung Shop ← Xentral: mindestens „In Produktion“, „Versandbereit“, „Versendet“ mit Trackingnummer
- Xentral ist Preis-Master — kein manueller Preispflegeaufwand im Shop

**Kritische Architektur-Anforderung: Der WooCommerce-Connector muss so konfiguriert sein, dass WooCommerce-Mitarbeiterkonten auf den Xentral-Firmenkunden-Satz mappen. Falscher Aufbau = Hunderte Phantom-Kundensätze. Muss als Testfall #1 im Abnahmeprotokoll stehen.**

# 4. Auftragsabwicklung & Workflows

## 4.1 Auftragskanäle und Erfassung

| **Kanal** | **Heute** | **Soll in Xentral** |
|---|---|---|
| WooCommerce Shop | Manueller CDH-Import | Automatischer Import via Connector — kein manueller Schritt |
| E-Mail | Ausdrucken → manuell in CDH | Direkte Auftragsanlage in Xentral aus dem Mailkontext |
| Telefon | Papiernotiz → CDH | Sofortige Direkteingabe in Xentral |
| Persönlich / Showroom | Handschriftliches Briefing → CDH | Direkt in Xentral — identischer Prozess |

## 4.2 Workflow A — Shop-Bestellung (standardisiert)

1. WooCommerce-Bestellung eingeht → automatischer Xentral-Auftrag
2. Druckdaten-Link am Auftrag (bei Shops: immer vordefiniert, kein Upload nötig)
3. Produktionsauftrag automatisch aus Auftrag generiert
4. Tägliche Sammelbestellung Lieferanten (aus Xentral-Bestellvorschlag)
5. Wareneingang → Produktionsfreigabe
6. Produktion → Status „Abgeschlossen“
7. Faktura automatisch bei Versandabschluss
8. DPD-Label aus Xentral → Trackingnummer zurück an Shop

## 4.3 Workflow B — Projektauftrag (individuell)

1. Briefing / Anfrage → Projekt anlegen in Xentral
2. Angebot mit flexibler Stückliste (Textil + Veredelungspositionen variabel)
3. Digitale Darstellung / Mockup → als Anhang am Auftrag ablegen → per Mail aus Xentral versenden
4. Auftragserteilung per Mail / Telefon / persönlich → Freigabe als Kommentar am Auftrag dokumentieren
5. Bei Erstauftrag: Logo-Freigabe per Mail (PDF) mit Versionsstempel am Auftrag archivieren (Pflichtfeld)
6. Produktionsauftrag generieren → Stückliste final
7. Lieferanten bestellen → Produktion → QS
8. Faktura mit Versand / Abholung
9. Nachkalkulation: Soll-DB vs. Ist-DB (Zeitbuchung + Materialbuchung)

## 4.4 Angebotskalkulation

- Jede Veredelungsposition als separate Angebotszeile (nie Pauschalpreis)
- DB-Kalkulation bereits im Angebot sichtbar
- Stick-EK: manuell eintragen nach Dienstleister-Rückmeldung → Xentral berechnet VK über hinterlegten Aufschlagsfaktor (1,88)
- Mengenstaffeln (Staffelpreise): mengenabhängige Stückpreise je Position, die mit der Bestellmenge degressiv sinken. Besonders relevant bei der Veredelung, da sich die fixen Einrichtungskosten (Sieb, Stickdatei, DTF-/Transfer-Setup) auf die Stückzahl verteilen. Die Staffel ist je Artikel bzw. je Veredelungsart hinterlegbar und wirkt zusätzlich zur Preisgruppe des Kunden — Annahme: multiplikativ über dem Preisgruppen-Preis, von TEXMA zu bestätigen. Bei Mengenänderung im Angebot oder Auftrag wird der zutreffende Staffelpreis automatisch gezogen.
- Auftragsänderungen nach Status „In Bearbeitung“: nur über Storno + Neuanlage erlaubt

# 5. Produktionssteuerung

## 5.1 Produktionsmodell

| **Parameter** | **Spezifikation** |
|---|---|
| Fertigungstyp | Make-to-Order, Einzelauftragsfertigung (keine Loslogik) |
| Reihenfolge | Eingangsreihenfolge + manuelle Priorität bei Fixtermin; erst externe, dann interne Schritte |
| Durchlaufzeit | 1–4 Wochen je nach Verfahren und Volumen |
| Mehrstufigkeit | Ja — Basistextil + bis zu 3 Veredelungspositionen auf einem Artikel |
| Externe Veredler | Siebdruck (1 fester Partner) + Stickerei (3 Partner); gelegentlich mehrstufig |
| Produktionszettel intern | Separate Vorlage für DTF/Flex/Flock (Maschinenparameter, Temp., Zeit) |
| Produktionszettel extern | Separate Vorlage für Dienstleister (Artikel, Logo, Größe, Farbe, Positionierung, Anlieferungs-/Fertigstellungsdatum) |

## 5.2 Anforderungen Produktionsmodul

- Produktionsauftrag automatisch aus Kundenauftrag generierbar (1 Kundenauftrag = 1 Produktionsauftrag)
- Stückliste je Auftrag: Basistextil + Veredelungskomponenten (Transfer S/M/L, Siebdruck 1F/2F/3F, Stick individuell)
- Kundenspezifische Stücklisten-Vorlagen je Mitarbeitershop hinterlegbar
- Unterproduktionsaufträge für externe Veredler (PA → Unterauftrag Siebdruck, PA → Unterauftrag Stick)
- Statusworkflow: Angelegt → Freigegeben → In Bearbeitung → Abgeschlossen
- Kein Produktionsstart ohne dokumentierte Freigabe (Pflichtfeld)
- Zeiterfassung (Stechuhr): Mitarbeiter bucht Start/Stop je Produktionsauftrag
- Sollzeiten je Veredelungsart hinterlegt (vor Go-Live im Workshop definieren)
- Soll-Ist-Vergleich (Nachkalkulation) je Auftrag sichtbar
- Produktionsübersicht mit Ampelstatus (Lieferdatum) — ersetzt heutige Excel-Terminliste
- Konfigurierbare PDF-Produktionszettel (zwei Vorlagen: intern + extern)

## 5.3 Mehrstufige Fremdvergabe

Für Aufträge mit mehreren externen Veredlern nacheinander (kommt selten vor, muss aber abbildbar sein):

- Xentral bildet dies über Unterproduktionsaufträge ab: PA-001 → PA-001a (Siebdruck) → PA-001b (Stick) → Rücklauf
- Jeder Unterauftrag hat eigenes Datum, Status und Dienstleister-Bestellung
- Dieser Prozess muss im Proof-of-Concept demonstriert werden

## 5.4 Stickerei-Partnerauswahl

Siebdruck läuft über 1 festen Partner. Bei Stickerei (3 Partner) gilt eine zweistufige Logik:

- **Neukunde / neues Logo:** Angebotsanfrage an alle 3 Stickereien → Entscheidung nach Preis/Kapazität/Termin → Zuweisung; Sticker + Stickdatei werden danach am Kundensatz gespeichert
- **Bestandskunde mit bestehendem Logo:** immer gleicher Sticker, kein Angebotsverfahren; Stickdatei liegt bereits beim Partner

Umsetzung in Xentral: Kundensatz-Felder „Stickerei-Partner“ + „Stickdatei hinterlegt (Ja/Nein + Referenz)“. Befüllt = Direktbestellung; leer = Angebotsprozess.

## 5.5 Warenkommissionierung

Bei Wareneingang generiert Xentral automatisch einen Auftragszettel (Auftragsnummer + Kunde + Liefermenge), der der Ware beiliegt. Kommissionierung nach Kundenordnung bleibt physisch — wird durch Auftragszettel eindeutig zugeordnet.

## 5.6 Multi-Lieferant je Auftrag

Es gibt Aufträge, bei denen Textilien von mehreren Lieferanten (z. B. FHB + Stanley/Stella) für denselben Produktionsauftrag benötigt werden. Xentral muss Produktionsstart-Freigabe an vollständigen Wareneingang aller Positionen koppeln können. Pflicht-Testfall.

# 6. Beschaffung & Lieferanten

## 6.1 Bestellprozess

- Täglich gebündelte Sammelbestellungen je Lieferant (entspricht heutiger Praxis)
- Xentral generiert Bestellvorschlag aus allen offenen Produktionen → 1 Klick = 1 Bestellung je Lieferant
- Bestellübermittlung: API für ID Identity + Stanley/Stella; EDI für FHB (nexmart); PDF/Mail für restliche Lieferanten

## 6.2 Lieferantenstruktur

| **Lieferant** | **Anbindung** | **Priorität** |
|---|---|---|
| ID Identity | REST API + Order API (vollständig) | Phase 1 |
| Stanley/Stella | REST API (Produkte + Lager + Preise) | Phase 1 |
| HAKRO | REST API (HAKRO Connect) | Phase 2 |
| FHB | EDI via nexmart | Phase 2 |
| ERIMA, hummel, ENGEL, Greiff | EDI / Feed | Phase 3 |

## 6.3 Weitere Anforderungen

- Alternativlieferant je Artikel hinterlegbar (Priorität 1 + Priorität 2)
- Mindestbestand für vorgefertigte Transferdrucke (Kleinstlager) → automatische Nachbestellmeldung
- Wareneingang gegen Bestellung buchbar (Make-to-Order vereinfacht: Eingang → direkt PA freigeben)
- Eingangsrechnung-Abgleich gegen Bestellung (Phase 2)
- Lieferantenreklamation dokumentierbar (Fehlertyp, Menge, Datum)

# 7. Dateimanagement & Druckdaten

## 7.1 Anforderungen

- Bestehende Ordnerstruktur auf Kundenebene funktioniert gut — wird mit Xentral-Auftrag über Pflichtfeld „Datei-Link“ verknüpft
- Kleine Dateien (unter 10 MB: Freigabe-PDFs, Mockups, Vorschau-PNGs): direkt als Anhang am Xentral-Auftrag
- Große Dateien (über 10 MB: .ai, mehrschichtige PDFs): extern auf Google Drive / SharePoint
- Archivierungsdauer: mindestens 5 Jahre je Kundendatensatz
- Externe Ablagestruktur: Kunde → Jahr → Auftragsnummer (korrespondiert mit Xentral-Auftragsnummer)

## 7.2 Logo-Versionsverwaltung

- Je Kundensatz: Pflichtfeld „Aktive Logo-Version“ + Dateianhang der aktuellen Version
- Bei Auftragsanlage wird diese Version automatisch referenziert und am Auftrag hinterlegt
- Alte Versionen werden archiviert (nicht gelöscht) mit Datum der Ablösung
- Druckdaten: Neukunde neu, Bestandskunde Wiederverwendung
- Produktionsstart erst nach befülltem Freigabe-Feld möglich (Pflichtfeld)

# 8. Kundenstamm & CRM

## 8.1 Datenmodell

| **Ebene** | **Inhalt** |
|---|---|
| Kunde (Firma) | Firmenname, Rechnungsadresse, Preisgruppe, Zahlungsziel, Branche, aktive Logo-Version, Stickerei-Partner |
| Kontakte (1:n) | Name, Funktion, E-Mail, Telefon, Ansprechpartner-Rolle |
| Lieferadressen (1:n) | Mehrere Lieferadressen je Firma hinterlegbar, am Auftrag auswählbar |
| Shop-Zuordnung | WooCommerce-Connector je Shop → zeigt auf Firmenkunden-Satz |

## 8.2 Pflichtanforderungen

- WooCommerce-Mitarbeiter-Einzelkonten werden NICHT als eigene Xentral-Kunden angelegt — alle Bestellungen aus einem Shop laufen auf den Firmenkunden-Satz
- Mitarbeitername als Auftragsnotiz oder in Lieferadress-Zusatzfeld
- Preisgruppen: Standard, Top, Premium, Wiederverkäufer, Agentur
- Branche als zusätzliches Attribut je Kunde (bei Migration einmalig befüllen)
- Split-Lieferung an mehrere Standorte desselben Kunden nativ unterstützt

## 8.3 Stammdaten-Migration aus CDH

- Kundenstamm: Neu strukturieren (Firma + Kontakte getrennt) — kein 1:1-Import
- Lieferantenstamm: Übernahme aus CDH
- Artikel: Vollständiger Neuaufbau mit Variantenstruktur (Lieferanten liefern strukturierte Stammdaten)
- Veredelungsartikel: Neu anlegen (standardisiert)
- Preisgruppen: Neu definieren und je Kundensatz zuordnen
- Historische Belege: Verbleiben in CDH (Lesezugriff) — werden nicht migriert

# 9. Finanzbuchhaltung & Controlling

## 9.1 Rechnungsstellung

- Rechnung automatisch bei Versandabschluss generiert
- Proformarechnung bei Vorkasse (nativ)
- Abweichende Rechnungsadresse von Lieferadresse möglich
- Offene-Posten-Verwaltung intern in Xentral
- Zahlung üblicherweise auf Rechnung nach Versand

## 9.2 Buchhaltungsübergabe

**Kritischer Klärungspunkt: TEXMA nutzt AddisonOne Click. Xentral hat keine native AddisonOne-Schnittstelle, bietet aber DATEV-Export an. Vor Vertragsunterzeichnung muss geprüft werden, ob AddisonOne den Xentral-DATEV-Export importieren kann. Klärung mit Steuerberater + Addison ist zwingend erforderlich.**

Fallback-Optionen:

1. AddisonOne akzeptiert DATEV-kompatiblen Export aus Xentral → kein Problem
2. Steuerberater stellt Addison auf DATEV-Workflow um
3. Xentral-Fibu vollständig nutzen → Addison nur für Jahresabschluss

**Verbindliche Festlegung des Buchhaltungs-Scopes: Das ERP führt die operative Buchhaltung — Ausgangs- und Eingangsrechnungen, Offene-Posten-Verwaltung, Banking-Abgleich und Mahnwesen — und übergibt die buchungsrelevanten Daten im DATEV-Format an den Steuerberater. Jahresabschluss, Umsatzsteuer-Voranmeldung und Anlagenbuchhaltung verbleiben beim Steuerberater. Eine zertifizierte Vollbuchhaltung (z. B. IDW PS 880) ist im ERP nicht gefordert. Diese Grenze ist für jeden Anbieter verbindlich und bestimmt zugleich die GoBD-Anforderung in Kapitel 10.**

## 9.3 Controlling-Anforderungen

- Deckungsbeitrag je Auftrag (setzt vollständige EK-Pflege voraus)
- Umsatz je Shop monatlich
- Durchschnittliche Durchlaufzeit je Veredelungsart
- Produktionsmenge je Verfahren monatlich
- Soll-Ist Marge je Auftrag (Nachkalkulation — ab Phase 3)

## 9.4 Rechnungskontrolle & Banking-Abgleich (Option A: Xentral als Master)

**Grundsatzentscheidung: Xentral ist Master für den operativen Zahlungsverkehr (Offene-Posten-Führung, Banking-Abgleich, Mahnwesen). AddisonOne bleibt für Jahresabschluss zuständig (DATEV-Export). Damit wird die Klärung K-01 zur Grundvoraussetzung — ohne funktionierenden DATEV-Export keine saubere Trennung.**

- Automatischer Bankkontoabruf via FinTS/HBCI oder Import CAMT.053 / MT940 (Hauptbank: Volksbank)
- Automatischer Abgleich Zahlungseingang → offener Posten: Rechnung wird automatisch als bezahlt markiert (Matching über Verwendungszweck/Betrag/Rechnungsnummer)
- Teilzahlungen und Überzahlungen erkennbar und manuell zuordenbar
- Nicht zuordenbare Zahlungen landen in Klärungsliste (manuelle Zuordnung)
- Zahlungsausgang (Eingangsrechnungen) gegen Banking abgleichbar — Status „bezahlt“ automatisch

## 9.5 Automatisches Mahnwesen

- Dreistufig: Zahlungserinnerung → 1. Mahnung → 2. Mahnung, mit konfigurierbaren Fristen je Stufe
- Mahnlauf automatisch generierbar aus offenen Posten (überfällige Rechnungen)
- Mahntexte je Stufe hinterlegbar; Versand per E-Mail aus Xentral
- Mahnsperre je Kunde setzbar (z. B. bei laufender Klärung oder Reklamation)
- Mahnhistorie je Kunde/Rechnung dokumentiert
- Optional: Mahngebühren/Verzugszinsen je Stufe konfigurierbar

## 9.6 Eingangsrechnungs-Kontrolle

- 3-Way-Match: Bestellung = Wareneingang = Eingangsrechnung — Abweichungen werden gemeldet
- Prüfung Menge und Preis gegen ursprüngliche Bestellung
- Freigabe-Workflow bei Abweichung (Geschäftsleitung)
- Eingangsrechnung erfassbar mit Zahlungsziel → fließt in Offene-Posten und Zahlungsvorschlag
- Skonto-Fristen werden berücksichtigt (Zahlungsvorschlag priorisiert skontofähige Rechnungen)

# 10. Archivierung & GoBD-Konformität

**Kritischer Hinweis: Xentral ist kein zertifiziertes Archivsystem. Es speichert Belege, erfüllt allein aber nicht automatisch alle GoBD-Anforderungen an Unveränderbarkeit und revisionssichere Langzeitarchivierung. Die Archivierungslösung ist daher eigenständig zu konzipieren und mit dem Steuerberater abzustimmen.**

## 10.1 GoBD-Kernanforderungen

- Unveränderbarkeit: archivierte Belege dürfen nicht unbemerkt änderbar sein (Versionierung statt Überschreiben, WORM-Prinzip)
- Vollständigkeit & Nachvollziehbarkeit: lückenlose Erfassung, jede Änderung protokolliert (Audit-Trail)
- Maschinelle Auswertbarkeit: Betriebsprüfer muss digital durchsuchen und exportieren können (Z1/Z2/Z3-Zugriff, GDPdU/DSGVO-konform)
- Aufbewahrungsfristen: 10 Jahre für Rechnungen, Buchungsbelege, Jahresabschlüsse; 6 Jahre für Handels- und Geschäftsbriefe
- Zeitnahe Erfassung: Belege müssen zeitnah und in ihrer ursprünglichen Form archiviert werden

## 10.2 Unterlagenarten und Quellsysteme bei TEXMA

| **Unterlagenart** | **Quelle** | **Archivierungsbedarf** |
|---|---|---|
| Ausgangsrechnungen | Xentral | 10 Jahre, revisionssicher |
| Eingangsrechnungen | Xentral / Mail | 10 Jahre, revisionssicher |
| Buchungsbelege | AddisonOne | 10 Jahre (Steuerberater) |
| Angebote, Auftragsbestätigungen | Xentral | 6 Jahre |
| Geschäftliche E-Mails | Mailserver | 6 bzw. 10 Jahre je Inhalt |
| Druckdaten / Logos | Ordnerstruktur | kein GoBD-Zwang, intern 5 Jahre |
| WooCommerce-Bestellungen | Shops → Xentral | 10 Jahre über Xentral |

## 10.3 Zu bewertende Lösungsoptionen

Die folgenden Optionen sind im Implementierungsprojekt gemeinsam mit dem Steuerberater zu bewerten und festzulegen:

- **Option A — Dediziertes Archivsystem:** zertifiziertes DMS/Archiv (z. B. ecoDMS, DocuWare, d.velop), das aus Xentral und Mail automatisch alle Belege zieht und revisionssicher (WORM) ablegt. Rechtssicher mit Zertifikat; zusätzliches System und Integrationsaufwand.
- **Option B — Xentral-Archiv + GoBD-Zusatz:** Xentral-Belegarchivierung mit aktivierter Unveränderbarkeit, Audit-Log und Export-Funktion, ergänzt um Verfahrensdokumentation. Geringerer Aufwand; korrekte Einrichtung und Bestätigung durch Steuerberater erforderlich.
- **Option C — DATEV Unternehmen Online / Addison-Archiv:** buchhaltungsrelevante Belege revisionssicher beim Steuerberater. Deckt operative Belege (Angebote, AB, E-Mails) nicht ab — nur in Kombination sinnvoll.

## 10.4 Empfohlener Kombinationsansatz

- Buchhaltungsbelege: revisionssicher über Addison/DATEV (Steuerberater-Verantwortung)
- Operative Belege (Angebote, Auftragsbestätigungen, Lieferdokumente): Xentral mit aktivierter Unveränderbarkeit
- Geschäfts-E-Mails: eigene revisionssichere E-Mail-Archivierungslösung (größte erfahrungsgemäße Lücke bei KMU)
- Große Druckdaten: bestehende Ordnerstruktur, intern 5 Jahre (kein GoBD-Zwang)

## 10.5 Verfahrensdokumentation (Pflicht, unabhängig von der Option)

**Eine schriftliche Verfahrensdokumentation ist GoBD-Pflicht und wird bei jeder Betriebsprüfung zuerst verlangt. Ihr Fehlen ist der häufigste GoBD-Mangel bei KMU.**

- Beschreibung des gesamten Archivierungsprozesses: Wer archiviert was, wann, wie und wo
- Technische Systembeschreibung (Xentral, Archiv, Mail, Schnittstellen)
- Beschreibung der Zugriffs- und Berechtigungskonzepte
- Änderungshistorie der Verfahrensdokumentation selbst (versioniert)
- Erstellung vor Go-Live, danach laufend zu pflegen

# 11. Stammdaten-Migration

| **Bereich** | **Vorgehen** | **Status** |
|---|---|---|
| Kundenstamm | CDH-Export → Normalisierung (Firma + Kontakte) → Import | Aufbereitung nötig |
| Lieferantenstamm | Übernahme aus CDH | Direkt |
| Textil-Artikel | Neuaufbau mit Lieferanten-Stammdaten (strukturiert) | Neu aufbauen |
| Veredelungsartikel | Neu anlegen: Transfer S/M/L, Siebdruck 1F/2F/3F, Stick | Neu aufbauen |
| Preisgruppen | Neu definieren + Zuweisung je Kundensatz | Neu aufbauen |
| Historische Belege | Verbleiben in CDH — kein Import | In CDH archivieren |
| Offene Aufträge | Stichtag-Regelung: offene Aufträge manuell überführen | Klären |

# 12. Benutzer, Rollen & Freigaben

| **Rolle** | **Rechte** | **Anzahl** |
|---|---|---|
| Geschäftsleitung / Admin | Alle Rechte; Preisgruppen; Rabattfreigabe; Systemparameter | 1–2 |
| Büro / Vertrieb | Angebote, Aufträge, Kunden, Produktionsauftrag anlegen; Preisüberschreibung bis Schwelle | 3–4 |
| Produktion | Produktionsstatus setzen; Zeitbuchung; kein Preiszugriff; kein Kundenzugriff | 1–2 |
| Extern / Aushilfe | Nur Produktionsmodul-Lesezugriff (kein Schreiben) | bei Bedarf |

## 12.1 Freigaberegeln (vor Go-Live intern zu definieren)

- Rabatte über definierter Schwelle → nur Geschäftsleitung
- Aufträge über definiertem Wert → Freigabe Geschäftsleitung
- Preisgruppen-Änderungen → nur Geschäftsleitung + Admin
- Auftragsänderungen nach Status „In Bearbeitung“ → nur über Storno + Neuanlage

# 13. Lieferanten-API-Strategie

| **Phase** | **Lieferant** | **Inhalt** |
|---|---|---|
| Phase 1 | ID Identity | Produktstamm, Lager, Preise, Bestellübermittlung automatisch |
| Phase 1 | Stanley/Stella | ProductsV2, Stock (2–3× tägl.), Prices (1× tägl.), Images |
| Phase 2 | HAKRO | Produktdaten, Lager, ggf. Bestellung (HAKRO Connect API) |
| Phase 2 | FHB | ORDERS, DESADV, INVOIC, Verfügbarkeiten (EDI via nexmart) |
| Phase 3 | ERIMA, hummel, ENGEL, Greiff | Produktdaten, Lager, Bestellungen (EDI / Feed) |

**Middleware-Architektur: Zwischen Lieferanten-API und Xentral-API wird eine Middleware-Schicht benötigt (Mapping, Retry-Logik, Delta-Sync, Logging). Die Middleware-Lösung ist Teil des Implementierungsangebots.**

# 14. Technische Rahmenbedingungen

| **Parameter** | **Spezifikation** |
|---|---|
| ERP-Deployment | Xentral Cloud (SaaS) — kein lokaler Server |
| Altsystem | CDH Office (lokal, Windows) — bleibt als Lesearchiv aktiv |
| Buchhaltung | AddisonOne Click (nur Jahresabschluss bei Option A); Xentral ist Zahlungsverkehr-Master |
| Banking | Volksbank — FinTS/HBCI oder CAMT.053/MT940-Import für automatischen OP-Abgleich (vor Go-Live testen) |
| Versand | DPD — API-Anbindung in Xentral; meist DPD, Abholung auf Wunsch |
| Dateiablage groß | Google Drive oder SharePoint (extern, verlinkt in Xentral) |
| Shop-Technologie | WordPress + WooCommerce (separate Installationen) |
| Shop-Agentur | Extern — muss in Implementierungsprojekt eingebunden werden |
| Internet | Redundanz prüfen (Xentral Cloud = Internetzugang Pflicht) |
| 2FA | Für alle Nutzer zu aktivieren |

# 15. Pflicht-Testfälle (Abnahmeprotokoll)

Die folgenden Testfälle müssen vor Go-Live vollständig bestanden sein. Das Abnahmeprotokoll ist Teil des Implementierungsvertrags.

| **#** | **Testfall** | **Erwartetes Ergebnis** | **Prio** |
|---|---|---|---|
| T-01 | WooCommerce-Bestellung → Xentral-Firmenkunde (nicht Mitarbeiterkonto) | Bestellung im Firmenkunden-Satz; kein neuer Einzelkunde | Kritisch |
| T-02 | Varianten-Mapping: Polo Blau XL → Xentral-Variante Blau XL | Korrekte Variante; kein Mapping-Fehler | Kritisch |
| T-03 | Kundenspezifische Stückliste: Kunde A → Vorlage A | Richtige Veredelungsvorlage automatisch zugeordnet | Kritisch |
| T-04 | Mehrstufige Fremdvergabe: PA → Siebdruck → Stick | Alle Unteraufträge mit Status/Termin; Rücklauf buchbar | Kritisch |
| T-05 | Multi-Lieferant: Textil von FHB + Stanley/Stella | Zwei Bestellvorschläge; Start erst nach beiden Eingängen | Kritisch |
| T-06 | DPD-Label aus Xentral + Tracking zurück an Shop | Label erzeugt; Tracking im Shop-Auftrag | Kritisch |
| T-07 | AddisonOne-Import des Xentral-DATEV-Exports | Buchungssätze fehlerfrei importiert | Kritisch |
| T-08 | Preisgruppe Connector: Premium → Shop zeigt Premium-Preise | Korrekte Preise nach Login; keine manuelle Anpassung | Hoch |
| T-09 | Statusrückmeldung: „Versendet“ → Shop + Tracking-Mail | Shop-Status aktualisiert; Mail automatisch | Hoch |
| T-10 | Nachkalkulation: Auftrag abschließen → DB-Soll vs. DB-Ist | Abweichung angezeigt | Hoch |
| T-11 | Produktionszettel extern: alle Pflichtfelder | PDF druckbereit; alle Felder befüllt | Hoch |
| T-12 | Transferdruck-Mindestlager unterschritten | Bestellvorschlag automatisch erzeugt | Mittel |
| T-13 | Banking-Abgleich: Zahlungseingang → offener Posten automatisch ausgeglichen | Rechnung automatisch als bezahlt markiert; nicht zuordenbare Zahlung in Klärungsliste | Hoch |
| T-14 | Mahnlauf: überfällige Rechnung → automatische Mahnung Stufe 1 | Mahnung korrekt generiert und versendet; Mahnsperre wird respektiert | Hoch |
| T-15 | Staffelpreis: Bestellmenge überschreitet eine hinterlegte Staffelgrenze | System zieht automatisch den Stückpreis der zutreffenden Mengenstufe; Einrichtungskosten korrekt auf die Menge verteilt; Preisgruppe bleibt kombiniert wirksam | Hoch |

# 16. Offene Klärungspunkte vor Vertragsabschluss

| **#** | **Punkt** | **Zuständig** |
|---|---|---|
| K-01 | AddisonOne-Kompatibilität mit Xentral-DATEV-Export prüfen — GRUNDVORAUSSETZUNG für Option A (Xentral als Zahlungsverkehr-Master, Addison nur Jahresabschluss) | Steuerberater + Addison + Xentral |
| K-02 | Anzahl WooCommerce-Connectoren je Paket + Skalierung auf 30 Shops | Xentral Vertrieb |
| K-03 | Preismodell schriftlich fixieren (Änderungs-/Paketwechsel) | Xentral Vertrieb |
| K-04 | Referenzkunde mit ähnlichem Setup benennen. Geklärt: Mr.Tex GmbH, Wolfsburg — Textilveredler/Unternehmensausstatter (seit 2007, GF Jan Worm), produktiver Xentral-Anwender mit öffentlicher Case Study (xentral.com/de/kunden/mr-tex). Als unabhängiger Referenz- und Gesprächskontakt nutzen, um die Eignung von Xentral für die Veredelungsprozesse empirisch zu prüfen. | Xentral / Partner |
| K-05 | PoC: kundenspezifische Stückliste demonstrieren (T-03) | Implementierungspartner |
| K-06 | Angebot für Sonderkonfiguration variable Stücklisten + Connector | Implementierungspartner |
| K-07 | Stichtag Go-Live definieren + Rollback-Plan für CDH | Intern + Partner |
| K-08 | Lieferadress-Regelung je Shop dokumentieren | Intern (Büro) |
| K-09 | Sollzeiten je Veredelungsart in Workshop definieren | Intern (Produktion) |
| K-10 | Rechtematrix (Rabattschwelle, Auftragswert-Freigabe) definieren | Geschäftsleitung |
| K-11 | WooCommerce EK/VK-Feldstruktur festlegen (Standardfelder vs. Custom Attributes vs. Plugin) | Intern + Shop-Agentur |

# 17. Projektrahmen & Erwartungen an Beratung und Umsetzungspartner

## 17.1 Zeitplan (Zielrahmen)

| **Phase** | **Inhalt** | **Dauer** |
|---|---|---|
| Phase 1 | Stammdaten-Neuaufbau, WooCommerce-Anbindung (10–12 Shops), Produktionsworkflow, API ID Identity + Stanley/Stella | Monate 1–3 |
| Phase 2 | Produktionsdisziplin, Zeiterfassung, HAKRO + FHB, Eingangsrechnung-Abgleich, Budgetlimit-Shops | Monate 4–6 |
| Phase 3 | Nachkalkulation, DB-Reporting, EDI-Partner (ERIMA etc.), Stickerei intern vorbereiten | Monate 7–12 |

## 17.2 Anforderungen an den Implementierungspartner

- Nachweisliche Erfahrung mit Make-to-Order-Unternehmen oder Textilveredlern
- WooCommerce-API-Kompetenz (keine reine Xentral-Standard-Partnerschaft)
- Festpreisangebot für Phase 1 (keine offene Zeitaufwands-Vereinbarung ohne Cap)
- Benannter Projektverantwortlicher mit direkter Erreichbarkeit
- Hyper-Care-Phase nach Go-Live: mindestens 4 Wochen intensiv
- Schulung auf echten TEXMA-Daten und TEXMA-Prozessen (nicht auf Demodaten)
- Abnahmeprotokoll mit den 15 definierten Testfällen als Vertragsbestandteil

## 17.3 Go-Live-Strategie

- Kein Parallelbetrieb — hartes Cut-Over mit Stichtag
- CDH bleibt als Lesearchiv aktiv (kein Schreibzugriff nach Go-Live)
- Rollback-Plan für die ersten 2 Wochen schriftlich dokumentiert
- Übergangsregelung für laufende mehrstufige Aufträge: Auftrags-Einfrierfenster vor dem Stichtag — ab einem definierten Datum keine Neuaufträge mehr im Altsystem; zum Go-Live werden die noch offenen Aufträge mit ihrem Reststatus (Bestand, Veredelungsstand, Liefertermin) manuell ins neue System überführt.
- Stichtag bewusst in eine auftragsschwache Phase legen, um die Zahl der zum Cut-Over laufenden mehrstufigen Aufträge (Durchlaufzeit 1–4 Wochen) zu minimieren. Klärt den bisher offenen Punkt aus Kapitel 11.

# Ergänzungen und kritische Prüfung (Version 2.2)

Dieser Teil ergänzt das Lastenheft (Hauptteil) um Themen, die für eine Beratung mit ERP- und KI-Fokus relevant sind und im Hauptteil bisher fehlten oder zu vertiefen sind. Die Kapitelnummerierung setzt den Hauptteil fort. Inhaltlich ist nichts aus dem Hauptteil gestrichen.

# 18. Ergänzende Vertriebskanäle: Anfrageshop und öffentlicher Sammelbestell-Shop

Kapitel 3 behandelt die geschlossenen WooCommerce-Mitarbeitershops. TEXMA betreibt zwei weitere digitale Kanäle, die in der ERP-Architektur zu berücksichtigen sind, weil beide Vorgänge erzeugen, die im ERP landen müssen. Beide fehlen im Hauptteil.

## 18.1 Anfrageshop (B2B-Katalog ohne Checkout)

Eigenständiger B2B-Katalog unter der Domain anfrage.texma-gmbh.de (andere Technologie als WooCommerce, kein Warenkorb/Checkout). Er erzeugt Anfragen, keine Bestellungen. Der Shop ist bereits in Betrieb, derzeit noch unter der vorläufigen Adresse texma-shop.pages.dev; der Umzug auf die Zieldomain anfrage.texma-gmbh.de steht aus. Es handelt sich um ein bestehendes, eigenständig betriebenes System, das nicht Gegenstand der ERP-Beschaffung ist — relevant ist die Schnittstelle zwischen Anfrageshop und ERP: Anfrageeingang und, im Idealfall, Versorgung des Shops mit Artikeldaten (siehe unten).

- Anforderung: Anfrage/Lead aus dem Anfrageshop wird als Interessent bzw. Angebotsvorgang ins ERP übernommen (Kontaktanlage plus Vorgang), idealerweise automatisiert über Webhook/Middleware (z. B. n8n).
- Im Idealfall (umgekehrte Richtung) bezieht der Anfrageshop seine Artikel- und Katalogdaten (Produktstamm, Varianten Farbe × Größe, Kategorien, Bilder, Beschreibungen) aus dem ERP über eine Schnittstelle (API/Feed). So wird der Katalog nicht doppelt gepflegt — das ERP ist Artikelstamm-Master („eine Quelle der Wahrheit“). Anforderung ans ERP: Bereitstellung dieser Artikeldaten über eine maschinelle Schnittstelle.
- Ein Bestands-Sync ist nicht erforderlich (Make-to-Order, kein Lager). Preise sind im Anfragekanal nicht kundenindividuell; ob Richt- oder Listenpreise angezeigt werden, ist Teil der Umfangsklärung (K-12).

## 18.2 Öffentlicher Sammelbestell-Shop (Schul-/Vereinsshop)

Öffentlich zugänglicher WooCommerce-Shop mit Sammelbestell-Logik (zeitlich befristete Bestellfenster, gebündelte Produktion und Auslieferung).

- Anbindung grundsätzlich wie Mitarbeitershops über WooCommerce-Connector, jedoch mit abweichender Logik: Einzelbestellungen werden über ein Bestellfenster gesammelt und als Sammelauftrag in Produktion gegeben.
- Zu klären: ein Connector mit Sammelauftragslogik oder gesonderte Behandlung; Verarbeitung der Einzelbesteller (analog Mitarbeiter-Mapping aus Kapitel 8).

**Klärungsbedarf: Anfrageshop und Sammelbestell-Shop sind im Phasenplan (Kapitel 17.1) nicht enthalten. Umfang und Phase der Anbindung sind festzulegen (siehe K-12).**

# 19. E-Rechnung und gesetzliche Compliance

**Kritischer Hinweis: Die E-Rechnung fehlt im bisherigen Lastenheft vollständig. Für ein ERP-Projekt 2026 ist sie zwingend und teils bereits heute gesetzliche Pflicht.**

- Empfangspflicht (gilt bereits): Seit 01.01.2025 müssen inländische Unternehmen B2B-E-Rechnungen empfangen und verarbeiten können — unabhängig vom ERP-Wechsel. Das aktuell aktive System (CDH) bzw. das künftige ERP muss strukturierte E-Rechnungen (XRechnung, ZUGFeRD) entgegennehmen können.
- Versandpflicht (gestaffelt): ab 2027 für größere Umsätze, ab 2028 grundsätzlich für alle inländischen B2B-Umsätze. Das ERP muss Ausgangsrechnungen als XRechnung und ZUGFeRD erzeugen.
- Anforderung ans ERP: Erstellung (XRechnung + ZUGFeRD/hybrides PDF), Empfang und Validierung eingehender E-Rechnungen, Übergabe der buchungsrelevanten Daten an den Steuerberater (DATEV-Format).
- Abgrenzung zum Steuerberater-Portal: Das ADDISON-Portal (Nachfolger von ADDISON OneClick, Rollout ab Juli 2026) kann ebenfalls Rechnungen in XRechnung/ZUGFeRD erzeugen. Ist das ERP Rechnungs-Master, ist das Rechnungsmodul des Portals redundant — doppelte Rechnungsquellen und Nummernkreise sind zu vermeiden.

**Festlegung: Das ERP ist die einzige Quelle für Ausgangsrechnungen und der Master für Rechnungsnummern (siehe K-13).**

# 20. Reklamation und Nacharbeit (Workflow C)

Kapitel 6.3 nennt nur die Lieferantenreklamation. Ein durchgängiger Workflow für Kundenreklamationen fehlt. Reklamationen werden heute fallweise ohne strukturierten Prozess bearbeitet; die Strukturierung ist vor Go-Live zu definieren.

Der Reklamationsfall ist je nach Ursache vierstufig: Lieferantenreklamation (Material-/Textilfehler), interne Nachproduktion (Veredelungsfehler im Haus), Express-Neubestellung (bei Termindruck), Gutschrift/Rabatt an den Kunden.

## 20.1 Anforderungen ans ERP

- Reklamationsvorgang mit Bezug auf Ursprungsauftrag und -position anlegbar.
- Ursachen- und Verantwortungszuordnung (Lieferant / interne Produktion / externer Veredler) für die Auswertung.
- Folgevorgang (Nachproduktion, Express-Neubestellung, Gutschrift) aus dem Reklamationsvorgang erzeugbar.
- Reklamationskosten dem Verursacher zuordenbar (für Lieferantenbewertung und Deckungsbeitrags-Korrektur).
- Reklamationshistorie je Kunde und je Lieferant auswertbar.

**Empfehlung: Vor Go-Live als verbindlichen Workflow definieren (siehe K-14).**

# 21. Geschäftliche Erfolgskriterien und KPIs

Das Lastenheft definiert technische Abnahme-Testfälle (Kapitel 15), aber keine geschäftlichen Erfolgskriterien. Für Projektsteuerung und Beratung sind messbare Zielgrößen sinnvoll: Woran wird der Projekterfolg über die technische Abnahme hinaus gemessen?

Vorschlag für zu vereinbarende Zielgrößen (konkrete Zielwerte intern festzulegen):

- Bearbeitungsaufwand je Auftrag (Innendienst-Minuten) — Reduktion gegenüber dem heutigen manuellen Prozess.
- Skalierung von rund 12 auf 30 Mitarbeitershops ohne proportionalen Personalaufbau im Büro — die zentrale Wirtschaftlichkeitsannahme des Projekts.
- Auftragsdurchlaufzeit je Veredelungsart — Transparenz und gegebenenfalls Reduktion.
- Anteil der ohne manuellen Eingriff verarbeiteten Shop-Bestellungen (Dunkelverarbeitungsquote).
- Forderungslaufzeit/Zahlungseingangsdauer — Wirkung des automatisierten Mahnwesens (Kapitel 9.5) auf den Forderungsbestand.
- Datenqualität: Reduktion der Artikel-Duplikate durch echte Variantenstruktur.

**Voraussetzung: Die Ist-Ausgangswerte müssen vor Go-Live erhoben werden, sonst ist die Wirkung später nicht belegbar (siehe K-15).**

# 22. KI- und Automatisierungspotenziale (Ausblick für die Beratung)

Da dieses Dokument Grundlage einer Beratung mit ERP- und KI-Fokus ist, benennt dieses Kapitel die Ansatzpunkte für Automatisierung und KI. Sie sind bewusst als Ausblick formuliert, nicht als Pflichtanforderung an das ERP.

**Grundsatz (Reihenfolge beachten): zuerst Prozesse strukturieren und ins ERP heben, dann regelbasierte Automatisierung (Middleware/n8n/Webhooks), erst darauf KI. Der Großteil der heutigen Schmerzpunkte — Excel-Terminsteuerung, manuelle Auftragsanlage, unstrukturierte Reklamation — ist primär ein Struktur- und ERP-Thema, kein KI-Thema. KI auf einen unstrukturierten Prozess anzuwenden erzeugt Kosten ohne Nutzen. KI-First-Vorschläge sind kritisch zu prüfen.**

## 22.1 Automatisierung (regelbasiert, kurzfristig, hoher Hebel)

- Auftragsimport Shop → ERP ohne manuellen Schritt (im Hauptteil bereits gefordert).
- Lead/Anfrage aus dem Anfrageshop → ERP-Vorgang via Webhook/n8n.
- Tägliche Sammelbestellung je Lieferant über den Bestellvorschlag.
- Banking-Abgleich und automatischer Mahnlauf (Kapitel 9.4 und 9.5).
- Status- und Terminsteuerung der externen Veredler (heute teils über Airtable abgebildet).

## 22.2 KI-Ansatzpunkte (mittelfristig, nach Strukturierung)

- Strukturierte Erfassung aus Freitext: eingehende Anfragen per Mail oder Telefonnotiz in strukturierte ERP-Felder bzw. Angebotspositionen überführen (heute handschriftlich plus manueller Übertrag). Angesichts der Kleinteiligkeit von rund 2.000 Aufträgen pro Jahr der größte KI-Hebel.
- Dublettenerkennung und Datenbereinigung im fragmentierten Kundenstamm.
- Bedarfs- und Nachbestellprognose für das Kleinstlager der vorgefertigten Transferdrucke.
- Produktvorschläge und Alternativartikel im Anfrageshop.
- Entscheidungshilfe bei der Stickerei-Partnerauswahl (Preis/Kapazität/Termin).

## 22.3 Von der Beratung zu bewertende Voraussetzungen

- Saubere, strukturierte Stammdaten (durch die geplante Variantenstruktur weitgehend gegeben).
- Offene API/Middleware (im Hauptteil gefordert).
- Datenschutz/DSGVO bei KI-Verarbeitung von Kunden- und Auftragsdaten — Verarbeitungsort, Auftragsverarbeitung, keine ungewollte Datenweitergabe.

# 23. Ergänzende offene Klärungspunkte

Ergänzung zur Tabelle in Kapitel 16.

- K-12: Anbindung Anfrageshop und öffentlicher Sammelbestell-Shop ans ERP — Umfang und Phase festlegen.
- K-13: E-Rechnung — Erzeugung (XRechnung/ZUGFeRD), Empfang/Validierung und Abgrenzung zum Steuerberater-Portal; das ERP eindeutig als Rechnungs-Master festlegen.
- K-14: Kundenreklamations-Workflow (Workflow C) vor Go-Live verbindlich definieren.
- K-15: Geschäftliche Erfolgs-KPIs samt Ist-Ausgangswerten vor Go-Live festlegen.
- K-16: Make-or-Buy ist Kernauftrag der Beratung — bewerten, ob die beschriebene Funktionalität (Benchmark: Xentral) durch ein Standardsystem (Kauf/SaaS) oder durch Eigenentwicklung bzw. Eigenbetrieb wirtschaftlich und dauerhaft betreibbar umzusetzen ist. Ausführlich in Kapitel 24.
- K-17: Notbetrieb bei Internet-/Cloud-Ausfall (Failover, Offline-Notprozess) — bei Cloud-ERP ohne Parallelbetrieb geschäftskritisch.
- K-18: Verantwortungsabgrenzung zwischen ERP-Implementierungspartner und externer Shop-Agentur (wer verantwortet Connector und Mapping; Fehlerverantwortung bei T-01/T-02).
- K-19: Übergangsregelung für laufende mehrstufige Aufträge beim harten Cut-Over (Durchlaufzeit 1–4 Wochen gegen Stichtag ohne Parallelbetrieb).
- K-20: Change-Management und Akzeptanz, insbesondere die Einführung der Zeiterfassung (Stechuhr) in der Produktion.

# 24. Make-or-Buy: Bewertungsauftrag an die Beratung

Xentral dient in diesem Lastenheft als State of the Art / funktionaler Maßstab. Die zentrale von der Beratung zu beantwortende Frage lautet: Soll TEXMA die beschriebene Funktionalität über ein Standardsystem beziehen oder eigenständig umsetzen und betreiben? Dieses Kapitel definiert die zu bewertenden Optionen, die Kriterien und das erwartete Ergebnis.

## 24.1 Zu bewertende Optionen

- Buy — Standardsystem als SaaS (z. B. Xentral) mit Implementierungspartner: geringste Eigenleistung, laufende Lizenzkosten, Abhängigkeit vom Anbieter.
- Make — Eigenentwicklung von Grund auf: maximale Passgenauigkeit, aber höchster Aufwand und höchstes Risiko, besonders in Buchhaltung, GoBD und E-Rechnung.
- Hybrid — Open-Source-ERP-Basis selbst betreiben und anpassen (z. B. OpenXE als freier Xentral-Fork, Metasfresh, Odoo): erfüllt potenziell beide Kriterien („Xentral-nah" und „eigenständig"), verlagert den Aufwand auf Anpassung, Betrieb und Updates statt auf Lizenz.
- Teil-Make — Standardsystem als Kern, Eigenleistung nur an den Spezial-Stellen (Veredelungs-Tools, Anfrageshop-Anbindung, Middleware). Make-or-Buy muss keine Alles-oder-nichts-Entscheidung sein.

## 24.2 Bewertungskriterien (je Option)

- Funktionsabdeckung gegenüber dem Benchmark (Hauptteil dieses Lastenhefts) — was ist Standard, was muss gebaut werden?
- Einführungszeit bis Produktivbetrieb.
- Gesamtkosten über fünf Jahre (TCO): einmalig plus laufend — Lizenz/Hosting, Implementierung, Eigenentwicklung, Wartung.
- Wartung und Updates: Wer hält das System lauffähig, sicher und gesetzeskonform?
- Gesetzeskonformität: GoBD-Archivierung und E-Rechnung (XRechnung/ZUGFeRD) — bei Eigenbau erfahrungsgemäß der teuerste und riskanteste Bereich.
- Betreibbarkeit mit dem vorhandenen Team (6 Mitarbeitende) ohne dauerhaften externen Bedarf.
- Abhängigkeit: vom Anbieter (Buy) gegen Abhängigkeit von internem Know-how (Make/Hybrid).

**Schlüsselfrage bei „eigenständig umsetzbar": Die entscheidende Frage ist nicht „können wir es bauen", sondern „können wir es über Jahre betreiben, warten, gesetzeskonform halten und bei Personalausfall am Laufen halten". Bei 6 Mitarbeitenden mit voraussichtlich einem technischen Kopf ist das Klumpenrisiko (Bus-Faktor) das zentrale Risiko der Make- und Hybrid-Option. Ein selbst betriebenes ERP, das das gesamte operative Geschäft trägt, darf nicht an einer einzelnen Person hängen. Dieses Risiko ist Teil der Bewertung — nicht nur die technische Machbarkeit.**

## 24.3 Erwartetes Ergebnis der Beratung

- Begründete Empfehlung mit TCO-Vergleich über fünf Jahre je Option.
- Risikobewertung je Option (Betrieb, Wartung, Compliance, Klumpenrisiko, Anbieterabhängigkeit).
- Vorschlag zur Abgrenzung Standard vs. Eigenleistung, falls ein Teil-Make sinnvoll ist.
- Aussage zum Hosting- und Betriebsmodell je Option (Cloud/SaaS, eigener VPS, On-Premise) — verzahnt mit K-17 (Ausfallsicherheit).

# Ergänzungen aus externem Review (Version 2.3)

Dieser Teil arbeitet die Empfehlungen eines externen Dokumentenreviews vom 18.06.2026 ein und erhöht die Ausschreibungsreife: Anforderungspriorisierung, messbare Abnahmekriterien, nichtfunktionale und datenschutzrechtliche Anforderungen, eine formalisierte Make-or-Buy-Bewertung mit Funktionsabdeckungs-Matrix sowie die Projektorganisation. Die Kapitelnummerierung setzt den bisherigen Teil fort; inhaltlich ist nichts gestrichen.

**Hinweis zur Einarbeitung: Drei Review-Empfehlungen waren bereits in Version 2.2 enthalten und werden hier nur referenziert statt dupliziert — der Kundenreklamations-Workflow (Kapitel 20), die Zeiterfassung/Betriebsdatenerfassung der Produktion (Kapitel 5.2) und die Make-or-Buy-Optionen (Kapitel 24). Mehrere quantitative Zielwerte in diesem Teil sind Vorschläge und vor Veröffentlichung der Ausschreibung durch TEXMA zu bestätigen (neue Klärungspunkte K-21 bis K-25).**

# 25. Anforderungspriorisierung (MoSCoW)

Zur besseren Vergleichbarkeit der Angebote werden die Anforderungen nach MoSCoW klassifiziert. Die Einteilung orientiert sich am Phasenplan (Kapitel 17.1): Phase 1 entspricht weitgehend Must have, Phase 2 Should have, spätere Ausbaustufen Could have / Future. Die folgende Zuordnung ist ein Vorschlag und von TEXMA zu bestätigen (K-21).

## Must have — ohne diese Funktionen ist kein Produktivbetrieb möglich

- WooCommerce-Anbindung der Mitarbeitershops (Auftragsimport, Status/Tracking)
- Variantenverwaltung (Farbe × Größe)
- Preisgruppen je Kundensatz
- Kunden- und Auftragsverwaltung (Firma und Kontakte getrennt)
- Produktionsauftrag mit Stückliste aus dem Kundenauftrag
- Mitarbeiterkonto-zu-Firmenkunde-Mapping (Testfall T-01)
- Rechnungsstellung inklusive E-Rechnung (Empfang ist bereits gesetzliche Pflicht)
- Buchungsrelevanter Export an den Steuerberater (DATEV-Format)

## Should have — wichtig, aber nicht zwingend zum Go-Live

- Mehrstufige Fremdvergabe (Unterproduktionen Siebdruck/Stickerei)
- Banking-Zahlungsabgleich und automatisches Mahnwesen
- Lieferanten-API-Anbindung (ID Identity, Stanley/Stella)
- Nachkalkulation (Soll-Ist-Deckungsbeitrag)
- Erweiterte Reports (Kapitel 29)

## Could have — optional, Nutzen vor Aufwand prüfen

- KI-gestützte Erfassung aus Freitext (Kapitel 22.2)
- Regelbasierte Workflow-Automatisierung über Middleware/n8n
- Anbindung Anfrageshop und Sammelbestell-Shop (Kapitel 18)
- Kundenportal / Self-Service-Kundenkonto (Kapitel 36) — Umsetzung als Add-on nach Go-Live

## Future — spätere Projektphasen

- Erweiterte BI-/Dashboard-Auswertungen
- Kapazitäts-/Feinplanung der Produktion (für den aktuellen Betrieb voraussichtlich überdimensioniert, siehe Kapitel 33)
- Mobile Apps
- Stickerei-Inhouse-Vorbereitung (Ziel 2027)

# 26. Messbare Abnahmekriterien

Die Pflicht-Testfälle in Kapitel 15 prüfen die fachliche Funktion (bestanden / nicht bestanden). Ergänzend werden für zentrale Prozesse messbare Zielwerte definiert, an denen der Produktivbetrieb objektiv abgenommen wird. Die folgenden Werte sind Vorschläge zur gemeinsamen Fixierung mit dem Anbieter und durch TEXMA zu bestätigen (K-22).

- Auftragsimport: mindestens 95 % der Shop-Bestellungen werden ohne manuellen Eingriff und innerhalb von 2 Minuten nach Shop-Status „processing“ als Auftrag angelegt.
- Preisaktualisierung: eine Preisänderung im ERP ist innerhalb von 5 Minuten in allen angebundenen Shops sichtbar.
- Statusrückmeldung: Trackingnummer und Versandstatus erscheinen innerhalb von 5 Minuten nach Versandbuchung im Shop-Auftrag.
- Belegzugriff: ein archivierter Beleg ist über die Suche innerhalb von 3 Sekunden auffindbar und anzeigbar.
- Datenqualität nach Migration: 100 % der aktiven Kunden und Lieferanten, 100 % der offenen Posten und mindestens 98 % der aktiven Artikel fehlerfrei übernommen (Stichprobenprüfung im Abnahmeprotokoll).

**Diese Werte ersetzen nicht die Testfälle, sondern ergänzen sie um eine quantitative Dimension. Sie sollten als gemeinsam vereinbarte Service-Level in den Implementierungsvertrag aufgenommen werden — nicht als einseitig gesetzte Vorgabe.**

# 27. Nichtfunktionale Anforderungen

Ergänzend zu den Fachprozessen werden nichtfunktionale Anforderungen festgelegt. Einige sind bereits an anderer Stelle geregelt (Zwei-Faktor-Authentifizierung Kapitel 14, Audit-Trail Kapitel 10.1, Rollen-/Rechtekonzept Kapitel 12) und hier nur gebündelt. Mengengerüste und Zielwerte sind zu bestätigen (K-23).

## Mengengerüst und Performance

- Bis zu 10 gleichzeitige Benutzer ohne spürbare Einschränkung.
- Artikelstamm: heute über 5.000 aktive Artikel; Skalierung auf mindestens 15.000 Artikel (Wachstumsreserve durch Variantenstruktur und 30-Shop-Ziel — das Review nannte 10.000; die höhere Reserve ist mit Blick auf Varianten sinnvoll, zu bestätigen).
- Historische Belege: mindestens 100.000 Belege durchsuchbar.
- Skalierung auf mindestens 30 WooCommerce-Shops ohne proportionalen Mehraufwand.

## Verfügbarkeit

- Zielverfügbarkeit mindestens 99,5 % (Cloud-SLA des Anbieters).
- Wartungsfenster außerhalb der Kernarbeitszeit.
- Notbetrieb bei Cloud-/Internetausfall ist geschäftskritisch und in K-17 separat geführt.

## Datensicherung

- Tägliche automatische Sicherung.
- Maximal tolerierter Datenverlust (RPO) und Wiederherstellungszeit (RTO) vom Anbieter zu benennen und vertraglich zu fixieren (Zielwerte zu bestätigen).

## Sicherheit

- Zwei-Faktor-Authentifizierung für alle Nutzer (Kapitel 14).
- Rollen- und berechtigungsbasierter Zugriff (Kapitel 12).
- Revisionssicherer Audit-Trail über Datenänderungen (Kapitel 10.1).
- Verschlüsselte Datenübertragung (TLS) zu Shops, Banken und Lieferanten-APIs.

# 28. Datenschutz und DSGVO

Das Lastenheft behandelt die steuerliche Aufbewahrung (GoBD, Kapitel 10). Ergänzend werden die datenschutzrechtlichen Anforderungen an das ERP festgelegt, da personenbezogene Daten von Kunden, Beschäftigten der Mitarbeitershops und Ansprechpartnern verarbeitet werden.

- Datenhaltung innerhalb der EU (Serverstandort des Cloud-Anbieters nachweisen).
- Auftragsverarbeitungsvertrag (AVV) mit dem ERP-Anbieter und allen datenverarbeitenden Dienstleistern (z. B. Middleware, Versand).
- Löschkonzept mit Fristen je Datenart — im Spannungsfeld zur GoBD-Aufbewahrung: steuerrelevante Belege bleiben aufbewahrungspflichtig (sperren statt löschen), nicht steuerrelevante personenbezogene Daten werden fristgerecht gelöscht.
- Umsetzung von Auskunfts-, Berichtigungs- und Löschrechten betroffener Personen.
- Datenminimierung: nur die für den Geschäftszweck nötigen personenbezogenen Daten erfassen.
- Rollenbasierter Zugriff auf personenbezogene Daten (verzahnt mit Kapitel 12).
- Protokollierung von Zugriffen auf personenbezogene Daten.
- Bei KI-Verarbeitung (Kapitel 22) zusätzlich: Verarbeitungsort, Auftragsverarbeitung und Ausschluss ungewollter Datenweitergabe klären.

# 29. Reporting und Kennzahlen (operativer Betrieb)

Kapitel 21 definiert die Projekt-Erfolgs-KPIs, an denen die Wirkung der ERP-Einführung gemessen wird (einmalige Vorher-Nachher-Betrachtung). Dieses Kapitel definiert die dauerhaften Auswertungen, die das System im laufenden Betrieb bereitstellen muss. Beide Ebenen sind bewusst getrennt.

## Vertrieb

- Umsatz je Kunde
- Umsatz je Shop (monatlich)
- Umsatz je Artikelgruppe

## Produktion

- Produktionszeit je Auftrag
- Auslastung je Verfahren
- Ausschuss- und Nacharbeitsquote

## Finanzen

- Deckungsbeitrag je Auftrag
- Marge
- Offene Posten / Forderungslaufzeit

## Qualität

- Reklamationsquote je Kunde und je Lieferant (verzahnt mit Kapitel 20)
- Liefertermintreue

**Voraussetzung für aussagekräftige Kennzahlen ist die vollständige EK-Pflege (Deckungsbeitrag) und die konsequente Zeit- und Materialbuchung (Nachkalkulation). Ohne diese Datendisziplin liefern die Reports keine belastbaren Werte.**

# 30. Make-or-Buy — gewichtete Bewertungsmatrix

Kapitel 24 benennt die Optionen (Buy / Make / Hybrid / Teil-Make) und die Bewertungskriterien. Zur strukturierten Entscheidung wird eine gewichtete Bewertungsmatrix vorgegeben. Die Beratung bewertet jede Option je Kriterium (z. B. 1–5); die gewichtete Summe ergibt eine vergleichbare Gesamtbewertung. Die Gewichte sind ein Vorschlag und von TEXMA zu bestätigen (K-24).

| **Kriterium** | **Gewicht** |
|---|---|
| Funktionsabdeckung | 25 % |
| Investitionskosten (einmalig) | 15 % |
| Betriebskosten (laufend, 5 Jahre) | 15 % |
| Erweiterbarkeit | 15 % |
| Betriebsrisiko / Wartbarkeit | 15 % |
| Herstellerabhängigkeit | 10 % |
| Projektdauer bis Produktivbetrieb | 5 % |

**Das Betriebsrisiko (15 %) bildet bei einem 6-Personen-Betrieb das in Kapitel 24.2 beschriebene Klumpenrisiko ab: Ein selbst betriebenes oder stark angepasstes System darf nicht an einer einzelnen Person hängen. Bei Make- und Hybrid-Optionen ist dieses Kriterium besonders kritisch zu prüfen.**

Konkret stehen derzeit drei Buy-Kandidaten zur Bewertung: Xentral, reybex und orgaMAX. Die Punktevergabe je Kriterium erfolgt erst nach Live-Demo und Angebot, nicht auf Basis von Hersteller-Websites. Maßgeblich ist, wie jeder Kandidat die TEXMA-differenzierenden Prozesse (Kapitel 31) an einem echten Auftrag abbildet — nicht der Funktionsumfang auf dem Papier. Ein Kandidatenvergleich findet sich in Kapitel 31.1.

# 31. Funktionsabdeckungs-Matrix (Maßstab Xentral)

Diese Matrix übersetzt die Kriterien aus Kapitel 30 in eine konkrete Prüfung gegen den funktionalen Maßstab Xentral (Recherchestand Juni 2026, Quelle: Xentral Help Center). Sie zeigt je Anforderung, ob die Funktion im Standard enthalten ist (nativ), eine erweiterte/angepasste Schnittstelle erfordert (Extended), kundenindividuell zu entwickeln ist (Custom) oder über ein Fremdsystem abzudecken ist. Sie ist das Raster, an dem jeder Anbieter zu messen ist — keine Vorfestlegung auf Xentral.

| **Anforderung** | **Einordnung (Maßstab Xentral)** |
|---|---|
| Belegkette Angebot→Auftrag→Rechnung, Faktura bei Versand | nativ |
| Variantenartikel (Farbe × Größe) | nativ |
| Mengenstaffeln / Staffelpreise (mengenabhängiger Stück-VK) | nativ |
| Stücklisten und mehrstufige Unterproduktionen | nativ |
| E-Rechnung Empfang + Versand (XRechnung/ZUGFeRD) | nativ |
| Banking-Zahlungsabgleich + mehrstufiges Mahnwesen | nativ |
| Bestellvorschlag / tägliche Sammelbestellung | nativ |
| DATEV-Datenexport | nativ |
| Mehrere WooCommerce-Shops anbinden | nativ (Anzahl unkritisch) |
| Variable Stücklisten / personalisierte Artikel im Shop-Connector | Extended (Anbieter bestätigt: Out-of-the-box nicht ausreichend) |
| Mitarbeiterkonto → Firmenkunde-Mapping (T-01) | Custom |
| Lohnveredelung mit Beistellung + Rücklauf (externe Veredler) | Custom (kein dediziertes Modul; über Bestellung/Materiallager/Unterproduktion) |
| Stickerei-Partnerlogik (Angebots- vs. Direktprozess) | Custom (Kundensatzfelder + Workflow) |
| DATEV → ADDISON-Übergabe | Fremdsystem-Brücke (DATEV-Dateiformat; nicht nativ — K-01) |
| Revisionssichere GoBD-Langzeitarchivierung | Fremdsystem / Zusatzkomponente (Kapitel 10) |

**Kernaussage für die Entscheidung: Der generische Standard-Block (obere Zeilen) ist abgedeckt und in keinem Szenario wirtschaftlich selbst zu bauen — hier ist „Buy“ überlegen. Die TEXMA-differenzierenden Prozesse (untere Zeilen) sind in jedem Szenario Custom. Das spricht für eine starke Standard-Basis mit gezieltem Custom an den Veredelungs-Stellen („Teil-Make“, Kapitel 24.1). Jeder Anbieter sollte diese Matrix für sein eigenes System ausfüllen.**

## 31.1 Kandidatenvergleich (Buy-Optionen)

Die folgende Übersicht stellt die drei aktuellen Buy-Kandidaten gegenüber. Wichtig zur Einordnung: Die Spalte Xentral beruht auf der Recherche im Xentral Help Center und einem realen Branchen-Beleg (Mr.Tex, Kapitel 16/K-04). Die Spalten reybex (EDIT Systems GmbH, Essen) und orgaMAX (deltra Business Software, Detmold) beruhen ausschließlich auf öffentlichen Hersteller-Angaben (Website-Recherche Juni 2026) und sind daher als Ersteinschätzung zu lesen. Alle mit „Demo“ markierten Felder sind vor einer Entscheidung am echten TEXMA-Fall zu verifizieren (PoC: T-01, T-04, T-05).

| **Dimension** | **Xentral** | **reybex** | **orgaMAX** |
|---|---|---|---|
| WooCommerce-Multishop | nativ | nativ | E-Commerce-Modul; WooCommerce: Demo |
| Make-to-Order / Stücklisten | nativ | nativ (alle Fertigungsarten) | schwach: Demo |
| Mehrstufige Lohnveredelung (Beistellung→Rücklauf) | Custom (kein dediziertes Modul) | „verlängerte Werkbank“ vorhanden; Tiefe: Demo | nicht erkennbar: Demo |
| Varianten (Farbe × Größe) | nativ | nativ | Demo |
| FiBu / E-Rechnung / DATEV / Banking / Mahnwesen | nativ | nativ | nativ |
| Offene API / Headless (Anfrageshop-Anbindung) | API vorhanden | API-First / Headless (Stärke) | begrenzt: Demo |
| Cloud / Hosting in DE | Cloud (EU) | Cloud, IONOS DE | Cloud oder lokal (Windows) |
| Branchen-Beleg Textilveredelung | ja (Mr.Tex, K-04) | keiner bekannt: Demo | keiner bekannt: Demo |
| TEXMA-Custom (T-01-Mapping, Stickerei-Partnerlogik) | Custom | Custom: Demo | Custom: Demo |

# 32. Integrationsarchitektur

Zur Reduktion von Interpretationsspielraum beschreibt dieses Kapitel die Zielarchitektur und die Datenflüsse. Ein visuelles Architekturdiagramm wird als separate Anlage zur Ausschreibung bereitgestellt.

## Beteiligte Systeme

- **ERP (zentrales System, Maßstab Xentral)** — Stammdaten-, Auftrags-, Produktions- und Buchhaltungs-Master.
- **WooCommerce-Shops (10–12, Ziel 30)** — Bestelleingang, Status- und Tracking-Rückmeldung.
- **Anfrageshop (anfrage.texma-gmbh.de) und Sammelbestell-Shop (Kapitel 18)** — Lead- bzw. Sammelauftragseingang.
- **Steuerberater-Software ADDISON** — Empfang buchungsrelevanter Daten (DATEV-Format).
- **Banking (Volksbank)** — Kontoauszüge für den Zahlungsabgleich.
- **Lieferanten-APIs / EDI** — ID Identity, Stanley/Stella, HAKRO, FHB u. a.: Stammdaten und Bestellungen.
- **Versand (DPD)** — Labels und Trackingnummern.
- **E-Mail-System** — Angebots-, Rechnungs- und Mahnungsversand, E-Rechnungs-Empfang.
- **GoBD-Archiv (Kapitel 10)** — revisionssichere Belegablage.
- **Middleware (z. B. n8n)** — Mapping, Retry, Delta-Sync, Webhooks zwischen Lieferanten-APIs/Anfrageshop und ERP.

## Zentrale Datenflüsse

- Shop → ERP: Bestellungen (Auftragsanlage); ERP → Shop: Preise, Bestände, Status, Tracking.
- ERP → Lieferant: Sammelbestellung; Lieferant → ERP: Stammdaten, Verfügbarkeiten, Lieferavis/Rechnung.
- ERP → Bank/Versand/E-Mail: Zahlungen, Labels, Belege; Bank → ERP: Kontoumsätze.
- ERP → ADDISON: Buchungsdaten (DATEV-Format); ERP/Mail → Archiv: Belege.

**Die Middleware ist der architektonische Schlüssel für die Skalierung: Sie entkoppelt die heterogenen Lieferanten-APIs und den Anfrageshop vom ERP und ist Voraussetzung für das 30-Shop-Ziel ohne proportionalen Aufwand.**

# 33. Produktionssteuerung — Vertiefung

Ergänzung zu Kapitel 5. Der Produktionsbereich ist geschäftskritisch; die folgenden Aspekte präzisieren die Anforderung. Die Betriebsdatenerfassung (Start-/Stopp-Zeiten) ist bereits in Kapitel 5.2 (Stechuhr/Zeiterfassung) geregelt und wird hier nicht dupliziert.

## Kapazitäts- und Terminplanung

- Produktionsübersicht mit Ampelstatus je Liefertermin (bereits Kapitel 5.2) als Kern der Terminsteuerung — ersetzt die Excel-Liste.
- Priorisierung von Aufträgen bei Fixterminen (bereits Kapitel 5.1).

**Bewusste Abgrenzung: Eine echte Maschinenbelegungs-/Feinplanung (APS) ist für einen Produktionsbereich mit zwei Mitarbeitenden und überschaubarem Maschinenpark voraussichtlich überdimensioniert und würde mehr Pflegeaufwand erzeugen als Nutzen stiften. Sie wird als „Future“ eingestuft (Kapitel 25) und erst bei deutlichem Wachstum oder Inhouse-Stickerei erneut bewertet. Die Ampel-Terminliste deckt den aktuellen Bedarf.**

## Qualitätsmanagement

- Erfassung von Ausschussmengen und Nacharbeit je Produktionsauftrag (Ausschussabzug ist bei der Produktionsbuchung möglich).
- Klassifizierung von Fehlerursachen (verzahnt mit dem Reklamations-Workflow, Kapitel 20).
- Qualitätskennzahlen (Ausschussquote, Reklamationsquote) — siehe Kapitel 29.

# 34. Projektorganisation und kritische Risiken

Zur Steuerung des Einführungsprojekts werden Rollen und ein Workshop-Konzept festgelegt. Die personelle Besetzung ist von TEXMA zu benennen (K-25).

## Projektrollen

- Projektleitung Auftraggeber: zentrale Ansprechperson und Entscheider auf TEXMA-Seite.
- Key User je Bereich: Vertrieb/Innendienst, Produktion, Buchhaltung — fachliche Tests und Schulung.
- Entscheidungsgremium: Geschäftsleitung (Freigaben, Budget, Eskalation).
- Eskalationsprozess: definierter Weg bei Terminverzug oder fachlichen Konflikten.
- Abnahmeverantwortliche: benannt je Testfallbereich (Kapitel 15).

## Workshop-Konzept (Pflicht-PoC vor Vertragsabschluss)

Vor Vertragsabschluss sind die kritischen Prozesse in einem verpflichtenden Fachworkshop bzw. Proof-of-Concept mit den Anbietern zu validieren. Sie entsprechen den kritischen Testfällen aus Kapitel 15.

- WooCommerce-Mitarbeiter-/Firmenkunden-Mapping (T-01).
- Preisgruppenlogik über mehrere Shops (T-08).
- Mehrstufige Produktions- und Fremdveredelungsprozesse (T-04).
- Nachkalkulation von Produktionsaufträgen (T-10).
- Datenmigration aus CDH (Pilot mit einem Lieferanten / Teilbestand empfohlen).

**Reklamationsmanagement war eine Review-Empfehlung; es ist bereits als Workflow C in Kapitel 20 vollständig beschrieben und daher hier nicht erneut aufgeführt.**

# 35. Terminmanagement und Statusverwaltung

Die heutige Terminsteuerung über eine Excel-Liste — ergänzt um eine separate Statusführung der externen Veredler — ist der größte operative Schmerzpunkt. Ziel ist ein durchgängiges Status- und Terminmanagement über alle drei Vorgangsebenen (Angebot, Auftrag, Produktion) mit Wiedervorlagen und Erinnerungen in einem System. Die folgenden Status-Modelle sind Vorschläge und von TEXMA zu bestätigen (K-26).

## 35.1 Angebotsebene

Heute am schwächsten abgedeckt und zugleich der größte Vertriebshebel: Ohne systematische Nachverfolgung bleiben Angebote unnachgefasst.

- **Status:** Entwurf → Versendet → In Nachverfolgung → Gewonnen / Verloren (mit Verlustgrund) / Abgelaufen.
- Angebotsgültigkeit mit Verfallsdatum je Angebot.
- Wiedervorlage zum Nachfassen (z. B. definierte Tage nach Versand) mit Erinnerung.
- Conversion-Verfolgung Angebot → Auftrag (Abschlussquote als Kennzahl, Kapitel 29).
- Verzahnt mit den Leads aus dem Anfrageshop (Kapitel 18) und dem CRM (Kapitel 8).

## 35.2 Auftragsebene

- **Status:** Angelegt → Bestätigt (AB versandt) → Freigegeben (Logo/Druckdaten) → In Beschaffung → In Produktion → Versandbereit → Versendet → Fakturiert → Abgeschlossen (zusätzlich: Storniert).
- Zugesagter Liefertermin am Auftrag, mit Rückwärtsterminierung (Liefertermin minus Durchlaufzeit minus Veredler-Zeit) zur Ableitung des spätesten Produktions- und Bestellstarts.
- Fristenüberwachung: ausstehende Logo-/Datenfreigabe blockiert den Produktionsstart (Pflichtfeld, Kapitel 7.2); überfälliger Wareneingang wird gemeldet (Multi-Lieferant, Kapitel 5.6).
- Eskalation bei Terminrisiko (Liefertermin gefährdet).

## 35.3 Produktionsebene

Auf dieser Ebene ist der Kern bereits beschrieben (Kapitel 5) und wird hier nur um die Veredler-Sicht ergänzt.

- **Status:** Angelegt → Freigegeben → In Bearbeitung → Abgeschlossen (bereits Kapitel 5.2); für externe Unteraufträge zusätzlich: An Veredler übergeben → Rücklauf erhalten.
- Produktionsübersicht mit Liefertermin-Ampel (bereits Kapitel 5.2) als Kern der Terminsteuerung.
- Anliefer- und Fertigstellungstermin je Veredler-Unterauftrag (bereits in der externen Produktionszettel-Vorlage, Kapitel 5.1).
- Neu: systematisches Statustracking der externen Veredler im ERP — löst die heutige separate Lösung (Airtable) ab; Wiedervorlage bei überfälligem Rücklauf.

## 35.4 Übergreifendes Termin- und Wiedervorlage-Konzept

- Eine zentrale, ebenenübergreifende Terminübersicht: Angebote zum Nachfassen, Aufträge mit Terminrisiko, laufende Produktionen mit Liefertermin und überfällige Veredler-Rückläufe in einer Ansicht — ersetzt die Excel-Terminliste vollständig.
- Automatische Erinnerungen und Eskalationen bei Wiedervorlage oder Fristüberschreitung.
- Durchgängige Vorgangshistorie über die Stufen (Angebot → Auftrag → Produktion), sodass der Status nachvollziehbar mitwandert.
- Abgrenzung: Zahlungstermine und -status sind im Mahnwesen (Kapitel 9.5) abgedeckt, Reklamationstermine im Workflow C (Kapitel 20) — beide gehören konzeptionell zum Terminmanagement, sind aber bereits geregelt.

**Die Status-Modelle sind bewusst schlank zu halten, und Statuswechsel sollten möglichst automatisch aus Aktionen abgeleitet werden (z. B. „Fakturiert“ bei Versandbuchung, „In Produktion“ bei Produktionsstart). Bei rund 2.000 kleinteiligen Aufträgen pro Jahr und sechs Mitarbeitenden würde manuelle Statuspflege sonst zum neuen Aufwand — und ersetzte die Excel-Liste nur durch Klick-Arbeit.**

**Make-or-Buy-Bezug: Auftrags- und Produktionsstatus samt Belegkette und Liefertermin-Ampel sind Standardfunktion (nativ, vgl. Kapitel 31). Die Angebots-Nachverfolgung mit Wiedervorlage ist CRM-nahe Funktionalität, im Standard meist begrenzt (ggf. über Aufgaben/Wiedervorlagen oder Custom). Die zentrale ebenenübergreifende Terminübersicht ist teils Reporting, teils Custom. Diese drei Punkte sind in der Funktionsabdeckungs-Matrix (Kapitel 31) je Anbieter zu bewerten.**

# 36. Kundenportal (Self-Service-Kundenkonto)

Zusätzlich zu den drei bestehenden Shop-Welten (Mitarbeitershops Kapitel 3, Anfrageshop und Sammelbestell-Shop Kapitel 18) soll es ein Self-Service-Kundenkonto geben — bewusst kein weiterer Verkaufs-Shop mit eigenem Sortiment, sondern ein geschützter Bereich, in dem ein Kunde direkt auf seine eigenen Daten im System zugreift. Ziel ist die Entlastung des Innendienstes: Routineanfragen (Adressänderung, „schickt mir nochmal die Rechnung“, „bitte das Gleiche wie letztes Mal“) erledigt der Kunde selbst. Das unterstützt die zentrale Wirtschaftlichkeitsannahme — Skalierung ohne proportionalen Personalaufbau (Kapitel 21).

**Festlegung: Das Portal richtet sich an alle Kunden — mit und ohne eigenen Mitarbeitershop.**

## 36.1 Funktionsumfang

- **Stammdaten-Self-Service:** Rechnungsanschrift ändern, Lieferadressen anlegen, ändern und auswählen.
- **Beleg- und Historieneinsicht:** alte Angebote und Aufträge einsehen, dazu Rechnungen, Lieferscheine sowie Auftrags- und Lieferstatus mit Trackingnummer.
- **Nachbestellung:** keine direkte Nachbestellung, sondern aus einem früheren Auftrag oder einer Rechnung heraus eine neue Anfrage auslösen, die der Innendienst bearbeitet (gleiches Textil, gleiche Veredelung bzw. gleiches Logo).

## 36.2 Anforderungen ans System

- Login je Kundenkontakt; ein Rechtekonzept regelt, welche Kontakte einer Firma was sehen und ändern dürfen.
- Alle Daten kommen live aus dem zentralen System (eine Quelle der Wahrheit) — keine Doppelpflege.
- Self-Service-Änderungen (Adressen) werden ins System zurückgeschrieben; geänderte Rechnungsadressen mit Validierung bzw. optionaler Freigabe durch den Innendienst (steuerliche Relevanz).
- Nachbestellung erzeugt einen Vorgang im System mit Bezug auf den Ursprungsauftrag inklusive Veredelung/Logo.
- Datenschutz: jeder Kunde sieht ausschließlich seine eigenen Daten; Änderungen werden protokolliert (verzahnt mit Kapitel 28).

## 36.3 Kritischer Designpunkt — Nachbestellung

Festlegung: Wegen der kundenindividuellen Veredelungspreise gibt es keine verbindliche Nachbestellung mit Bezahlung. Stattdessen löst der Kunde aus einem früheren Auftrag oder einer Rechnung eine neue Anfrage aus; der Innendienst bestätigt sie mit aktuellem Preis und Termin und wandelt sie in einen Auftrag. So bleibt die Preishoheit beim Innendienst.

## 36.4 Einordnung (Maßstab Xentral)

Ein Self-Service-Kundenportal ist keine native Xentral-Funktion. Es wird über ein angebundenes Drittanbieter-Portal (per Schnittstelle, am Markt verfügbar — teils etabliert, teils noch in Erprobung) oder als kundenindividuelle Entwicklung realisiert; perspektivisch kann es Baustein der geplanten späteren Commerce-Schicht sein. Der anspruchsvollste Teil ist die Self-Service-Stammdatenpflege (Kunde ändert eigene Adressen), die am wenigsten standardisiert ist.

**In der Logik der Funktionsabdeckungs-Matrix (Kapitel 31) ist das Kundenportal als „Fremdsystem/Add-on oder Custom“ einzuordnen — nicht als Standard. Festlegung: Priorität Could (Kapitel 25), nicht Go-Live-relevant. Die Umsetzung erfolgt bewusst als Add-on, nachdem das Kernsystem steht. Es blockiert den Kernbetrieb nicht, ist aber ein starker Entlastungshebel für den Innendienst.**

# 37. Funktionsumfang im Überblick (Muss / Kann)

Dieser Überblick fasst zusammen, welche Funktionen das ERP für TEXMA abdecken muss und welche wünschenswert sind. Er dient Anbietern als schnelle Scope-Orientierung; die Details stehen in den jeweiligen Fachkapiteln. Maßstab ist das Geschäftsmodell: B2B-Auftragsfertigung (Make-to-Order) mit Textilveredelung, sechs Mitarbeitende, kein Fertigwarenlager.

## 37.1 Muss

- **Plattform:** deutschsprachige, einfach bedienbare Oberfläche; Benutzerrollen und Rechte (Produktion ohne Preis- und Kundenzugriff) mit 2-Faktor-Anmeldung; API-Zugriff; individuelle Automatisierung/Workflows; revisionssicheres GoBD-Archiv.
- **Stammdaten / PIM:** Artikel, Varianten (Farbe × Größe), Bilder, Beschreibungen und Preise zentral und automatisch in die Shops; CRM für Kunden und Lieferanten; Logo- und Druckdaten-Verwaltung mit Freigabe-Nachweis.
- **Verkauf / Auftrag:** Anfrage → Angebot → Auftrag; automatischer Eingang aus mehreren WooCommerce-Shops; Liefertermine mit Ampel.
- **Einkauf:** Bestellvorschlag, Engpasserkennung, tägliche Sammelbestellung je Lieferant, Wareneingang, 3-Way-Match.
- **Produktion (Kern):** interne und externe Veredelung, mehrstufige Fremdvergabe (Beistellung → Rücklauf), Stickerei-Partnerlogik, grobe Zeiterfassung, Nachkalkulation.
- **Finanzen:** Rechnungen und Gutschriften, E-Rechnung (Versand und Empfang), Mahnwesen, Bank- und SEPA-Zahlungsabgleich, Kostenstellen, DATEV-/Addison-Übergabe, Belegerfassung per Foto.
- **Lager (leicht):** schlanke Bestandsführung für Roh-/Blankoware und Showroom samt Inventurfunktion.
- **Versand:** Versandlabel und Tracking-Rückmeldung.
- **Reklamation:** strukturierte Abwicklung (Workflow C, Kapitel 20).
- **Reporting:** Kennzahlen inklusive Deckungsbeitrag je Auftrag.
- **Muster-Leihgut:** Ausgabe und Rückführung von Mustern (Details 37.3).
- **Bar-/EC-Kasse:** Vor-Ort-Zahlung von B2B-Bestellungen (Details 37.4).

## 37.2 Kann (wünschenswert, nicht Go-Live-kritisch)

- Kundenportal / Self-Service-Kundenkonto (Kapitel 36, als Add-on nach Go-Live).
- KI-gestützte Belegerfassung und Reporting.
- Erweiterte BI-Analysen über SQL- bzw. BI-Tool-Anbindung.
- Mobile Statusrückmeldung aus der Produktion.

## 37.3 Muster-Leihgut (Ausgabe und Rückführung)

Muster (Blankoware, Veredelungsmuster) werden an Kunden und Interessenten als Leihgut ausgegeben, nicht verkauft. Das ERP muss diesen Vorgang abbilden:

- Eigener Musterbestand bzw. eigenes Musterlager, getrennt vom Verkaufsbestand.
- Vorgangstyp „Musterausgabe“ als Warenausgang ohne Rechnung (Leihschein), mit Erfassung von Kunde, Artikel, Menge und Ausgabedatum.
- Rückbuchung bei Rückgabe und Wiedereinlagerung in den Musterbestand.
- Fristüberwachung: 21 Tage nach Ausgabe. Erfolgt bis dahin keine Rückgabe, wird automatisch eine „Musterrechnung“ fällig — der Leihvorgang wird in einen berechneten Verkauf umgewandelt.
- Inventurfähigkeit des Musterbestands.

**Diese Leihgut-Logik ist in Standard-ERPs selten als fertiges Modul vorhanden; sie wird über einen eigenen Bestandstyp, einen Warenausgang ohne Faktura und einen fristgesteuerten Folgebeleg abgebildet. Jeder Anbieter sollte zeigen, wie er den 21-Tage-Automatismus zur Musterrechnung umsetzt (Demo-Prüfpunkt).**

## 37.4 Bar-/EC-Kasse für Vor-Ort-Zahlungen

Ein Teil der B2B-Bestellungen wird vor Ort bar oder per EC-Karte bezahlt. Benötigt wird eine schlanke Kassenfunktion für diese Vor-Ort-Zahlungen — kein vollwertiges Einzelhandels-Kassensystem.

- Erfassung von Bar- und EC-Zahlungen mit direkter Verbuchung auf den zugehörigen Auftrag bzw. die Rechnung.
- Beleg-/Bonausgabe.

**Rechtlicher Hinweis: Sobald Zahlungen über ein elektronisches Kassensystem erfasst werden, greift die Kassensicherungsverordnung — dann sind eine zertifizierte technische Sicherheitseinrichtung (TSE), Belegausgabe und ein DSFinV-K-Export Pflicht. Ob die Kasse als elektronisches System (mit TSE) oder als offene Ladenkasse geführt wird, ist mit dem Steuerberater zu klären; jeder Anbieter ist zu fragen, ob seine Kassenfunktion TSE-zertifiziert ist (Demo-Prüfpunkt).**

# 38. UI/UX und Bedienbarkeit

Das ERP ist ein internes Werkzeug für sechs Mitarbeitende. Maßstab ist nicht die Optik, sondern Effizienz und Akzeptanz im täglichen Betrieb. Bei dieser Teamgröße ist Akzeptanz erfolgskritisch — ein einziger Nutzer, der das System ablehnt, blockiert ein Sechstel des Betriebs. Die folgenden Anforderungen sind bewusst prüfbar formuliert, damit Bedienbarkeit ein Auswahl- und Abnahmekriterium wird (verzahnt mit Kapitel 26).

## 38.1 Grundanforderungen

- Durchgängig deutschsprachige Oberfläche mit Begriffen aus der TEXMA-Praxis (z. B. Veredelung, Mappennummer).
- Rollenspezifische Ansichten: Innendienst sieht die volle Abwicklung; die Produktion sieht eine reduzierte Ansicht mit großen Bedienelementen für Status- und Zeiterfassung, ohne Preis- und Kundendaten (verzahnt mit Kapitel 12). Die Produktionsansicht ist tablet-/touchtauglich für die Werkstatt.
- Nicht genutzte Module und Felder lassen sich ausblenden (Scope gemäß Kapitel 37).
- Globale, fehlertolerante Suche über Belege und Stammdaten; Belegsuche unter 3 Sekunden (Kapitel 26).
- Die häufig genutzten Erfassungsmasken (insbesondere Auftragserfassung) sind vollständig tastaturbedienbar; Barcode-/Scan-Eingabe, wo sinnvoll.
- Fehlervermeidung durch Pflichtfelder und Plausibilitätsprüfungen; eine ausdrückliche Bestätigung wird nur bei kritischen, schwer umkehrbaren Aktionen verlangt (Storno, Freigabe — Kapitel 12.1/K-26).

## 38.2 Effizienz der Kernabläufe

Die täglich häufigsten Abläufe müssen mit minimaler Klick- und Wegezahl bedienbar sein. Folgende Kernabläufe dienen als Effizienz-Maßstab:

- Auftrag erfassen (aus Anfrage/Angebot übernommen oder neu angelegt).
- Auftrags- bzw. Produktionsstatus setzen.
- Tägliche Sammelbestellung je Lieferant auslösen.
- Rechnung erzeugen und versenden.
- Mustervorgang erfassen (Ausgabe bzw. Rückgabe, Kapitel 37.3).

Jeder dieser Abläufe soll ohne Umwege und in wenigen, klar geführten Schritten möglich sein. Statt einer willkürlich gesetzten Klickzahl weist jeder Anbieter die tatsächliche Schrittzahl je Ablauf in der Demo nach; der Vergleich zwischen den Anbietern wird Teil der Bewertung.

## 38.3 Bedienbarkeit als Auswahl- und Abnahmekriterium

Bedienbarkeit wird nicht über Screenshots oder Hersteller-Vorführungen bewertet, sondern über einen praktischen Test: Mitarbeitende des Innendienstes und der Produktion führen in der Demo ihre häufigsten Aufgaben eigenständig und ohne Anleitung durch.

**Maßgeblich ist die Bedienung durch die echten Nutzer an echten TEXMA-Aufgaben, nicht eine Vorführung durch den Anbieter. Kriterium: Die Aufgaben werden in angemessener Zeit und ohne Rückfragen bewältigt, und die Produktionsansicht ist auch für nicht IT-affine Nutzer unmittelbar verständlich. Dieser Nutzer-Usability-Test ist Bestandteil der Anbieterauswahl und der Abnahme (Kapitel 26).**

**Das Bild aus Kapitel 31 bestätigt sich: Den kaufmännischen Standard-Block decken alle drei ab. Den Unterschied macht die Tiefe bei der mehrstufigen Veredelung — dort hat nur Xentral bislang einen realen Branchen-Beleg, reybex eine plausible, aber zu prüfende Funktionsbasis (Stärke: API-First/Headless für die Anfrageshop-Anbindung), und orgaMAX die schwächste Abdeckung. Entscheidend ist die Demo am echten Auftrag, nicht der Funktionsumfang auf der Website.**

# 39. Neue Klärungspunkte (Ergänzung zu Kapitel 16 und 23)

- **K-21:** MoSCoW-Priorisierung (Kapitel 25) bestätigen — insbesondere, was zwingend zum Go-Live gehört.
- **K-22:** Messbare Abnahmekriterien / Service-Level (Kapitel 26) festlegen und in den Vertrag aufnehmen.
- **K-23:** Nichtfunktionale Zielwerte (Kapitel 27) bestätigen — Mengengerüst (Artikelzahl-Reserve), Verfügbarkeit, RTO/RPO.
- **K-24:** Gewichtung der Make-or-Buy-Bewertungsmatrix (Kapitel 30) bestätigen.
- **K-25:** Personelle Besetzung der Projektrollen (Kapitel 34) benennen.
- **K-26:** Status-Modelle je Ebene (Kapitel 35) bestätigen oder anpassen; Grad der Automatisierung der Statuswechsel festlegen.

*Dokumentstatus: Dieses Lastenheft basiert auf einer vollständigen Prozessanalyse von TEXMA Textilveredelung und beschreibt die Anforderungen an ein künftiges ERP. Xentral dient als funktionaler Maßstab (State of the Art); die Make-or-Buy-Entscheidung — Standardsystem beschaffen oder eigenständig umsetzen — ist ausdrücklich Gegenstand der Beratung (Kapitel 24). Budget- und Kostenangaben sind in dieser Version bewusst nicht enthalten.*
