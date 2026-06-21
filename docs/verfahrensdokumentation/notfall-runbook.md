# Notfall-Runbook (B17 · K-17 · Kap. 27)

Schritt-für-Schritt-Verfahren für die beiden Notbetriebs-Modi. Ziel: **RPO sekunden-nah,
RTO ≤ 1 h** (Modus B). Dieses Runbook ist Teil der Verfahrensdokumentation (Abschnitt 4)
und wird **halbjährlich** durch einen Failover-Drill geübt (siehe §5).

| Rolle | Verantwortung |
|---|---|
| **Betreiber** (Infra/DevOps-Verantwortlicher) | Failover ausführen, Standby neu bereitstellen, App-Reconnect |
| **Stellvertretung** | Übernahme bei Abwesenheit; Zugangsdaten im Secret-Management hinterlegt |
| **Geschäftsleitung** | Entscheidung Failover ja/nein, Kundenkommunikation |

> Zugangsdaten (DB-Superuser, Replikations-Rolle, Secret-Store) liegen im verschlüsselten
> Secret-Management (ADR 0002). Vor dem Ernstfall den Zugang der Stellvertretung prüfen.

---

## Modus A — Internet am Standort weg, Cloud/Server erreichbar

**Symptom:** Produktion/Büro ohne Internet, ERP in der Cloud läuft.

1. **Offline-Bundle ziehen** (solange noch eine Verbindung besteht, sonst vom letzten
   automatischen Tages-Bundle): `continuity`-Modul erzeugt das **Tages-Offline-Bundle**
   der offenen Aufträge (Produktionszettel-PDF + Lieferscheine als PDF/CSV).
2. **Produktion arbeitet offline** mit dem Bundle weiter (alle Produktions-Pflichtfelder
   enthalten; Vollständigkeitsprüfung im Modul).
3. **Wiederanlauf:** Produktionsrückmeldungen nacherfassen — der **`idempotencyKey`** an
   `TimeEntry`/Rückmeldungseingang verhindert Doppelbuchung bei erneuter Erfassung.
4. Ausstehende Shop-/Versand-Events werden über **Outbox/`IntegrationLog`** automatisch und
   idempotent nachgeliefert. Keine manuelle Nacharbeit nötig.

**Kein DB-Failover erforderlich** — die Datenbank war nie weg.

---

## Modus B — Cloud-/Primary-Datenbank-Ausfall (Failover auf den Hot-Standby)

**Symptom:** Primary-Postgres nicht erreichbar/korrupt; der Hot-Standby (asynchrone
Streaming-Replikation) ist verfügbar.

### B.0 Lageeinschätzung (≤ 5 min)
- Ist der Primary wirklich tot oder nur kurz gestört? Bei kurzer Störung **nicht** failen
  (Split-Brain-Risiko). Failover ist eine **Einbahnstraße** bis zur Neu-Bereitstellung.
- Replikations-Lag zum Ausfallzeitpunkt prüfen (= maximaler Datenverlust, RPO):
  ```sql
  -- auf dem Standby:
  SELECT now() - pg_last_xact_replay_timestamp() AS lag;
  ```

### B.1 Primary sicher abschalten (Split-Brain verhindern) (≤ 5 min)
- Primary-Instanz/Container **stoppen** bzw. vom Netz nehmen, damit keine zwei
  Schreib-Primaries entstehen.
  ```bash
  docker compose -f infra/replication/docker-compose.replication.yml stop primary
  ```

### B.2 Standby zum Primary promoten (≤ 5 min)
```bash
# Variante a) im Container:
docker compose -f infra/replication/docker-compose.replication.yml exec standby \
  su-exec postgres pg_ctl promote -D /var/lib/postgresql/data

# Variante b) per SQL (ab PG 12):
#   SELECT pg_promote();
```
Verifikation — der frühere Standby ist jetzt schreibbar:
```sql
SELECT pg_is_in_recovery();   -- erwartet: f (nicht mehr im Recovery)
```

### B.3 Anwendung auf den neuen Primary umstellen (≤ 10 min)
- `DATABASE_URL` (API/Worker) auf den **promoteten Knoten** zeigen lassen — Wert im
  Secret-Management ändern, App-Prozesse neu starten. Bevorzugt über einen stabilen
  Endpunkt (DNS-CNAME/Load-Balancer-VIP), sodass nur **ein** Eintrag umgehängt wird:
  ```
  DATABASE_URL=postgresql://texma:***@<neuer-primary-host>:5432/texma
  ```
- Migrations-Stand verifizieren (keine Migration ausführen — Daten sind bereits da):
  `prisma migrate status` muss „up to date" zeigen.

### B.4 Funktionsprüfung (≤ 10 min)
- `/health` der API grün; ein Lese- **und** ein Schreibvorgang (z. B. Test-Auftrag anlegen
  und wieder löschen) erfolgreich.
- Belegnummern-Sequenz (`NumberSequence`, F1) konsistent — nächste Nummer ohne Lücke/Dublette.
- Outbox/`IntegrationLog`: aufgelaufene Shop-/Versand-Events werden idempotent nachgeliefert.

### B.5 Neuen Standby bereitstellen (Redundanz wiederherstellen)
- Sobald der Betrieb läuft: einen **neuen Hot-Standby** gegen den neuen Primary aufsetzen
  (frisches `pg_basebackup`, vgl. `infra/replication/standby/entrypoint.sh`). Erst danach
  ist die HA-Redundanz wiederhergestellt.
- Den alten Primary **nicht** ungeprüft wieder zuschalten — nur als neuen Standby
  re-initialisieren (sonst Split-Brain/Divergenz).

**Zeitbudget gesamt: ~35–45 min → RTO ≤ 1 h eingehalten.**

---

## Betriebsoption: Managed-HA-Postgres
Statt selbstbetriebener Replikation kann ein **Managed-HA-Postgres** (EU-Region, DSGVO)
betrieben werden; Failover/Promotion übernimmt der Anbieter. Das Verfahren B.3/B.4
(App-Reconnect + Funktionsprüfung) bleibt identisch; B.1/B.2/B.5 entfallen.

---

## §5 Failover-Drill (halbjährlich, dokumentiert)
1. Replikation hochfahren: `docker compose -f infra/replication/docker-compose.replication.yml up -d`
2. **Smoke-Test** (Streaming + RPO + Read-only): `infra/replication/smoke-test.sh` → muss PASS.
3. Failover B.1–B.4 gegen die Test-Topologie durchspielen, **gemessene RTO** notieren.
4. Ergebnis (Datum, RTO, Auffälligkeiten) in dieser Datei / im Betriebslog festhalten.

> Der **gemessene** RPO/RTO-Drill auf echter Infrastruktur ist die einzige verbleibende
> externe Abhängigkeit von B17 — Artefakte (Compose, Smoke-Test, Runbook) sind vollständig.
