#!/usr/bin/env sh

set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [ -z "${BACKUP_DIR:-}" ]; then
  echo "BACKUP_DIR is required" >&2
  exit 1
fi

timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
target_dir="${BACKUP_DIR%/}"
target_file="${target_dir}/postgres-${timestamp}.sql.gz"

mkdir -p "$target_dir"

pg_dump "$DATABASE_URL" | gzip > "$target_file"

find "$target_dir" -type f -name 'postgres-*.sql.gz' -mtime +"${BACKUP_RETENTION_DAYS:-7}" -delete

echo "Created backup: $target_file"
