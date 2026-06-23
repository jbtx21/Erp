# Betrieb & Härtung (NFR Kap. 27/28)

Dieser Leitfaden bündelt die betrieblichen Härtungs-Bausteine des ERP. Ziele aus dem
Lastenheft: **RPO 24 h** (max. 1 Tag Datenverlust), **RTO 8 h** (Wiederanlauf binnen
Arbeitstag), **99,5 %** Verfügbarkeit.

## 1. Backup & Restore (RPO 24 h / RTO 8 h)

- **Backup:** `scripts/backup.sh` erzeugt einen konsistenten `pg_dump` im custom-Format
  (komprimiert, restore-fähig) inkl. SHA-256-Prüfwert und räumt Sicherungen älter als
  `RETENTION_DAYS` (Default 35) auf.
- **Restore:** `scripts/restore.sh <datei.dump>` prüft den SHA-256-Wert und spielt das
  Backup transaktional zurück (`--clean --if-exists --single-transaction`).

Täglicher Cron-Job (erfüllt RPO 24 h):

```cron
0 2 * * *  DATABASE_URL=postgresql://USER:PW@HOST:5432/texma \
           BACKUP_DIR=/var/backups/texma \
           /opt/erp/scripts/backup.sh >> /var/log/texma-backup.log 2>&1
```

**Restore regelmäßig testen** (RTO-Nachweis): Backup in eine Wegwerf-DB einspielen und
eine Stichprobe prüfen. Das Backup gehört auf ein **getrenntes Medium/Region**
(3-2-1-Regel). Die GoBD-pflichtigen Belege selbst liegen zusätzlich unveränderbar im
WORM-Belegarchiv (siehe `docs`/Kap. 10) — das Backup sichert die Datenbank, nicht das
Archiv.

## 2. Health & Readiness (Monitoring)

- `GET /health` — **Liveness**: Prozess läuft (immer `{ ok: true }`).
- `GET /ready` — **Readiness**: pingt die DB (`SELECT 1`); `503` wenn die DB nicht
  erreichbar ist. Für Load-Balancer/Orchestrierung als Bereitschafts-Probe nutzen.

## 3. Anwendungs-Härtung (Kap. 28)

- **Login-Brute-Force-Schutz:** Fixed-Window-Rate-Limiter (10 Versuche / 5 min je
  E-Mail) vor der Passwortprüfung; ergänzt den Konto-Lockout (5 Fehlversuche → 15 min).
- **Sicherheits-Header:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer` auf allen Antworten.
- **Log-Redaction:** `cookie`, `authorization` und `set-cookie` werden im strukturierten
  Log maskiert — Session-Token/Secrets landen nicht im Klartext.
- **Secrets** ausschließlich über ENV bzw. AES-256-GCM-verschlüsselt in der DB; in der UI
  maskiert; nie geloggt oder committet.
- **2FA (TOTP)** pro Mitarbeiter aktivierbar; Sessions als gehashtes Cookie-Token.

## 4. Offen / nächste Härtungsschritte

- Backups verschlüsseln (z. B. `age`/GPG) und Offsite/Objektspeicher-Replikation.
- Zentrales Monitoring/Alerting (Prometheus/Grafana o. ä.) auf `/ready` + Backup-Erfolg.
- Erzwungene 2FA-Pflicht (derzeit optional) und Passwort-Policy-Schärfung.
- WORM-Belegarchiv auf S3-Object-Lock umstellen (heute lokales Read-only-Dateisystem).
