#!/bin/bash

# Automatically include Homebrew path if it exists (macOS), otherwise use default system PATH
if [ -d "/opt/homebrew/bin" ]; then
    export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
fi

TIMESTAMP=$(date "+%b_%a_%Y-%m-%d_%I:%M_%p")
BACKUP_FILE="/tmp/duka_backup_$TIMESTAMP.sql.gz"

# 1. Dump the database cleanly using --no-tablespaces and compress it
docker exec duka-prod-db mysqldump -u dukauser -pdukapass --no-tablespaces duka | gzip > "$BACKUP_FILE"

# 2. Push to your dedicated duka-prod-db-backups R2 bucket
mc cp "$BACKUP_FILE" r2/duka-prod-db-backups/latest.sql.gz
mc cp "$BACKUP_FILE" "r2/duka-prod-db-backups/duka_backup_$TIMESTAMP.sql.gz"

# 3. Cleanup local temp file
rm "$BACKUP_FILE"
echo "Database backup pushed to r2/duka-prod-db-backups at $TIMESTAMP"