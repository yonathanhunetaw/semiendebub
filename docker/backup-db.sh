#!/bin/bash
# backup-db.sh - back up the prod database to R2, from the node that owns it.
# Run it from cron / launchd every few minutes (see docs/reference/backups.md).
#
# A node uploads only if ALL of these hold:
#   1. NODE_ROLE (in .env.production) is primary or standby. viewer never uploads.
#   2. Nobody else holds a fresh primary lease in R2 (primary.json). A standby
#      takes over only when that lease has expired (BACKUP_LEASE_MIN minutes).
#      An ON-DEMAND node (NODE_ON_DEMAND=true, the Mac) only acts while its
#      database container is running, and holds a PINNED lease with a short ttl
#      (BACKUP_PINNED_TTL, default 180 s) that the other nodes follow instead of
#      taking back; it claims the lease with --force from `make prod`.
#   3. This node's database descends from R2's newest dump (state last_sha ==
#      latest.json sha256). Otherwise it is stale: restore first with
#      `make restore`. Never overwrites the truth.
#   4. The data changed since the last dump (unchanged runs only refresh the lease).
#
# Flags:
#   --adopt   this node's database IS the truth: skip rule 3 once (first run on a
#             node, or after a deliberate manual repair)
#   --force   ignore another node's fresh lease (only if you know it is dead; the
#             on-demand node does this on purpose when `make prod` takes over)
#   --release take a last dump, then hand the lease back (nobody holds it; the
#             next node takes over). `make prod-stop` uses it before stopping.
set -euo pipefail

# cron runs with a minimal PATH/HOME. macOS (Homebrew) first if present; the Pi
# needs /usr/local/bin where mc lives.
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
[ -d "/opt/homebrew/bin" ] && export PATH="/opt/homebrew/bin:$PATH"
export HOME="${HOME:-$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f6 || true)}"

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../deploy/db-lib.sh
. "$APP_ROOT/deploy/db-lib.sh"

ADOPT=0; FORCE=0; RELEASE=0
for arg in "$@"; do
    case "$arg" in
        --adopt) ADOPT=1 ;;
        --force) FORCE=1 ;;
        --release) RELEASE=1 ;;
        -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
        *) echo "Unknown option: $arg" >&2; exit 1 ;;
    esac
done

db_init
log()  { echo "[$(date '+%F %T')] [${NODE_NAME}/${NODE_ROLE:-?}] $*"; }
fail() {
    echo "[$(date '+%F %T')] [${NODE_NAME}/${NODE_ROLE:-?}] ERROR: $*" >&2
    # a refused upload (stale node, lease held elsewhere) is a warning; anything else an error
    local lvl=error; [ "${2:-1}" != 1 ] && lvl=warn
    event_emit_every backup_fail 1800 backup_failed "$lvl" "$1"
    exit "${2:-1}"
}

find_mc || fail "mc (MinIO client) not found in PATH ($PATH)"

# --- rule 1: role ------------------------------------------------------------
case "$NODE_ROLE" in
    primary|standby) ;;
    viewer) log "viewer node: backups are never uploaded from here"; exit 0 ;;
    "")     fail "NODE_ROLE is not set in $DUKA_ENV_FILE (use primary, standby or viewer)" ;;
    *)      fail "unknown NODE_ROLE '$NODE_ROLE' (use primary, standby or viewer)" ;;
esac

# An on-demand node is "off" while its database container is not running: stay
# silent (cron runs every minute), but let --release hand back a lease it holds.
if [ "$ON_DEMAND" = true ] && ! db_container_running; then
    if [ "$RELEASE" = 1 ]; then
        lease_load
        if [ "$LEASE_HOLDER" = "$NODE_NAME" ]; then lease_release; log "database container is not running: lease released"; fi
    fi
    exit 0
fi

# One backup/sync at a time: never upload while a restore is in progress.
lock_acquire_wait db 120 || { log "a sync/restore has been running for over 2 minutes: skipping this run"; exit 0; }
TMP=""
trap 'rm -f "${TMP:-}"; lock_release db' EXIT

# --- rule 2: lease -----------------------------------------------------------
lease_load
holder="$LEASE_HOLDER"
if [ "$LEASE_FRESH" = 1 ] && [ "$holder" != "$NODE_NAME" ] && [ "$FORCE" = 0 ]; then
    if [ "$ON_DEMAND" = true ]; then
        log "'$holder' holds the lease (${LEASE_AGE}s old): run 'make prod' on this node to take over"
        exit 0
    fi
    if [ "$NODE_ROLE" = standby ]; then
        log "primary '$holder' is alive (lease ${LEASE_AGE}s old): standby does not back up"
        exit 0
    fi
    fail "node '$holder' holds the primary lease (${LEASE_AGE}s old). If it is really down, re-run with --force" 3
fi
if [ -n "$holder" ] && [ "$holder" != "$NODE_NAME" ]; then
    if [ "$LEASE_FRESH" = 1 ]; then
        log "--force: taking the lease from '$holder'"
        event_emit lease_takeover warn "$NODE_NAME took the primary lease from $holder (forced)" \
            "{\"from\":\"$holder\",\"forced\":true,\"lease_age\":$LEASE_AGE}"
    else
        log "lease of '$holder' is stale (${LEASE_AGE}s): taking over"
        event_emit lease_takeover warn "$NODE_NAME took the primary lease from $holder (its lease expired ${LEASE_AGE}s after the last refresh)" \
            "{\"from\":\"$holder\",\"forced\":false,\"lease_age\":$LEASE_AGE}"
    fi
fi

# finish_lease: refresh the lease the way this node holds it, or hand it back (--release)
finish_lease() {
    if [ "$RELEASE" = 1 ]; then
        lease_release; log "lease released: the next node takes over"
        event_emit lease_released info "$NODE_NAME handed the primary lease back"
    else lease_touch; fi
    heartbeat_write "$sha"
}

# --- rule 3: lineage ---------------------------------------------------------
info="$(r2_latest_info)"
remote_sha="$(json_get "$info" sha256)"
my_sha="$(state_get last_sha)"
if [ "$ADOPT" = 0 ] && [ -n "$remote_sha" ] && [ "$remote_sha" != "$my_sha" ]; then
    fail "this node's database is not known to descend from the newest backup in R2 (made by '$(json_get "$info" node)' at $(json_get "$info" time)). Restore first: make restore. If THIS database is the truth, run: $0 --adopt" 2
fi

# --- dump --------------------------------------------------------------------
TMP="$(mktemp "${TMPDIR:-/tmp}/duka_backup.XXXXXX")"
dump_started="$(now_epoch)"
db_dump "$TMP" || fail "mysqldump/gzip failed (is container '$DB_CONTAINER' running?)"
state_set baseline_ts "$dump_started"          # writes after this moment are not in the dump (System page)
sha="$(file_sha "$TMP")"

# --- rule 4: changed? --------------------------------------------------------
if [ "$ADOPT" = 0 ] && [ "$sha" = "$remote_sha" ]; then
    finish_lease
    log "unchanged since the last dump: lease refreshed, nothing uploaded"
    exit 0
fi

name="$(r2_publish "$TMP" "$sha")" || fail "upload to $R2 failed"
finish_lease
log "pushed $name ($(wc -c < "$TMP" | tr -d ' ') bytes) to $R2"
event_emit backup_pushed info "$NODE_NAME uploaded a backup" \
    "{\"file\":\"$name\",\"bytes\":$(wc -c < "$TMP" | tr -d ' '),\"sha\":\"${sha:0:8}\"}"

# Prune at most once an hour.
last_prune="$(state_get last_prune)"
if [ $(( $(now_epoch) - ${last_prune:-0} )) -ge 3300 ]; then
    r2_prune || true
    state_set last_prune "$(now_epoch)"
fi
