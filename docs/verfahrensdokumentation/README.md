# Verfahrensdokumentation (GoBD) — TEXMA ERP

GoBD-Pflichtdokument (Kap. 10.5). Versioniert in Git, wächst mit der Implementierung mit
(Gate **G4**). Vor Go-Live ist sie vom Steuerberater gegenzuzeichnen (Kap. 10.3).

> Status: **lebend** — gefüllt entlang der gebauten Funktionen. Noch offene Punkte sind
> unten ausdrücklich als **[offen]** markiert (eine überzeichnende Verfahrensdoku ist
> selbst ein GoBD-Risiko).

## 1. Allgemeine Beschreibung
- **Unternehmen:** TEXMA GmbH, Textilveredelung.
- **Geschäftsmodell:** Lohnveredelung (Stick/Druck/Transfer) auf zugekauften Blank-Textilien,
  Make-to-Order; überwiegend B2B (Firmenkunden auf Rechnung). Keine eigene Konfektion (kein CMT).
- **Systemzweck:** operatives ERP für Anfrage → Angebot → Auftrag → Produktion → Versand → Faktura,
  inkl. Shop-Anbindung (WooCommerce), Beschaffung, Banking und E-Rechnung.
- **Abgrenzung Buchhaltung (Gate G1):** Das System führt **kein** Hauptbuch und bucht keine
  Geschäftsvorfälle in eine Finanzbuchhaltung. Es liefert einen **DATEV/EXTF-Export** an die
  Kanzlei; die Finanzbuchführung verbleibt beim Steuerberater (Addison).

## 2. Anwenderdokumentation
- **Rollen/Rechte (RBAC, Kap. 12, `packages/shared/src/rbac.ts`):**
  - `ADMIN` — Vollzugriff inkl. Konfiguration.
  - `BUERO` — Vertrieb/Auftragsabwicklung, Preise/Kundendaten sichtbar.
  - `BUCHHALTUNG` — Faktura/Offene Posten/Banking/Mahnwesen, Preise sichtbar.
  - `PRODUKTION` — Produktionssicht; **sieht keine Preise/Margen und keine Kundendaten**
    (technisch erzwungen).
- **Authentifizierung (Kap. 14):** Passwort + optionale **2FA (TOTP)**; Session-Cookies; Lockout.
- **Kernprozess (Vorgangskette):** Anfrage (`Inquiry`, B20) → Angebot (`Quote`) → Auftrag (`Order`)
  → Produktionsauftrag (`ProductionOrder`/Stückliste, ggf. Fremdvergabe) → Versand (`Shipment`/DPD)
  → Rechnung (`Invoice`, E-Rechnung) → Offener Posten/Zahlung/Mahnwesen.
- **Änderungsgrundsatz:** Ab Status `IN_BEARBEITUNG` keine inhaltliche Änderung am Beleg, sondern
  **Storno + Neuanlage** bzw. Korrektur via Gutschrift (Kap. 4.4 / 12.1).

## 3. Technische Systemdokumentation
- **Architektur:** modularer Monolith (`apps/api`) + Worker-/Connector-Tier
  (`services/workers/*`) mit Outbox-Muster (`OutboxEvent`) und Retry; Domänenlogik IO-frei in
  `packages/shared`, Persistenz in `packages/db` (Prisma/PostgreSQL).
- **Datenmodell:** `packages/db/prisma/schema.prisma` (versioniert, mit Kapitel-Provenance je
  Modell); Migrationen unter `packages/db/prisma/migrations` (sequenziell). Geldbeträge in Cent
  (Integer), nie Float. ER-Übersicht/Vorgangskette: siehe `docs/domänenmodell.md`.
- **Schnittstellen:** WooCommerce (Shop, Bestell-Import/Status-/Preis-Push), Lieferanten-API/Katalog,
  Banking **EBICS + PSD2/PIS** (camt053-Import, pain001-Zahlläufe), **DATEV/EXTF**-Export,
  **E-Rechnung** XRechnung/ZUGFeRD (Aus- und Eingang, EN16931-Kernprofil), DPD-Versand.
- **Hosting:** EU-Rechenzentrum (DSGVO). **Secrets:** verschlüsselte Ablage (AES-256-GCM, ADR 0002).
- **Verifikation (Gate G6):** CI (`.github/workflows/ci.yml`) mit Postgres-Service:
  `prisma migrate deploy`, Unit-Tests (DB-frei) und Integrationstests (`RUN_DB_TESTS=1`); Typecheck + Build.

## 4. Betriebsdokumentation
- **Datensicherung / Wiederanlauf (Kap. 27):** **asynchrone Streaming-Replikation** des
  PostgreSQL-Primary auf einen Hot-Standby — Ziel **RPO sekunden-nah / RTO ≤ 1 h**. Die Replica
  dient zugleich als Quelle für Auswertungen/BI (Metabase, B19). Bereitstellung als IaC:
  `infra/replication/` (Primary + Hot-Standby, Compose) inkl. Replikations-**Smoke-Test**
  (`smoke-test.sh`: Streaming, RPO-Lag, Read-only). Im Betrieb alternativ Managed-HA-Postgres.
  *[verbleibend extern: gemessener RPO/RTO-Failover-Drill auf echter Infrastruktur.]*
- **Notbetrieb (K-17, B17):** Bei Internet-Ausfall am Standort stellt das `continuity`-Modul ein
  **Tages-Offline-Bundle** der offenen Aufträge zusammen (Basis-Produktionsfelder, druck-/CSV-fähig,
  Vollständigkeitsprüfung); die Produktion arbeitet damit offline weiter. Beim **Wiederanlauf** werden
  Produktionsrückmeldungen **idempotent** nacherfasst (eindeutiger `idempotencyKey` an `TimeEntry` →
  keine Doppelbuchung), und das Outbox-/IntegrationLog-Muster liefert ausstehende Shop-/Versand-Events
  idempotent nach. **Schritt-für-Schritt-Failover** (Modus A + Modus B inkl. Promotion):
  `docs/verfahrensdokumentation/notfall-runbook.md`; der Failover-Drill ist halbjährlich zu üben.
- **Zugriffsschutz (Kap. 14):** 2FA, Session-/Lockout-Policy, Zugriffs-Logging (`AccessLog`).
- **Betriebsfußabdruck:** zu betreiben/patchen sind Postgres (+ Replica), Worker/Connectoren,
  optionale Sidecars (E-Rechnungs-Validierung KoSIT nur bei Zertifizierungsbedarf). **Zuständigkeit:**
  Rolle **Betreiber** (Infra/DevOps-Verantwortlicher) inkl. Stellvertretung — Aufgaben/Failover-
  Verantwortung im Notfall-Runbook (Rollentabelle). *[offen: konkrete Person je Rolle benennen.]*

## 5. Internes Kontrollsystem (IKS)
- **Unveränderbarkeit/WORM:** finalisierte Belege sind unveränderbar; Korrektur nur via Storno/
  Gutschrift. Append-only Audit-Trail (`packages/audit`, `AuditLog` mit before/after, kein Update/Delete).
- **Lückenloser Belegnummernkreis** je Belegart und Jahr (`NumberSequence`, F1): die laufende Nummer
  wird **atomar und kollisionsfrei** vergeben (UPSERT mit RETURNING), erst bei der **Finalisierung** —
  keine Lücken durch verworfene Entwürfe (Kap. 10/19). ERP ist Nummernkreis-Master.
- **Bestandsführung als Bewegungs-Ledger** (`StockMove`, append-only, F4): der Lagerbestand ist die
  **Summe der Bewegungen** und wird nie direkt gesetzt; Korrekturen (Inventur, B16) erzeugen ebenfalls
  eine Bewegung. `StockLevel` ist nur materialisierter Cache (Kap. 37.1).
- **E-Rechnung:** eingehende E-Rechnungen werden gegen das EN16931-Kernprofil **validiert**
  (`einvoice-inbound`); volle Schematron-Konformität optional über KoSIT-Sidecar (F3).
- **Aufbewahrung:** 10 Jahre (Buchungsbelege) / 6 Jahre (Geschäftsbriefe).
- **Löschen vs. Aufbewahren (DSGVO, Kap. 28):** **Sperren/Anonymisieren statt Löschen** ist
  umgesetzt (B12): PII von Firma/Kontakten wird überschrieben (Rolle/Branche bleiben), Belege
  (Rechnung/Gutschrift) bleiben als WORM unverändert. *[offen: Fristenmatrix/Aufbewahrungsfristen
  mit StB, die den Anonymisierungs-Zeitpunkt steuert.]*

## 6. Belegarten, Quellen und Fristen
| Belegart | Quelle/System | Nummernkreis | Aufbewahrung |
|---|---|---|---|
| Angebot (`Quote`) | ERP | AN | 6 J. |
| Auftrag (`Order`) | ERP / Shop-Import | AB | 6 J. |
| Rechnung (`Invoice`) | ERP (E-Rechnung) | RE | 10 J. |
| Gutschrift (`CreditNote`) | ERP | GS | 10 J. |
| Lieferschein (`DeliveryNote`) | ERP | LS | 6 J. |
| Bestellung (`PurchaseOrder`) | ERP/Lieferant | BE | 6 J. |
| Eingangsrechnung (`IncomingInvoice`) | Lieferant/E-Rechnung | (extern) | 10 J. |
| DATEV-Export | ERP → Kanzlei | — | beim StB |

## 7. Änderungshistorie
| Version | Datum | Autor | Änderung |
|---------|-------|-------|----------|
| 0.1 | 2026-06-18 | TEXMA | Gerüst angelegt |
| 0.2 | 2026-06-21 | TEXMA | IKS: lückenloser Belegnummernkreis (F1) + Bestands-Ledger (F4) ergänzt |
| 0.3 | 2026-06-21 | TEXMA | Volle Erstbefüllung aller 6 Abschnitte (B1); offene Punkte markiert |
