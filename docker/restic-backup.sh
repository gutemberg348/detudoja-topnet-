#!/bin/sh
set -eu

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is required}"
: "${OFFSITE_BACKUP_INTERVAL_SECONDS:=86400}"
: "${OFFSITE_BACKUP_KEEP_DAILY:=14}"
: "${OFFSITE_BACKUP_KEEP_WEEKLY:=8}"
: "${OFFSITE_BACKUP_KEEP_MONTHLY:=12}"

if ! restic snapshots --latest 1 >/dev/null 2>&1; then
  echo "[offsite-backup] Initializing encrypted repository"
  restic init
fi

while true; do
  echo "[offsite-backup] Sending encrypted backup"
  restic backup /backups /uploads /kyc /chat --tag detudoja --tag production
  restic forget --prune \
    --keep-daily "$OFFSITE_BACKUP_KEEP_DAILY" \
    --keep-weekly "$OFFSITE_BACKUP_KEEP_WEEKLY" \
    --keep-monthly "$OFFSITE_BACKUP_KEEP_MONTHLY"
  echo "[offsite-backup] Backup completed"
  sleep "$OFFSITE_BACKUP_INTERVAL_SECONDS"
done
