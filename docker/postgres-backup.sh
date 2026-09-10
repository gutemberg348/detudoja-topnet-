#!/bin/sh
set -eu

: "${PGHOST:=postgres}"
: "${PGPORT:=5432}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${BACKUP_INTERVAL_SECONDS:=86400}"
: "${BACKUP_RETENTION_DAYS:=7}"

backup_dir="/backups"
mkdir -p "$backup_dir"

echo "[backup] PostgreSQL backup worker started. Interval: ${BACKUP_INTERVAL_SECONDS}s. Retention: ${BACKUP_RETENTION_DAYS} days."

while true; do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  filename="${PGDATABASE}-${timestamp}.dump"
  temporary_file="${backup_dir}/.${filename}.tmp"
  backup_file="${backup_dir}/${filename}"

  echo "[backup] Creating ${filename}"
  if pg_dump \
    --host "$PGHOST" \
    --port "$PGPORT" \
    --username "$PGUSER" \
    --format=custom \
    --no-owner \
    --no-privileges \
    --file "$temporary_file" \
    "$PGDATABASE"; then
    mv "$temporary_file" "$backup_file"
    find "$backup_dir" -type f -name "*.dump" -mtime "+${BACKUP_RETENTION_DAYS}" -delete
    echo "[backup] Completed ${filename}"
  else
    rm -f "$temporary_file"
    echo "[backup] Failed to create ${filename}" >&2
  fi

  sleep "$BACKUP_INTERVAL_SECONDS"
done
