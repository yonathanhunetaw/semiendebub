#!/bin/bash
# db-lib.sh - shared helpers for database dumps, the R2 backup bucket and
# per-node backup state. Sourced by docker/backup-db.sh and deploy/deploy.sh;
# it has no side effects until you call db_init.
#
# Bucket layout (r2/<BACKUP_BUCKET>/):
#   latest.sql.gz                      newest dump (what a restore downloads)
#   latest.json                        {"file","sha256","node","time","bytes"} of that dump
#   primary.json                       {"node","ts"} lease: who is allowed to upload, refreshed every run
#   duka_backup_<UTC>_<node>.sql.gz    history, pruned by tier (see r2_prune)
#
# Per-node state (STATE_DIR, default ~/.duka-backup): last_sha = sha256 of the
# newest dump this node's database is known to descend from (set after an
# upload or a restore). A node refuses to upload when R2's latest differs from
# its last_sha, so a stale node can never overwrite the truth.
#
# Caller sets APP_ROOT before db_init.

# db_env KEY [default]: explicit environment wins, then the env file.
db_env() {
    local key="$1" default="${2:-}" value="${!1:-}"
    if [ -z "$value" ] && [ -f "${DUKA_ENV_FILE:-}" ]; then
        value="$(grep -m1 "^${key}=" "$DUKA_ENV_FILE" | cut -d= -f2- \
            | sed -e 's/[[:space:]]*#.*$//' -e "s/^[\"']//" -e "s/[\"']\$//" || true)"
    fi
    printf '%s' "${value:-$default}"
}

db_init() {
    DUKA_ENV_FILE="${DUKA_ENV_FILE:-$APP_ROOT/.env.production}"
    NODE_NAME="$(db_env NODE_NAME "$(hostname -s 2>/dev/null || hostname)")"
    NODE_NAME="$(printf '%s' "$NODE_NAME" | tr -c 'A-Za-z0-9_-' '-')"
    NODE_ROLE="$(db_env NODE_ROLE)"
    BACKUP_BUCKET="$(db_env BACKUP_BUCKET duka-prod-db-backups)"
    BACKUP_REMOTE="${BACKUP_REMOTE:-r2}"
    DB_CONTAINER="${DB_CONTAINER:-$(db_env DB_CONTAINER "$(db_env COMPOSE_PROJECT_NAME duka-prod)-db")}"
    DB_DOCKER="${DB_DOCKER:-docker}"
    LEASE_MIN="$(db_env BACKUP_LEASE_MIN 15)"
    ON_DEMAND="$(db_env NODE_ON_DEMAND false)"
    PINNED_TTL="$(db_env BACKUP_PINNED_TTL 180)"
    EXCLUDE_DATA="$(db_env BACKUP_EXCLUDE_DATA "sessions cache cache_locks")"
    STATE_DIR="${DUKA_STATE_DIR:-${HOME:-/tmp}/.duka-backup}"
    R2="$BACKUP_REMOTE/$BACKUP_BUCKET"
    mkdir -p "$STATE_DIR"
}

find_mc() {
    # DUKA_MC lets tests inject a fake client; production leaves it unset.
    MC="${DUKA_MC:-$(command -v mc || true)}"
    [ -z "$MC" ] && [ -x /usr/local/bin/mc ] && MC=/usr/local/bin/mc
    [ -n "$MC" ]
}

now_epoch() { date +%s; }
utc_stamp() { date -u +%Y%m%dT%H%M%SZ; }

# epoch_of_stamp 20261014T033400Z -> epoch seconds (GNU and BSD date)
epoch_of_stamp() {
    local s="$1"
    if date -u -d "@0" >/dev/null 2>&1; then
        date -u -d "${s:0:4}-${s:4:2}-${s:6:2} ${s:9:2}:${s:11:2}:${s:13:2}" +%s
    else
        date -u -j -f "%Y%m%dT%H%M%SZ" "$s" +%s
    fi
}

# epoch_of_date 2026-10-14 -> epoch seconds at 00:00 UTC
epoch_of_date() {
    if date -u -d "@0" >/dev/null 2>&1; then date -u -d "$1" +%s
    else date -u -j -f "%Y-%m-%d" "$1" +%s; fi
}

file_sha() {
    if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
    else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# json_get '<json>' key -> value of a flat string/number field (our own files only)
json_get() {
    printf '%s' "$1" | sed -n "s/.*\"$2\":\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p"
}

state_get() { cat "$STATE_DIR/$1" 2>/dev/null || true; }
state_set() { printf '%s' "$2" > "$STATE_DIR/$1"; }

# _db_dump_stream: raw dump text on stdout. Volatile tables (sessions, cache)
# keep their structure but not their rows, so an idle site produces an identical
# dump and unchanged runs can be skipped. Credentials come from the DB
# container's own MYSQL_* env.
_db_dump_stream() {
    ${DB_DOCKER:-docker} exec -i -e EXCLUDE="$EXCLUDE_DATA" "$DB_CONTAINER" sh -s <<'EOS'
set -e
export MYSQL_PWD="$MYSQL_PASSWORD"
ign=""; keep=""
for t in $EXCLUDE; do
    if mysql -u"$MYSQL_USER" -N -e "SHOW TABLES LIKE '$t'" "$MYSQL_DATABASE" | grep -qx "$t"; then
        ign="$ign --ignore-table=$MYSQL_DATABASE.$t"; keep="$keep $t"
    fi
done
mysqldump -u"$MYSQL_USER" --no-tablespaces --single-transaction --skip-dump-date $ign "$MYSQL_DATABASE"
[ -z "$keep" ] || mysqldump -u"$MYSQL_USER" --no-tablespaces --no-data --skip-dump-date "$MYSQL_DATABASE" $keep
EOS
}

# db_dump <out.gz>: consistent, deterministic dump (same data => same bytes).
# Fails if ANY stage fails (docker, mysqldump, gzip) or if the result has no
# table definitions: an empty gzip must never pass for a backup. On failure the
# real error text is printed to stderr.
# NB: count matches instead of `grep -q` in a pipe. grep -q exits at the first
# match, gzip then dies of SIGPIPE, and under `set -o pipefail` that reads as a
# failed dump for any dump bigger than the pipe buffer.
db_dump() {
    local out="$1" err="$1.err"
    if ! ( set -o pipefail; _db_dump_stream 2>"$err" | gzip -n > "$out" ); then
        echo "dump command failed: $(tail -n 5 "$err" 2>/dev/null | tr '\n' ' ')" >&2
        rm -f "$err"; return 1
    fi
    rm -f "$err"
    [ -s "$out" ] && gzip -t "$out" || { echo "dump file is empty or not valid gzip" >&2; return 1; }
    if [ "$(gzip -dc "$out" | grep -c 'CREATE TABLE')" -eq 0 ]; then
        echo "dump contains no tables: refusing to use it" >&2; return 1
    fi
}

r2_latest_info() { "$MC" cat "$R2/latest.json" 2>/dev/null || true; }

# The lease (primary.json): {"node","ts","ttl","pinned"}.
#   ttl    seconds it stays valid (default BACKUP_LEASE_MIN * 60). The on-demand
#          node (the Mac) writes a short one so others take over quickly when it stops.
#   pinned a deliberate takeover (make prod on an on-demand node): the other nodes
#          follow its data and must NOT take the lease back.
# lease_load sets: LEASE_HOLDER LEASE_AGE LEASE_FRESH(0|1) LEASE_PINNED(true|false)
lease_load() {
    local j ts ttl
    j="$("$MC" cat "$R2/primary.json" 2>/dev/null || true)"
    LEASE_HOLDER="$(json_get "$j" node)"
    ts="$(json_get "$j" ts)"; ttl="$(json_get "$j" ttl)"
    LEASE_PINNED="$(json_get "$j" pinned)"; [ "$LEASE_PINNED" = true ] || LEASE_PINNED=false
    case "$ts" in ''|*[!0-9]*) ts=0 ;; esac
    case "$ttl" in ''|*[!0-9]*|0) ttl=$(( LEASE_MIN * 60 )) ;; esac
    LEASE_AGE=$(( $(now_epoch) - ts ))
    LEASE_FRESH=0
    [ -n "$LEASE_HOLDER" ] && [ "$LEASE_AGE" -lt "$ttl" ] && LEASE_FRESH=1
    return 0
}

# lease_write [pinned:true|false] [ttl_seconds]: claim or refresh the lease as this node
lease_write() {
    printf '{"node":"%s","ts":%s,"ttl":%s,"pinned":%s}' "$NODE_NAME" "$(now_epoch)" "${2:-$(( LEASE_MIN * 60 ))}" "${1:-false}" \
        | "$MC" pipe "$R2/primary.json" >/dev/null
}

# lease_release: nobody holds the lease; the next node to run takes it
lease_release() {
    printf '{"node":"","ts":0,"ttl":0,"pinned":false}' | "$MC" pipe "$R2/primary.json" >/dev/null
}

# lease_touch: refresh the lease the way this node holds it. An on-demand node pins it with a short ttl.
lease_touch() {
    if [ "$ON_DEMAND" = true ]; then lease_write true "$PINNED_TTL"; else lease_write false; fi
}

# db_container_running: is the database container up?
db_container_running() {
    [ "$(${DB_DOCKER:-docker} inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null || true)" = true ]
}

# r2_publish <file.gz> <sha>: history copy, latest copy, then latest.json last
# (the commit point: standbys only look at latest.json).
r2_publish() {
    local file="$1" sha="$2" name
    name="duka_backup_$(utc_stamp)_${NODE_NAME}.sql.gz"
    "$MC" cp "$file" "$R2/$name" >/dev/null
    "$MC" cp "$file" "$R2/latest.sql.gz" >/dev/null
    printf '{"file":"%s","sha256":"%s","node":"%s","time":"%s","bytes":%s}' \
        "$name" "$sha" "$NODE_NAME" "$(date -u +%FT%TZ)" "$(wc -c < "$file" | tr -d ' ')" \
        | "$MC" pipe "$R2/latest.json" >/dev/null
    state_set last_sha "$sha"
    state_set last_backup_ts "$(now_epoch)"
    printf '%s' "$name"
}

# r2_prune: keep every dump for 2h, one per hour for 2 days, one per day for 30
# days, delete the rest. Old-format dumps are simply deleted after 30 days.
r2_prune() {
    local now name stamp age bucket seen_h=" " seen_d=" "
    now="$(now_epoch)"
    "$MC" ls "$R2/" 2>/dev/null | awk '{print $NF}' \
        | grep -E '^duka_backup_[0-9]{8}T[0-9]{6}Z_.*\.sql\.gz$' | sort | while read -r name; do
        stamp="${name:12:16}"
        age=$(( now - $(epoch_of_stamp "$stamp") ))
        if [ "$age" -lt 7200 ]; then continue; fi
        if [ "$age" -lt 172800 ]; then
            bucket="${stamp:0:11}"
            case "$seen_h" in *" $bucket "*) echo "$name"; continue ;; esac
            seen_h="$seen_h$bucket "; continue
        fi
        if [ "$age" -lt 2592000 ]; then
            bucket="${stamp:0:8}"
            case "$seen_d" in *" $bucket "*) echo "$name"; continue ;; esac
            seen_d="$seen_d$bucket "; continue
        fi
        echo "$name"
    done | while read -r name; do
        "$MC" rm "$R2/$name" >/dev/null 2>&1 || true
    done

    # Old-format dumps (duka_backup_Oct_Wed_2026-10-14_04:00_AM.sql.gz, made by the
    # previous backup script): delete the ones older than 30 days, by the date in
    # the name. Nothing creates new ones any more, so this just ages them out.
    "$MC" ls "$R2/" 2>/dev/null | awk '{print $NF}' \
        | grep -E '^duka_backup_[A-Za-z]{3}_[A-Za-z]{3}_[0-9]{4}-[0-9]{2}-[0-9]{2}_.*\.sql\.gz$' | while read -r name; do
        d="$(printf '%s' "$name" | sed -E 's/^duka_backup_[A-Za-z]{3}_[A-Za-z]{3}_([0-9]{4}-[0-9]{2}-[0-9]{2})_.*/\1/')"
        age=$(( now - $(epoch_of_date "$d") ))
        [ "$age" -gt 2592000 ] && "$MC" rm "$R2/$name" >/dev/null 2>&1 || true
    done
    events_prune
    uptime_prune
    return 0
}

# lock_acquire <name> / lock_release <name>: one backup/sync at a time per node.
# A lock whose process is gone is treated as stale and replaced.
lock_acquire() {
    local d="$STATE_DIR/$1.lock" pid
    if mkdir "$d" 2>/dev/null; then echo $$ > "$d/pid"; return 0; fi
    pid="$(cat "$d/pid" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then return 1; fi
    rm -rf "$d"
    mkdir "$d" 2>/dev/null && echo $$ > "$d/pid"
}
# Only the owner (the pid recorded in the lock) can release it.
lock_release() {
    local d="$STATE_DIR/$1.lock"
    [ "$(cat "$d/pid" 2>/dev/null || true)" = "$$" ] && rm -rf "$d"
    return 0
}
# lock_acquire_wait <name> <seconds>: keep trying (every 2 s) instead of giving up at once
lock_acquire_wait() {
    local waited=0
    while ! lock_acquire "$1"; do
        [ "$waited" -ge "$2" ] && return 1
        sleep 2; waited=$(( waited + 2 ))
    done
}

# db_restore_file <file.gz>: replace the database in $DB_CONTAINER with the dump.
# Drops every table first (a dump only recreates the tables it contains, so
# newer tables would survive and the next migrate would die on "already exists").
db_restore_file() {
    local f="$1"
    ${DB_DOCKER:-docker} exec -i "$DB_CONTAINER" sh -s <<'EOS' || return 1
set -e
export MYSQL_PWD="$MYSQL_PASSWORD"
t="$(mysql -u"$MYSQL_USER" -N -B -e "SET SESSION group_concat_max_len=1000000; SELECT GROUP_CONCAT(CONCAT(CHAR(96),table_name,CHAR(96))) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'" "$MYSQL_DATABASE")"
if [ -n "$t" ] && [ "$t" != "NULL" ]; then
    mysql -u"$MYSQL_USER" -e "SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS $t; SET FOREIGN_KEY_CHECKS=1;" "$MYSQL_DATABASE"
fi
EOS
    ( set -o pipefail
      gzip -dc "$f" | ${DB_DOCKER:-docker} exec -i "$DB_CONTAINER" sh -c 'export MYSQL_PWD="$MYSQL_PASSWORD"; exec mysql -u"$MYSQL_USER" "$MYSQL_DATABASE"' )
}

# r2_fetch_latest <dest> <expected_sha>: download latest.sql.gz and verify it.
# Returns 2 when the checksum differs (an upload is probably in progress; retry
# later) and 1 on any other failure.
r2_fetch_latest() {
    local dest="$1" want="$2"
    "$MC" cp "$R2/latest.sql.gz" "$dest" >/dev/null 2>&1 || return 1
    gzip -t "$dest" 2>/dev/null || return 1
    [ "$(file_sha "$dest")" = "$want" ] || return 2
}

# deployed.json in R2 says which git commit the primary last deployed
# successfully; standbys follow it (docker/auto-deploy.sh).
deploy_marker_write() {
    local commit; commit="$(git -C "$APP_ROOT" rev-parse HEAD 2>/dev/null)" || return 1
    printf '{"commit":"%s","node":"%s","time":"%s"}' "$commit" "$NODE_NAME" "$(date -u +%FT%TZ)" \
        | "$MC" pipe "$R2/deployed.json" >/dev/null
}
deploy_marker_read() { "$MC" cat "$R2/deployed.json" 2>/dev/null || true; }

# ---------------------------------------------------------------------------
# Shared event record (R2 events/…) and node heartbeats (R2 nodes/…), read by
# the admin "System status" page. Everything here is best effort: a failure to
# write an event must never break a backup, sync or deploy.
# ---------------------------------------------------------------------------

# json_str <text>: escape for use inside a JSON string
json_str() { printf '%s' "$1" | tr '\n\t\r' '   ' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# event_emit <type> <level:info|warn|error> <message> [data-json-object]
event_emit() {
    [ -n "${MC:-}" ] || return 0
    local type="$1" level="$2" msg data="${4:-}" key
    [ -n "$data" ] || data='{}'
    msg="$(json_str "$3")"
    key="events/$(utc_stamp)_${NODE_NAME}_${type}_${RANDOM}.json"
    printf '{"ts":%s,"time":"%s","node":"%s","role":"%s","type":"%s","level":"%s","message":"%s","data":%s}' \
        "$(now_epoch)" "$(date -u +%FT%TZ)" "$NODE_NAME" "${NODE_ROLE:-}" "$type" "$level" "$msg" "$data" \
        | "$MC" pipe "$R2/$key" >/dev/null 2>&1 || true
    return 0
}

# event_emit_every <key> <seconds> <type> <level> <message> [data]: rate-limited
# (for repeating failures: one event per window, not one per cron run)
event_emit_every() {
    local k="$1" secs="$2"; shift 2
    local last; last="$(state_get "evt_$k")"
    if [ $(( $(now_epoch) - ${last:-0} )) -ge "$secs" ]; then
        event_emit "$@"; state_set "evt_$k" "$(now_epoch)"
    fi
    return 0
}

# heartbeat_write [remote_sha]: nodes/<name>.json, one small object per node, rewritten each run
heartbeat_write() {
    [ -n "${MC:-}" ] || return 0
    local remote="${1:-}" mine insync=false up=true commit
    mine="$(state_get last_sha)"
    [ -n "$remote" ] && [ "$remote" = "$mine" ] && insync=true
    [ "$ON_DEMAND" = true ] && ! db_container_running && up=false
    commit="$(git -C "$APP_ROOT" rev-parse --short HEAD 2>/dev/null || true)"
    # tunnel (on|off) and app_up (true|false) come from docker/tunnel-guard.sh; empty
    # tunnel = the guard does not run on this node.
    local tunnel app; tunnel="$(state_get tunnel)"; app="$(state_get app_up)"
    [ "$app" = false ] || app=true
    # deploying = epoch the running deploy started (0 = none), see deploy_mark_start
    # Sync fields for the System page (all additive; old readers ignore them):
    #   behind_since / last_restore_ok / last_backup_ts / baseline_ts = epochs (0 = never/not behind)
    #   restore_failures = failed restores in a row
    #   tables_changed = tables written since the last dump or restore (null = could not ask the DB)
    local changed="null"
    if [ "$up" = true ] && [ -n "$(state_get baseline_ts)" ]; then changed="$(tables_changed_json "$(state_get baseline_ts)")"; fi
    printf '{"ts":%s,"node":"%s","role":"%s","on_demand":%s,"commit":"%s","last_sha":"%s","in_sync":%s,"db_up":%s,"tunnel":"%s","app_up":%s,"deploying":%s,"behind_since":%s,"last_restore_ok":%s,"restore_failures":%s,"last_backup_ts":%s,"baseline_ts":%s,"tables_changed":%s}' \
        "$(now_epoch)" "$NODE_NAME" "${NODE_ROLE:-}" "$ON_DEMAND" "$commit" "${mine:0:8}" "$insync" "$up" "$tunnel" "$app" "$(deploying_since)" \
        "$(state_num behind_since)" "$(state_num last_restore_ok)" "$(state_num restore_failures)" "$(state_num last_backup_ts)" "$(state_num baseline_ts)" "$changed" \
        | "$MC" pipe "$R2/nodes/${NODE_NAME}.json" >/dev/null 2>&1 || true
    uptime_log "$insync" "$up" "$tunnel" "$app" "$commit"
    uptime_publish
    node_stats_publish
    return 0
}

# state_num <key>: a state value that must be a whole number (0 when empty or odd)
state_num() {
    local v; v="$(state_get "$1")"
    case "$v" in ''|*[!0-9]*) echo 0 ;; *) echo "$v" ;; esac
}

# db_tables_changed <epoch>: names of tables written since that time (volatile ones
# excluded), one per line, after a first line "ok". No "ok" = the DB could not be asked.
# MySQL caches information_schema stats for a day, hence stats_expiry=0. UPDATE_TIME
# is kept in memory, so a MySQL restart forgets older writes: treat the answer as a
# lower bound, never as proof that nothing changed.
db_tables_changed() {
    ${DB_DOCKER:-docker} exec -i -e SINCE="$1" -e EXCLUDE="$EXCLUDE_DATA" "$DB_CONTAINER" sh -s 2>/dev/null <<'EOS' || true
export MYSQL_PWD="$MYSQL_PASSWORD"
case "$SINCE" in ''|*[!0-9]*) exit 1 ;; esac
mysql -u"$MYSQL_USER" -N -B -e "SET SESSION information_schema_stats_expiry=0; SELECT 'ok'; SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' AND update_time IS NOT NULL AND update_time > FROM_UNIXTIME($SINCE) ORDER BY 1" "$MYSQL_DATABASE" \
    | grep -v -x -E "$(echo "$EXCLUDE" | tr ' ' '|')" || true
EOS
}

# tables_changed_json <epoch>: {"count":N,"names":["a","b"]} (first 8 names) or null
tables_changed_json() {
    local out count names
    out="$(db_tables_changed "$1")"
    [ "$(printf '%s\n' "$out" | head -n 1)" = ok ] || { echo null; return 0; }
    names="$(printf '%s\n' "$out" | tail -n +2 | grep -E '^[A-Za-z0-9_]+$' || true)"
    count=0; [ -z "$names" ] || count="$(printf '%s\n' "$names" | wc -l | tr -d ' ')"
    names="$(printf '%s\n' "$names" | head -n 8 | grep . | sed 's/.*/"&"/' | paste -sd, - || true)"
    printf '{"count":%s,"names":[%s]}' "$count" "$names"
}

# ---------------------------------------------------------------------------
# Uptime history for the System page. Every heartbeat adds at most one line a minute
# to a local file; about every 10 minutes the current hour is uploaded as one small
# object (uptime/<node>/<YYYYMMDDTHH>.json, rewritten until the hour is over), so R2
# sees ~150 writes a day per node, not 1440. Pruned after 30 days.
# ---------------------------------------------------------------------------
UPTIME_PUBLISH_EVERY=600

# hour_stamp <epoch>: 20261018T07 (UTC; GNU and BSD date)
hour_stamp() {
    if date -u -d "@0" >/dev/null 2>&1; then date -u -d "@$1" +%Y%m%dT%H
    else date -u -r "$1" +%Y%m%dT%H; fi
}

# uptime_log <insync> <db_up> <tunnel> <app_up> <commit>: one line per minute
uptime_log() {
    local now minute; now="$(now_epoch)"; minute=$(( now / 60 ))
    [ "$(state_get uptime_last_min)" = "$minute" ] && return 0
    state_set uptime_last_min "$minute"
    printf '%s %s %s %s %s %s %s\n' "$now" "$1" "$2" "${3:--}" "$4" "$(deploying_since)" "${5:--}" >> "$STATE_DIR/uptime.log" 2>/dev/null || true
    return 0
}

# _uptime_put <hour_start_epoch>: upload that hour's lines. Returns non-zero if the upload failed.
_uptime_put() {
    local hs="$1" rows
    [ -s "$STATE_DIR/uptime.log" ] || return 0
    rows="$(awk -v a="$hs" -v b="$((hs + 3600))" '$1 >= a && $1 < b {
        printf "%s[%s,%s,%s,\"%s\",%s,%s,\"%s\"]", (n++ ? "," : ""), $1, $2, $3, ($4 == "-" ? "" : $4), $5, $6, ($7 == "-" ? "" : $7) }' "$STATE_DIR/uptime.log")"
    [ -n "$rows" ] || return 0
    printf '{"node":"%s","hour":"%s","from":%s,"rows":[%s]}' "$NODE_NAME" "$(hour_stamp "$hs")" "$hs" "$rows" \
        | "$MC" pipe "$R2/uptime/${NODE_NAME}/$(hour_stamp "$hs").json" >/dev/null 2>&1
}

# uptime_publish: throttled; also closes the previous hour once it is over
uptime_publish() {
    [ -n "${MC:-}" ] || return 0
    local now hs last; now="$(now_epoch)"; hs=$(( now / 3600 * 3600 )); last="$(state_num uptime_pub)"
    [ $(( now - last )) -ge "$UPTIME_PUBLISH_EVERY" ] || return 0
    if [ "$last" -gt 0 ] && [ "$last" -lt "$hs" ]; then _uptime_put $(( last / 3600 * 3600 )) || return 0; fi
    _uptime_put "$hs" || return 0
    state_set uptime_pub "$now"
    # keep two days locally, trimmed once an hour
    if [ "$(state_num uptime_trim)" -lt "$hs" ]; then
        awk -v c="$(( now - 172800 ))" '$1 >= c' "$STATE_DIR/uptime.log" > "$STATE_DIR/uptime.log.tmp" 2>/dev/null \
            && mv "$STATE_DIR/uptime.log.tmp" "$STATE_DIR/uptime.log" || true
        state_set uptime_trim "$hs"
    fi
    return 0
}

# A deploy takes the app down for a minute or two. deploy.sh marks it, the heartbeat
# carries it, and the tunnel guards do not count that downtime as "the node is down".
# A mark older than DEPLOY_GRACE_SEC (default 1200) is ignored: a deploy that hangs or
# dies without clearing it can only delay a failover by that long.
deploying_since() {
    local since; since="$(state_get deploying)"
    case "$since" in ''|*[!0-9]*) echo 0; return 0 ;; esac
    if [ $(( $(now_epoch) - since )) -lt "$(db_env DEPLOY_GRACE_SEC 1200)" ]; then echo "$since"; else echo 0; fi
}

# deploy_mark_start / deploy_mark_end: set or clear the mark and publish a heartbeat now,
# so the other nodes see it at once (not at this node's next sync run)
deploy_mark_start() { state_set deploying "$(now_epoch)"; deploy_mark_publish; }
deploy_mark_end()   { state_set deploying ""; deploy_mark_publish; }
deploy_mark_publish() {
    [ -n "${MC:-}" ] || find_mc || return 0
    heartbeat_write "$(json_get "$(r2_latest_info)" sha256)"
}

# db_table_counts: "table<TAB>rows" for every table (volatile ones excluded), for
# before/after comparisons around a restore. Prints nothing if the DB is unreachable.
db_table_counts() {
    ${DB_DOCKER:-docker} exec -i -e EXCLUDE="$EXCLUDE_DATA" -e WANT=counts "$DB_CONTAINER" sh -s 2>/dev/null <<'EOS' || true
export MYSQL_PWD="$MYSQL_PASSWORD"
q=""
for t in $(mysql -u"$MYSQL_USER" -N -e "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' ORDER BY 1" "$MYSQL_DATABASE"); do
    case " $EXCLUDE " in *" $t "*) continue ;; esac
    q="$q SELECT '$t', COUNT(*) FROM \`$t\` UNION ALL"
done
[ -z "$q" ] || mysql -u"$MYSQL_USER" -N -e "${q% UNION ALL}" "$MYSQL_DATABASE"
EOS
}

# counts_diff <before.tsv> <after.tsv>: JSON {"table":[before,after],…} for tables that differ
counts_diff() {
    awk -F'\t' 'NR==FNR { b[$1]=$2; all[$1]=1; next } { a[$1]=$2; all[$1]=1 }
        END { printf "{"; n=0
              for (t in all) { bb=(t in b)?b[t]:0; aa=(t in a)?a[t]:0
                  if (bb != aa) { printf "%s\"%s\":[%d,%d]", (n++?",":""), t, bb, aa } }
              printf "}" }' "$1" "$2"
}

# counts_summary <before.tsv> <after.tsv>: "missing added" = rows in before-but-not-after, rows only in after
counts_summary() {
    awk -F'\t' 'NR==FNR { b[$1]=$2; all[$1]=1; next } { a[$1]=$2; all[$1]=1 }
        END { m=0; ad=0
              for (t in all) { bb=(t in b)?b[t]:0; aa=(t in a)?a[t]:0
                  if (aa < bb) m += bb-aa; else if (aa > bb) ad += aa-bb }
              printf "%d %d", m, ad }' "$1" "$2"
}

# events_prune: delete event files older than 30 days (names start with the UTC stamp)
events_prune() {
    local now name stamp age
    now="$(now_epoch)"
    "$MC" ls "$R2/events/" 2>/dev/null | awk '{print $NF}' | grep -E '^[0-9]{8}T[0-9]{6}Z_' | while read -r name; do
        stamp="${name:0:16}"
        age=$(( now - $(epoch_of_stamp "$stamp") ))
        [ "$age" -gt 2592000 ] && "$MC" rm "$R2/events/$name" >/dev/null 2>&1 || true
    done
    return 0
}

# uptime_prune: delete uptime/<node>/<YYYYMMDDTHH>.json objects older than 30 days
uptime_prune() {
    local now name hour age
    now="$(now_epoch)"
    "$MC" ls -r "$R2/uptime/" 2>/dev/null | awk '{print $NF}' | grep -E '[0-9]{8}T[0-9]{2}\.json$' | while read -r name; do
        hour="$(basename "$name" .json)"
        age=$(( now - $(epoch_of_stamp "${hour}0000Z") ))
        [ "$age" -gt 2592000 ] && "$MC" rm "$R2/uptime/$name" >/dev/null 2>&1 || true
    done
    return 0
}

# Read-only node snapshot for the System page (containers, memory, disk, temperature).
# shellcheck source=node-stats.sh
. "$(dirname "${BASH_SOURCE[0]}")/node-stats.sh"
