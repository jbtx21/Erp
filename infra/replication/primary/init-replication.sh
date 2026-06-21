#!/bin/bash
# B17 Modus B: Replikation auf dem Primary einrichten (läuft einmalig via
# docker-entrypoint-initdb.d, DB bereits initialisiert). Legt die Replikations-Rolle
# + einen physischen Replication-Slot an und erlaubt Replikationsverbindungen.
set -euo pipefail

REPLICATION_USER="${REPLICATION_USER:-replicator}"
REPLICATION_PASSWORD="${REPLICATION_PASSWORD:-replicator}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  -- Dedizierte Rolle: NUR Replikation, kein Datenzugriff (least privilege).
  CREATE ROLE ${REPLICATION_USER} WITH REPLICATION LOGIN PASSWORD '${REPLICATION_PASSWORD}';
  -- Named Slot: Primary hält WAL zurück, bis der Standby es bestätigt hat
  -- (verhindert WAL-Lücken bei kurzer Standby-Abwesenheit).
  SELECT pg_create_physical_replication_slot('standby_slot');
SQL

# Replikationsverbindungen aus dem Compose-Netz zulassen (scram-Auth via Passwort).
{
  echo "# B17 Modus B: Replikation vom Hot-Standby"
  echo "host replication ${REPLICATION_USER} all scram-sha-256"
} >> "$PGDATA/pg_hba.conf"

echo "init-replication: Rolle '${REPLICATION_USER}' + Slot 'standby_slot' angelegt, pg_hba ergänzt."
