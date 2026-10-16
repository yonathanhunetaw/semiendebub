#!/bin/bash
# tunnel-guard.sh - only the live node keeps its Cloudflare Tunnel connector up.
# Run it from cron / launchd every minute on every node (docs/reference/backups.md).
#
# Why: when the same tunnel is connected from two machines, Cloudflare does NOT
# fail over between them, it spreads requests over both. Each node has its own
# database (and sessions), so visitors were signed out at random and writes that
# landed on the standby were wiped by its next sync.
#
# Rule per run (the lease in R2 decides who is live; heartbeats say who is alive):
#   this node holds a fresh lease                     -> connector ON
#   a standby holds it and the primary is back+healthy -> hand back: connector OFF,
#                                                         last backup, release the lease
#   another node holds a fresh lease and is alive     -> connector OFF
#   the holder's heartbeat is older than TUNNEL_FAILOVER_SEC (it is down), this node
#   is a standby whose database matches the newest backup and whose app answers
#                                                     -> FAIL OVER: claim the lease
#                                                        (backup-db.sh --force), connector ON
#   nobody holds a lease                              -> the primary turns ON, others wait
#   R2 unreadable / anything unknown                  -> change nothing
#
# Flags: --dry-run (print the decision, change nothing), --stop (connector off now;
# make prod-stop uses it), --status (print on/off).
# Settings (.env.production): TUNNEL_GUARD=false disables it; TUNNEL_SERVICE (systemd
# unit, default cloudflared); TUNNEL_START_CMD / TUNNEL_STOP_CMD / TUNNEL_STATUS_CMD
# override the commands; TUNNEL_FAILOVER_SEC (default 180).
set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
[ -d "/opt/homebrew/bin" ] && export PATH="/opt/homebrew/bin:$PATH"
export HOME="${HOME:-$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f6 || true)}"

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../deploy/db-lib.sh
. "$APP_ROOT/deploy/db-lib.sh"

DRY=0; MODE=guard
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY=1 ;;
        --stop) MODE=stop ;;
        --status) MODE=status ;;
        -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
        *) echo "Unknown option: $arg" >&2; exit 1 ;;
    esac
done

db_init
log() { echo "[$(date '+%F %T')] [${NODE_NAME}/${NODE_ROLE:-?}] tunnel: $*"; }
log_every() {
    local key="$1" secs="$2"; shift 2
    local last; last="$(state_get "logged_tunnel_$key")"
    if [ $(( $(now_epoch) - ${last:-0} )) -ge "$secs" ]; then log "$*"; state_set "logged_tunnel_$key" "$(now_epoch)"; fi
}

# A dry run writes nothing to R2 either.
if [ "$DRY" = 1 ]; then event_emit() { :; }; event_emit_every() { :; }; fi

[ "$(db_env TUNNEL_GUARD true)" = false ] && exit 0
[ "$NODE_ROLE" = viewer ] && exit 0

# --- the connector commands ---------------------------------------------------
SERVICE="$(db_env TUNNEL_SERVICE cloudflared)"
if command -v systemctl >/dev/null 2>&1; then
    START_CMD="$(db_env TUNNEL_START_CMD "sudo -n systemctl start $SERVICE")"
    STOP_CMD="$(db_env TUNNEL_STOP_CMD "sudo -n systemctl stop $SERVICE")"
    STATUS_CMD="$(db_env TUNNEL_STATUS_CMD "systemctl is-active --quiet $SERVICE")"
else
    # macOS without a service: run the connector as a background process.
    CONFIG="$(db_env TUNNEL_CONFIG "$HOME/.cloudflared/config.yml")"
    START_CMD="$(db_env TUNNEL_START_CMD "nohup cloudflared tunnel --config $CONFIG run >> $APP_ROOT/deploy/logs/cloudflared.log 2>&1 &")"
    STOP_CMD="$(db_env TUNNEL_STOP_CMD "pkill -f 'cloudflared tunnel .*run'")"
    STATUS_CMD="$(db_env TUNNEL_STATUS_CMD "pgrep -f 'cloudflared tunnel .*run' >/dev/null")"
fi

tunnel_on() { bash -c "$STATUS_CMD" >/dev/null 2>&1; }

# app_answers: the local app replies on its port (any HTTP answer below 500)
app_answers() {
    local code
    code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' -H "Host: $(db_env APP_DOMAIN localhost)" \
        "http://127.0.0.1:$(db_env APP_PORT 8096)/up" 2>/dev/null || true)"
    case "$code" in 2??|3??|4??) return 0 ;; *) return 1 ;; esac
}

# set_tunnel on|off <reason>: act (unless --dry-run), record the state for the heartbeat, emit an event on change
set_tunnel() {
    local want="$1" reason="$2" now=off
    tunnel_on && now=on
    if [ "$now" = "$want" ]; then state_set tunnel "$now"; return 0; fi
    if [ "$DRY" = 1 ]; then log "would turn the connector $want: $reason"; return 0; fi
    if [ "$want" = on ]; then bash -c "$START_CMD" >/dev/null 2>&1 || true
    else bash -c "$STOP_CMD" >/dev/null 2>&1 || true; fi
    sleep 2
    now=off; tunnel_on && now=on
    state_set tunnel "$now"
    if [ "$now" = "$want" ]; then
        log "connector $want: $reason"
        event_emit "tunnel_$want" info "$NODE_NAME turned its tunnel connector $want: $reason" \
            "{\"reason\":\"$(json_str "$reason")\"}"
    else
        log "could not turn the connector $want ($([ "$want" = on ] && echo "$START_CMD" || echo "$STOP_CMD")). For systemd add a sudoers rule, see docs/reference/backups.md"
        event_emit_every "tunnel_fail_$want" 1800 tunnel_failed error "$NODE_NAME could not turn its tunnel connector $want: $reason"
    fi
}

# heartbeat_of <node>: "age healthy(1|0) role" from nodes/<node>.json ("" if missing)
heartbeat_of() {
    local j ts healthy=1
    j="$("$MC" cat "$R2/nodes/$1.json" 2>/dev/null || true)"
    [ -n "$j" ] || return 0
    ts="$(json_get "$j" ts)"; case "$ts" in ''|*[!0-9]*) ts=0 ;; esac
    [ "$(json_get "$j" app_up)" = false ] && healthy=0
    # a node in the middle of a deploy is not down, its app is restarting
    case "$(json_get "$j" deploying)" in ''|0|*[!0-9]*) ;; *) healthy=1 ;; esac
    [ "$(json_get "$j" on_demand)" = true ] && [ "$(json_get "$j" db_up)" = false ] && healthy=0
    printf '%s %s %s' "$(( $(now_epoch) - ts ))" "$healthy" "$(json_get "$j" role)"
}

# primary_node: name of the node whose heartbeat says role primary
primary_node() {
    local k
    for k in $("$MC" ls "$R2/nodes/" 2>/dev/null | awk '{print $NF}' | grep '\.json$'); do
        [ "$(json_get "$("$MC" cat "$R2/nodes/$k" 2>/dev/null || true)" role)" = primary ] && { printf '%s' "${k%.json}"; return 0; }
    done
    return 0
}

case "$MODE" in
    status) tunnel_on && echo on || echo off; exit 0 ;;
    stop)   set_tunnel off "stopped by hand (make prod-stop)"; exit 0 ;;
esac

find_mc || { log_every nomc 600 "mc (MinIO client) not found: changing nothing"; exit 0; }

# Record the local app's health for the heartbeat: false only after two failed checks in a row.
# During a deploy of this node the app is meant to be down: keep the last value.
if [ "$(deploying_since)" != 0 ]; then
    log_every deploying 300 "a deploy is running here: not counting the app as down"
elif app_answers; then state_set app_fail 0; state_set app_up true
else
    fails="$(state_get app_fail)"; fails=$(( ${fails:-0} + 1 )); state_set app_fail "$fails"
    [ "$fails" -ge 2 ] && state_set app_up false
fi
my_app_up="$(state_get app_up)"

# An on-demand node (the Mac) is off while its database is not running.
if [ "$ON_DEMAND" = true ] && ! db_container_running; then
    set_tunnel off "this on-demand node's stack is not running"; exit 0
fi

"$MC" cat "$R2/primary.json" >/dev/null 2>&1 || { log_every r2 600 "cannot read the lease from R2: changing nothing"; exit 0; }
lease_load
holder="$LEASE_HOLDER"
FAILOVER_SEC="$(db_env TUNNEL_FAILOVER_SEC 180)"

# 1. This node is live.
if [ "$LEASE_FRESH" = 1 ] && [ "$holder" = "$NODE_NAME" ]; then
    # A standby that took over hands back once the primary is alive and healthy again:
    # connector off first (no new writes), then a last backup, then release the lease.
    # The primary's sync job then loads that backup and takes the lease (nothing lost).
    if [ "$NODE_ROLE" = standby ] && [ "$ON_DEMAND" != true ]; then
        prim="$(primary_node)"
        if [ -n "$prim" ] && [ "$prim" != "$NODE_NAME" ]; then
            read -r p_age p_ok _ <<< "$(heartbeat_of "$prim")"
            if [ -n "${p_age:-}" ] && [ "$p_age" -lt "$FAILOVER_SEC" ] && [ "${p_ok:-0}" = 1 ]; then
                if [ "$DRY" = 1 ]; then log "would hand back to '$prim': connector off, last backup, release the lease"; exit 0; fi
                set_tunnel off "primary '$prim' is back: handing back"
                if "$APP_ROOT/docker/backup-db.sh" --release; then
                    event_emit tunnel_handback info "$NODE_NAME handed live traffic back to $prim (last backup taken, lease released)"
                else
                    log "the last backup before handing back failed: turning the connector back on and keeping the lease"
                    set_tunnel on "hand-back aborted: last backup failed"
                fi
                exit 0
            fi
        fi
    fi
    set_tunnel on "this node holds the lease"
    exit 0
fi

# 2. Another node holds the lease.
if [ -n "$holder" ] && [ "$holder" != "$NODE_NAME" ]; then
    read -r h_age h_ok _ <<< "$(heartbeat_of "$holder")"
    # Alive and healthy is what counts, not the lease age: a holder whose backups
    # fail still serves, and taking over from it would split the data in two.
    if [ -n "${h_age:-}" ] && [ "$h_age" -lt "$FAILOVER_SEC" ] && [ "${h_ok:-0}" = 1 ]; then
        [ "$LEASE_FRESH" = 1 ] || log_every stalelease 600 "'$holder' is alive but its lease is stale (its backups may be failing): not taking over"
        set_tunnel off "'$holder' is live"
        exit 0
    fi
    # The holder looks down (no heartbeat, or its app does not answer). An on-demand
    # node never fails over by itself: you start it with make prod.
    [ "$ON_DEMAND" = true ] && { set_tunnel off "'$holder' holds the lease"; exit 0; }
    why="'$holder' looks down (heartbeat ${h_age:-missing}s old, healthy=${h_ok:-?})"
else
    # 3. Nobody holds the lease: the primary goes live once its data is the newest
    # (after a hand-back its sync job first loads the standby's last backup and takes
    # the lease); a standby waits for it.
    if [ "$NODE_ROLE" = primary ]; then
        if [ "$(json_get "$(r2_latest_info)" sha256)" = "$(state_get last_sha)" ]; then
            set_tunnel on "nobody holds the lease (this is the primary)"
        else
            log_every catchup 300 "nobody holds the lease and newer data is in R2: waiting for the sync job to catch up first"
        fi
        exit 0
    fi
    prim="$(primary_node)"
    read -r p_age p_ok _ <<< "$( [ -n "$prim" ] && heartbeat_of "$prim" || true)"
    if [ -n "${p_age:-}" ] && [ "$p_age" -lt "$FAILOVER_SEC" ] && [ "${p_ok:-0}" = 1 ]; then
        set_tunnel off "nobody holds the lease; primary '$prim' is alive and will take it"; exit 0
    fi
    why="nobody holds the lease and the primary looks down"
fi

# Fail over: only a current, healthy node may serve.
info="$(r2_latest_info)"
if [ "$(json_get "$info" sha256)" != "$(state_get last_sha)" ]; then
    log_every stale 300 "$why, but this node's data is not the newest backup: NOT taking traffic (run make restore here)"
    event_emit_every failover_stale 1800 failover_refused error "$NODE_NAME cannot take over: $why, and its data is behind the newest backup"
    set_tunnel off "not current"; exit 0
fi
if [ "$my_app_up" != true ]; then
    log_every appdown 300 "$why, but this node's app does not answer: NOT taking traffic"
    set_tunnel off "local app down"; exit 0
fi
if [ "$DRY" = 1 ]; then log "would fail over: $why -> claim the lease, connector on"; exit 0; fi
log "failing over: $why"
if "$APP_ROOT/docker/backup-db.sh" --force; then
    event_emit failover warn "$NODE_NAME took over live traffic: $why"
    set_tunnel on "failover: $why"
else
    log "could not claim the lease: not taking traffic"
fi
