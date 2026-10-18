#!/bin/bash
# node-stats.sh - read-only snapshot of this node for the admin System page.
# Sourced by deploy/db-lib.sh (never run on its own). Every heartbeat calls
# node_stats_publish; it writes stats/<node>.json to the backup bucket at most
# every STATS_EVERY seconds (5 min: ~290 writes a day per node).
#
# What it may run is fixed here and read-only: docker ps / inspect / stats, df,
# /proc and sysctl. No environment variables, labels, commands, mounts or ports of
# any container are collected: only names, images, state, restarts, health, start
# time and CPU/memory use. Everything is best effort: a failure here must never
# break a backup, a sync or a deploy.

STATS_EVERY=300

# run_limited <seconds> <command...>: run it, kill it if it takes longer (a hung docker daemon)
run_limited() {
    local secs="$1" pid watcher rc; shift
    "$@" 2>/dev/null &
    pid=$!
    ( sleep "$secs"; kill "$pid" 2>/dev/null ) >/dev/null 2>&1 &
    watcher=$!
    wait "$pid" 2>/dev/null; rc=$?
    kill "$watcher" 2>/dev/null
    return "$rc"
}

# _json_rows: tab-separated lines on stdin -> [["a","b"],["c","d"]]
_json_rows() {
    awk -F '\t' 'BEGIN { printf "[" }
        NF { if (n++) printf ","; printf "["
             for (i = 1; i <= NF; i++) { g = $i; gsub(/\\/, "\\\\", g); gsub(/"/, "\\\"", g); gsub(/[\001-\037]/, " ", g); printf "%s\"%s\"", (i > 1 ? "," : ""), g }
             printf "]" }
        END { printf "]" }'
}

# _num <value> <default>: value if it is a plain number, else the default
_num() { case "$1" in ''|*[!0-9.]*) echo "$2" ;; *) echo "$1" ;; esac; }

# _host_json: {"cpus":4,"load":[..],"mem_total_kb":..,"mem_avail_kb":..,"uptime_s":..,"temp_c":..|null,"disks":[[mount,total_kb,used_kb],..]}
_host_json() {
    local os cpus load1 load5 load15 mt=0 ma=0 up=0 temp=null
    os="$(uname -s)"
    if [ "$os" = Linux ]; then
        cpus="$(nproc 2>/dev/null || echo 1)"
        read -r load1 load5 load15 _ < /proc/loadavg 2>/dev/null || { load1=0; load5=0; load15=0; }
        mt="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null)"; ma="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null)"
        up="$(awk '{print int($1)}' /proc/uptime 2>/dev/null)"
        # the hottest thermal zone, in whole degrees C (millidegrees in sysfs)
        local t; t="$(cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | sort -n | tail -n 1)"
        case "$t" in ''|*[!0-9]*) ;; *) temp=$(( t / 1000 )) ;; esac
    else
        cpus="$(sysctl -n hw.ncpu 2>/dev/null || echo 1)"
        read -r load1 load5 load15 <<< "$(sysctl -n vm.loadavg 2>/dev/null | tr -d '{}')"
        mt=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1024 ))
        local ps pages
        ps="$(sysctl -n hw.pagesize 2>/dev/null || echo 4096)"
        pages="$(vm_stat 2>/dev/null | awk '/Pages (free|inactive|speculative):/ {gsub(/\./, "", $NF); s += $NF} END {print s + 0}')"
        ma=$(( pages * ps / 1024 ))
        local boot; boot="$(sysctl -n kern.boottime 2>/dev/null | sed -n 's/^{ sec = \([0-9]*\),.*/\1/p')"
        [ -z "$boot" ] || up=$(( $(now_epoch) - boot ))
    fi
    local disks
    disks="$(df -Pk 2>/dev/null | awk 'NR > 1 && $1 ~ /^\/dev\// && $6 !~ /^\/(boot|snap|System\/Volumes\/(VM|Preboot|Update|xarts|iSCPreboot|Hardware)|private\/var\/vm|Volumes\/Recovery)/ && !seen[$1]++ { printf "%s\t%s\t%s\n", $6, $2, $3 }' | head -n 5 | _json_rows)"
    printf '{"cpus":%s,"load":[%s,%s,%s],"mem_total_kb":%s,"mem_avail_kb":%s,"uptime_s":%s,"temp_c":%s,"disks":%s}' \
        "$(_num "$cpus" 1)" "$(_num "$load1" 0)" "$(_num "$load5" 0)" "$(_num "$load15" 0)" "$(_num "$mt" 0)" "$(_num "$ma" 0)" "$(_num "$up" 0)" "$temp" "${disks:-[]}"
}

# node_stats_json: the whole snapshot as one JSON object
node_stats_json() {
    local docker="${DB_DOCKER:-docker}" ps="" insp="" st="" ok=false ids
    if ps="$(run_limited 15 "$docker" ps -a --format '{{.Names}}\t{{.Image}}\t{{.State}}\t{{.Status}}')" && [ -n "$ps" ]; then
        ok=true
        ids="$(run_limited 15 "$docker" ps -aq | head -n 60 | tr '\n' ' ')"
        # shellcheck disable=SC2086
        [ -z "$ids" ] || insp="$(run_limited 20 "$docker" inspect --format '{{.Name}}\t{{.RestartCount}}\t{{.State.StartedAt}}\t{{if .State.Health}}{{.State.Health.Status}}{{end}}' $ids | sed 's|^/||')"
        st="$(run_limited 25 "$docker" stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}')"
    fi
    printf '{"ts":%s,"node":"%s","docker_ok":%s,"ps":%s,"inspect":%s,"stats":%s,"host":%s}' \
        "$(now_epoch)" "$NODE_NAME" "$ok" \
        "$(printf '%s\n' "$ps" | head -n 60 | _json_rows)" "$(printf '%s\n' "$insp" | _json_rows)" "$(printf '%s\n' "$st" | _json_rows)" "$(_host_json)"
}

# node_stats_publish: throttled upload of stats/<node>.json. The slot is claimed here,
# the slow part (docker stats) runs detached so a heartbeat or a backup never waits for it.
node_stats_publish() {
    [ -n "${MC:-}" ] || return 0
    local now last; now="$(now_epoch)"; last="$(state_num stats_pub)"
    [ $(( now - last )) -ge "$STATS_EVERY" ] || return 0
    state_set stats_pub "$now"
    ( node_stats_json | "$MC" pipe "$R2/stats/${NODE_NAME}.json" >/dev/null 2>&1 || true ) </dev/null >/dev/null 2>&1 &
    return 0
}
