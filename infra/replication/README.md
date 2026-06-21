# B17 Modus B — PostgreSQL Streaming-Replikation (IaC)

Lauffähiges Primary-+-Hot-Standby-Setup zur **Validierung** des Failover-Verfahrens
(K-17, Kap. 27). Asynchrone Streaming-Replikation → **RPO sekunden-nah, RTO ≤ 1 h**.
Im Betrieb entweder dieselbe Topologie auf zwei Hosts oder **Managed-HA-Postgres**.

## Dateien
| Datei | Zweck |
|---|---|
| `docker-compose.replication.yml` | Primary + Hot-Standby (async, named Replication-Slot) |
| `primary/init-replication.sh` | Replikations-Rolle + Slot + `pg_hba`-Eintrag auf dem Primary |
| `standby/entrypoint.sh` | `pg_basebackup` vom Primary, Start als read-only Hot-Standby |
| `smoke-test.sh` | Prüft Streaming, RPO-Lag und Read-only des Standby |
| `.env.example` | Beispiel-Umgebung (Passwörter im Betrieb via Secret-Management) |

## Schnellstart
```bash
cd infra/replication
cp .env.example .env          # Passwörter setzen
docker compose -f docker-compose.replication.yml up -d
./smoke-test.sh               # erwartet: ✅ PASS
```

## Failover
Schritt-für-Schritt im **Notfall-Runbook**:
`../../docs/verfahrensdokumentation/notfall-runbook.md` (Modus B, §B.1–B.5).

## Hinweise
- `synchronous_standby_names` bleibt leer → **asynchron**, keine Commit-Latenz auf dem
  Primary (Spec B17). Für RPO=0 müsste synchrone Replikation aktiviert werden (Trade-off
  Schreib-Latenz).
- Der **named Replication-Slot** (`standby_slot`) hält WAL zurück, bis der Standby es
  bestätigt — kein WAL-Verlust bei kurzer Standby-Abwesenheit, aber Plattenwachstum
  überwachen, falls der Standby länger weg ist.
- Dies ist **kein** App-Code: B17 Modus B ist bewusst IaC/Betrieb (Bauplan).
