#!/bin/sh
# Back up the server's database: a gzipped, dated copy of db.json, keeping 14 days.
#
#   scripts/backup-db.sh [data dir] [backup dir]     once (defaults: data, backups)
#   scripts/backup-db.sh --daily [data dir] [backup dir]   once a day, forever (the compose service)
#
# The store replaces db.json by renaming a finished file over it, so a copy is always
# a whole database. Cron on a plain-Node host:
#   15 4 * * * /path/to/robotrage/scripts/backup-db.sh /path/to/robotrage/data /path/to/backups
set -eu
daily=
if [ "${1:-}" = --daily ]; then daily=1; shift; fi
DATA=${1:-data}
DEST=${2:-backups}
KEEP_DAYS=${KEEP_DAYS:-14}

backup() {
  mkdir -p "$DEST"
  if [ ! -f "$DATA/db.json" ]; then
    echo "backup-db: no $DATA/db.json yet" >&2
    return 0
  fi
  out="$DEST/db-$(date -u +%Y%m%d-%H%M%S).json.gz"
  gzip -c "$DATA/db.json" > "$out.part"
  mv "$out.part" "$out"
  find "$DEST" -maxdepth 1 -name 'db-*.json.gz' -mtime +"$((KEEP_DAYS - 1))" -delete
  echo "backup-db: $out"
}

if [ -z "$daily" ]; then backup; exit 0; fi
while :; do
  backup || echo "backup-db: failed" >&2
  sleep 86400
done
