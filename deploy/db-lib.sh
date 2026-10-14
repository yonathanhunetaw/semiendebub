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

# lease_read -> "node ts" (empty if none)
lease_read() {
    local j; j="$("$MC" cat "$R2/primary.json" 2>/dev/null || true)"
    [ -n "$j" ] && printf '%s %s' "$(json_get "$j" node)" "$(json_get "$j" ts)" || true
}
lease_write() {
    printf '{"node":"%s","ts":%s}' "$NODE_NAME" "$(now_epoch)" | "$MC" pipe "$R2/primary.json" >/dev/null
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
    printf '%s' "$name"
}

# r2_prune: keep every dump for 2h, one per hour for 2 days, one per day for 30
# days, delete the rest. Only touches the new sortable names.
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
lock_release() { rm -rf "$STATE_DIR/$1.lock"; }

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
