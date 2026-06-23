#!/usr/bin/env bash
# GoBD-/Betriebs-Backup der ERP-Datenbank (Kap. 27, NFR: RPO 24 h).
# Erzeugt einen konsistenten pg_dump im custom-Format (komprimiert, restore-fähig),
# schreibt einen SHA-256-Prüfwert daneben und löscht Sicherungen älter als RETENTION_DAYS.
#
# Einsatz (z. B. täglich per cron):
#   0 2 * * *  DATABASE_URL=postgresql://texma:texma@localhost:5432/texma \
#              BACKUP_DIR=/var/backups/texma /opt/erp/scripts/backup.sh >> /var/log/texma-backup.log 2>&1
#
# Restore: scripts/restore.sh <backup-datei.dump>
set -euo pipefail

DB_URL="${DATABASE_URL:?DATABASE_URL muss gesetzt sein}"
BACKUP_DIR="${BACKUP_DIR:-./var/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-35}"   # >30 Tage Sicherheitsabstand zum RPO

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/texma-$TS.dump"

echo "[$(date -Is)] Backup nach $OUT …"
# -Fc: custom-Format (für pg_restore), -Z6: Kompression, --no-owner für portable Restores.
pg_dump --dbname="$DB_URL" -Fc -Z6 --no-owner --file="$OUT"

# Integritäts-Prüfwert (zur Verifikation des Mediums vor einem Restore).
sha256sum "$OUT" > "$OUT.sha256"

# Alte Sicherungen aufräumen (Aufbewahrung der Belege selbst regelt das GoBD-Archiv).
find "$BACKUP_DIR" -name 'texma-*.dump' -mtime "+$RETENTION_DAYS" -print -delete
find "$BACKUP_DIR" -name 'texma-*.dump.sha256' -mtime "+$RETENTION_DAYS" -delete

SIZE="$(du -h "$OUT" | cut -f1)"
echo "[$(date -Is)] Backup fertig ($SIZE). Aufbewahrung: ${RETENTION_DAYS} Tage."
