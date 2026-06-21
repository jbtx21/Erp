# Verfahrensdokumentation (GoBD) — TEXMA ERP

GoBD-Pflichtdokument (Kap. 10.5). Versioniert in Git. Vor Go-Live vollständig auszufüllen
und vom Steuerberater gegenzeichnen zu lassen (Kap. 10.3).

> Status: **Gerüst** — wird entlang der Implementierung gefüllt.

## 1. Allgemeine Beschreibung
- Unternehmen, Geschäftsmodell (Lohnveredelung/Make-to-Order), Systemumfang.

## 2. Anwenderdokumentation
- Rollen/Rechte (Kap. 12), Bedienprozesse Angebot→Auftrag→Produktion→Faktura.

## 3. Technische Systemdokumentation
- Architektur (modularer Monolith + Connector-Schicht), Datenmodell (`packages/db`),
  Hosting (EU), Schnittstellen (WooCommerce, Lieferanten, Banking, DATEV, DPD).

## 4. Betriebsdokumentation
- Backup/RPO/RTO (Kap. 27), Notbetrieb bei Cloud-Ausfall (K-17), Zugriffsschutz/2FA (Kap. 14).

## 5. Internes Kontrollsystem (IKS)
- Belegsicherung, Unveränderbarkeit/WORM, Audit-Trail (`packages/audit`), Aufbewahrungsfristen
  (10 J. Buchungsbelege / 6 J. Geschäftsbriefe), Löschkonzept vs. Aufbewahrung (Kap. 28).
- **Lückenloser Belegnummernkreis** je Belegart und Jahr (`NumberSequence`): die laufende
  Nummer wird atomar und kollisionsfrei vergeben (UPSERT mit RETURNING), erst bei der
  Finalisierung eines Belegs — keine Lücken durch verworfene Entwürfe (F1, Kap. 10/19).
- **Bestandsführung als Bewegungs-Ledger** (`StockMove`, append-only): der Lagerbestand ist
  die Summe der Bewegungen und wird nie direkt gesetzt; Korrekturen (Inventur) erzeugen
  ebenfalls eine Bewegung. `StockLevel` ist nur materialisierter Cache (F4, Kap. 37.1).

## 6. Änderungshistorie
| Version | Datum | Autor | Änderung |
|---------|-------|-------|----------|
| 0.1 | 2026-06-18 | TEXMA | Gerüst angelegt |
| 0.2 | 2026-06-21 | TEXMA | IKS: lückenloser Belegnummernkreis (F1) + Bestands-Ledger (F4) ergänzt |
