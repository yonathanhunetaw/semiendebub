#!/bin/bash
set -euo pipefail

# cron runs with a minimal PATH/HOME, so set both explicitly.
# macOS (Homebrew) first if present; the Pi needs /usr/local/bin where mc lives.
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
if [ -d "/opt/homebrew/bin" ]; then
    export PATH="/opt/homebrew/bin:$PATH"
fi
export HOME="${HOME:-$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f6 || true)}"

MC="$(command -v mc || true)"
if [ -z "$MC" ] && [ -x /usr/local/bin/mc ]; then
    MC=/usr/local/bin/mc
fi
if [ -z "$MC" ]; then
    echo "ERROR: mc (MinIO client) not found in PATH ($PATH)" >&2
    exit 1
fi

TIMESTAMP=$(date "+%b_%a_%Y-%m-%d_%I:%M_%p")
BACKUP_FILE="/tmp/duka_backup_$TIMESTAMP.sql.gz"
trap 'rm -f "$BACKUP_FILE"' EXIT

fail() {
    echo "ERROR: database backup FAILED at $TIMESTAMP: $1" >&2
    exit 1
}

# 1. Dump the database cleanly using --no-tablespaces and compress it
docker exec duka-prod-db mysqldump -u dukauser -pdukapass --no-tablespaces duka | gzip > "$BACKUP_FILE" \
    || fail "mysqldump/gzip failed"
[ -s "$BACKUP_FILE" ] || fail "dump file is empty"
gzip -t "$BACKUP_FILE" || fail "dump file is not valid gzip"

# 2. Push to your dedicated duka-prod-db-backups R2 bucket
"$MC" cp "$BACKUP_FILE" r2/duka-prod-db-backups/latest.sql.gz \
    || fail "upload of latest.sql.gz failed"
"$MC" cp "$BACKUP_FILE" "r2/duka-prod-db-backups/duka_backup_$TIMESTAMP.sql.gz" \
    || fail "upload of timestamped backup failed"

# 3. Only reached when everything above succeeded (temp file removed by trap)
echo "Database backup pushed to r2/duka-prod-db-backups at $TIMESTAMP"
