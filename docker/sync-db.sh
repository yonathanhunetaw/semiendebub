#!/bin/bash
# sync-db.sh - keep a standby's database following the primary's backups.
# Run it from cron every minute on the standby (see docs/reference/backups.md).
#
# standby: while ANOTHER node holds a fresh primary lease, restore each new
#   dump that appears in R2 (checked against latest.json's sha256). It does
#   nothing when the lease is stale (primary down: backup-db.sh takes over,
#   which is allowed because this node is already current) or when this node
#   itself holds the lease.
# primary: if another node has taken over and uploaded newer dumps, this node
#   is BEHIND. By default (BACKUP_AUTO_CATCHUP unset or true) it saves a safety
#   dump, restores the newer dump and takes the lease back. Set
#   BACKUP_AUTO_CATCHUP=false in the env file to only log BEHIND instead.
# viewer: never does anything.
#
# Shares a lock with backup-db.sh so a backup can never upload a half-restored
# database.
set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
[ -d "/opt/homebrew/bin" ] && export PATH="/opt/homebrew/bin:$PATH"
export HOME="${HOME:-$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f6 || true)}"

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../deploy/db-lib.sh
. "$APP_ROOT/deploy/db-lib.sh"

case "${1:-}" in -h|--help) sed -n '2,17p' "$0"; exit 0 ;; esac

db_init
log()  { echo "[$(date '+%F %T')] [${NODE_NAME}/${NODE_ROLE:-?}] sync: $*"; }
fail() { echo "[$(date '+%F %T')] [${NODE_NAME}/${NODE_ROLE:-?}] sync ERROR: $*" >&2; exit "${2:-1}"; }
# log_every <key> <seconds> <message...>: repeat a message at most that often
log_every() {
    local key="$1" secs="$2"; shift 2
    local last; last="$(state_get "logged_$key")"
    if [ $(( $(now_epoch) - ${last:-0} )) -ge "$secs" ]; then log "$*"; state_set "logged_$key" "$(now_epoch)"; fi
}

case "$NODE_ROLE" in
    primary|standby) ;;
    viewer) exit 0 ;;
    "")     fail "NODE_ROLE is not set in $DUKA_ENV_FILE" ;;
    *)      fail "unknown NODE_ROLE '$NODE_ROLE'" ;;
esac
find_mc || fail "mc (MinIO client) not found in PATH ($PATH)"

lock_acquire db || { log_every busy 600 "another backup/sync is running: skipping"; exit 0; }
TMP=""
trap 'rm -f "${TMP:-}"; lock_release db' EXIT

info="$(r2_latest_info)"
remote_sha="$(json_get "$info" sha256)"
[ -n "$remote_sha" ] || exit 0                      # nothing published yet
my_sha="$(state_get last_sha)"

read -r holder lease_ts <<< "$(lease_read)" || true
holder="${holder:-}"; lease_ts="${lease_ts:-0}"
lease_age=$(( $(now_epoch) - lease_ts ))
lease_fresh=0
[ -n "$holder" ] && [ "$lease_age" -lt $(( LEASE_MIN * 60 )) ] && lease_fresh=1

# restore_latest <safety:0|1>: fetch + verify + (optional safety dump) + restore
restore_latest() {
    local safety="$1" rc=0
    TMP="$(mktemp "${TMPDIR:-/tmp}/duka_sync.XXXXXX")"
    r2_fetch_latest "$TMP" "$remote_sha" || rc=$?
    if [ "$rc" = 2 ]; then log_every mismatch 300 "latest.sql.gz does not match latest.json yet (upload in progress?): retrying next run"; return 1; fi
    [ "$rc" = 0 ] || fail "could not download a valid latest.sql.gz from $R2"
    if [ "$safety" = 1 ]; then
        local safe="$STATE_DIR/pre-catchup_$(utc_stamp).sql.gz"
        db_dump "$safe" || { rm -f "$safe"; fail "could not take a safety dump of this node's database: not touching it"; }
        log "safety dump of this node's database saved: $safe"
        ls -1t "$STATE_DIR"/pre-catchup_*.sql.gz 2>/dev/null | tail -n +4 | xargs rm -f 2>/dev/null || true
    fi
    log "restoring '$(json_get "$info" file)' made by '$(json_get "$info" node)' at $(json_get "$info" time)"
    db_restore_file "$TMP" || fail "restore failed; this node's last_sha is unchanged, so it will retry (database may be partly loaded)"
    state_set last_sha "$remote_sha"
    log "restored: now matches the newest backup (${remote_sha:0:12})"
}

if [ "$NODE_ROLE" = standby ]; then
    if [ "$lease_fresh" = 1 ] && [ "$holder" != "$NODE_NAME" ]; then
        [ "$remote_sha" = "$my_sha" ] && exit 0          # already in sync (the common case)
        restore_latest 0 || exit 0
    elif [ "$lease_fresh" = 1 ]; then
        exit 0                                           # I hold the lease (promoted): nothing to follow
    else
        log_every stale 600 "primary lease is stale (${lease_age}s): not syncing; backup-db.sh may take over if this node is current"
    fi
    exit 0
fi

# NODE_ROLE=primary: am I behind a node that took over?
if [ "$lease_fresh" = 1 ] && [ "$holder" != "$NODE_NAME" ] && [ "$remote_sha" != "$my_sha" ]; then
    if [ "$(db_env BACKUP_AUTO_CATCHUP true)" != false ]; then
        log "node '$holder' took over and has newer data: catching up"
        restore_latest 1 || exit 0
        lease_write
        log "lease taken back"
    else
        log_every behind 600 "BEHIND: '$holder' holds the lease with newer data than this node. BACKUP_AUTO_CATCHUP=false is set, so run 'make restore' here to catch up. Nothing is being uploaded."
    fi
fi
