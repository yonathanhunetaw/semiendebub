#!/bin/bash
# backup-db.sh - back up the prod database to R2, from the node that owns it.
# Run it from cron / launchd every few minutes (see docs/reference/backups.md).
#
# A node uploads only if ALL of these hold:
#   1. NODE_ROLE (in .env.production) is primary or standby. viewer never uploads.
#   2. Nobody else holds a fresh primary lease in R2 (primary.json). A standby
#      takes over only when that lease is older than BACKUP_LEASE_MIN minutes.
#   3. This node's database descends from R2's newest dump (state last_sha ==
#      latest.json sha256). Otherwise it is stale: restore first with
#      `./deploy-with-options.sh -e prod --restore-db`. Never overwrites the truth.
#   4. The data changed since the last dump (unchanged runs only refresh the lease).
#
# Flags:
#   --adopt   this node's database IS the truth: skip rule 3 once (first run on a
#             node, or after a deliberate manual repair)
#   --force   ignore another node's fresh lease (only if you know it is dead)
set -euo pipefail

# cron runs with a minimal PATH/HOME. macOS (Homebrew) first if present; the Pi
# needs /usr/local/bin where mc lives.
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
[ -d "/opt/homebrew/bin" ] && export PATH="/opt/homebrew/bin:$PATH"
export HOME="${HOME:-$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f6 || true)}"

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../deploy/db-lib.sh
. "$APP_ROOT/deploy/db-lib.sh"

ADOPT=0; FORCE=0
for arg in "$@"; do
    case "$arg" in
        --adopt) ADOPT=1 ;;
        --force) FORCE=1 ;;
        -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
        *) echo "Unknown option: $arg" >&2; exit 1 ;;
    esac
done

db_init
log()  { echo "[$(date '+%F %T')] [${NODE_NAME}/${NODE_ROLE:-?}] $*"; }
fail() { echo "[$(date '+%F %T')] [${NODE_NAME}/${NODE_ROLE:-?}] ERROR: $*" >&2; exit "${2:-1}"; }

find_mc || fail "mc (MinIO client) not found in PATH ($PATH)"

# --- rule 1: role ------------------------------------------------------------
case "$NODE_ROLE" in
    primary|standby) ;;
    viewer) log "viewer node: backups are never uploaded from here"; exit 0 ;;
    "")     fail "NODE_ROLE is not set in $DUKA_ENV_FILE (use primary, standby or viewer)" ;;
    *)      fail "unknown NODE_ROLE '$NODE_ROLE' (use primary, standby or viewer)" ;;
esac

# --- rule 2: lease -----------------------------------------------------------
read -r holder lease_ts <<< "$(lease_read)" || true
holder="${holder:-}"; lease_ts="${lease_ts:-0}"
lease_age=$(( $(now_epoch) - lease_ts ))
lease_fresh=0
[ -n "$holder" ] && [ "$lease_age" -lt $(( LEASE_MIN * 60 )) ] && lease_fresh=1

if [ "$lease_fresh" = 1 ] && [ "$holder" != "$NODE_NAME" ] && [ "$FORCE" = 0 ]; then
    if [ "$NODE_ROLE" = standby ]; then
        log "primary '$holder' is alive (lease ${lease_age}s old): standby does not back up"
        exit 0
    fi
    fail "node '$holder' holds the primary lease (${lease_age}s old). If it is really down, re-run with --force" 3
fi
if [ "$holder" != "$NODE_NAME" ] && [ -n "$holder" ] && [ "$FORCE" = 0 ]; then
    log "lease of '$holder' is stale (${lease_age}s): taking over"
fi

# --- rule 3: lineage ---------------------------------------------------------
info="$(r2_latest_info)"
remote_sha="$(json_get "$info" sha256)"
my_sha="$(state_get last_sha)"
if [ "$ADOPT" = 0 ] && [ -n "$remote_sha" ] && [ "$remote_sha" != "$my_sha" ]; then
    fail "this node's database is not known to descend from the newest backup in R2 (made by '$(json_get "$info" node)' at $(json_get "$info" time)). Restore first: ./deploy-with-options.sh -e prod --restore-db. If THIS database is the truth, run: $0 --adopt" 2
fi

# --- dump --------------------------------------------------------------------
TMP="$(mktemp "${TMPDIR:-/tmp}/duka_backup.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
db_dump "$TMP" || fail "mysqldump/gzip failed (is container '$DB_CONTAINER' running?)"
sha="$(file_sha "$TMP")"

# --- rule 4: changed? --------------------------------------------------------
if [ "$ADOPT" = 0 ] && [ "$sha" = "$remote_sha" ]; then
    lease_write
    log "unchanged since the last dump: lease refreshed, nothing uploaded"
    exit 0
fi

name="$(r2_publish "$TMP" "$sha")" || fail "upload to $R2 failed"
lease_write
log "pushed $name ($(wc -c < "$TMP" | tr -d ' ') bytes) to $R2"

# Prune at most once an hour.
last_prune="$(state_get last_prune)"
if [ $(( $(now_epoch) - ${last_prune:-0} )) -ge 3300 ]; then
    r2_prune || true
    state_set last_prune "$(now_epoch)"
fi
