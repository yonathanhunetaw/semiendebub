#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/duka_backup_$TIMESTAMP.sql.gz"

# 1. Dump the database using your actual .env credentials and compress it
docker exec duka-prod-db mysqldump -u dukauser -pdukapass duka | gzip > "$BACKUP_FILE"

# 2. Push to your dedicated duka-prod-db-backups R2 bucket
mc cp "$BACKUP_FILE" r2/duka-prod-db-backups/latest.sql.gz
mc cp "$BACKUP_FILE" "r2/duka-prod-db-backups/duka_backup_$TIMESTAMP.sql.gz"

# 3. Cleanup local temp file
rm "$BACKUP_FILE"
echo "Database backup pushed to r2/duka-prod-db-backups at $TIMESTAMP"