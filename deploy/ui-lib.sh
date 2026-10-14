#!/bin/bash
# ui-lib.sh - terminal layout for deploy.sh (sourced; no side effects on load).
#   - width-aware step headers and board rules (re-measured on every call, so a
#     resized window or a phone terminal just works)
#   - a progress bar pinned to the bottom line of a real terminal (scroll
#     region). It is skipped when output is not a terminal (cron, the standby's
#     auto-deploy log) or when DUKA_NO_BAR=1.
# Uses the globals STEPS, STEP_STATUS and DEPLOY_START_TIME from deploy.sh.

# term_size -> "rows cols". Asks the controlling terminal directly: inside $( )
# stdout is a pipe, so `[ -t 1 ]` alone would wrongly say "not a terminal".
# With no terminal at all (cron, the standby's auto-deploy log) it falls back to
# $LINES/$COLUMNS, then 24x80.
term_size() {
    local s="" r c
    if [ -t 0 ] || [ -t 1 ] || [ -t 2 ]; then
        s="$(stty size </dev/tty 2>/dev/null || true)"
        if [ -z "$s" ]; then s="$(tput lines 2>/dev/null || true) $(tput cols 2>/dev/null || true)"; fi
    fi
    r="${s%% *}"; c="${s##* }"
    case "$r" in ''|*[!0-9]*) r="${LINES:-24}" ;; esac
    case "$c" in ''|*[!0-9]*) c="${COLUMNS:-80}" ;; esac
    case "$r" in ''|*[!0-9]*) r=24 ;; esac
    case "$c" in ''|*[!0-9]*) c=80 ;; esac
    [ "$r" -lt 1 ] && r=24
    [ "$c" -lt 30 ] && c=30
    [ "$c" -gt 200 ] && c=200
    echo "$r $c"
}
term_cols() { local s; s="$(term_size)"; echo "${s##* }"; }
term_rows() { local s; s="$(term_size)"; echo "${s%% *}"; }

# repeat_char <char> <n>
repeat_char() {
    local out="" i
    for (( i = 0; i < $2; i++ )); do out+="$1"; done
    printf '%s' "$out"
}

# fmt_time <seconds> -> "1m 07s"
fmt_time() { printf '%dm %02ds' $(( $1 / 60 )) $(( $1 % 60 )); }

# ui_header <text> <elapsed seconds>: "┌─ text ───────── [1m 07s elapsed]" filling the width.
# Narrow terminals drop "elapsed", then the time, then shorten the text.
ui_header() {
    local text="$1" secs="$2" width right used fill
    width=$(( $(term_cols) - 1 ))
    right=" [$(fmt_time "$secs") elapsed]"
    used=$(( 3 + ${#text} + 1 + ${#right} ))
    if [ "$used" -gt "$width" ]; then right=" $(fmt_time "$secs")"; used=$(( 3 + ${#text} + 1 + ${#right} )); fi
    if [ "$used" -gt "$width" ]; then right=""; used=$(( 3 + ${#text} + 1 )); fi
    if [ "$used" -gt "$width" ]; then text="${text:0:$(( width - 7 ))}.."; used=$(( 3 + ${#text} + 1 )); fi
    fill=$(( width - used )); [ "$fill" -lt 1 ] && fill=1
    printf '┌─ %s %s%s' "$text" "$(repeat_char '─' "$fill")" "$right"
}

# ui_rule: a full-width ═══ line
ui_rule() { repeat_char '═' $(( $(term_cols) - 1 )); }

# ui_center <text>: text centred in the current width
ui_center() {
    local width pad
    width=$(( $(term_cols) - 1 ))
    pad=$(( (width - ${#1}) / 2 )); [ "$pad" -lt 0 ] && pad=0
    printf '%*s%s' "$pad" '' "$1"
}

ui_done_count() {
    local i n=0
    for i in "${!STEPS[@]}"; do [ "${STEP_STATUS[$i]:-}" = success ] && n=$(( n + 1 )); done
    echo "$n"
}

ui_current_name() {
    local i
    for i in "${!STEPS[@]}"; do
        [ "${STEP_STATUS[$i]:-}" = in_progress ] && { echo "${STEPS[$i]}"; return; }
    done
    echo "${STEPS[$(( ${#STEPS[@]} - 1 ))]}"
}

# ui_bar_line: "[█████░░░░░] Frontend Assets Build 5/10 1m 07s", fitted to the width
ui_bar_line() {
    local width total ndone suffix name barw filled secs
    width=$(( $(term_cols) - 1 ))
    total=${#STEPS[@]}
    ndone="$(ui_done_count)"
    secs=$(( $(date +%s) - DEPLOY_START_TIME ))
    suffix=" ${ndone}/${total} $(fmt_time "$secs")"
    name=" $(ui_current_name)"
    [ "$width" -lt 50 ] && name=""
    barw=$(( width - ${#suffix} - ${#name} - 2 ))
    if [ "$barw" -lt 10 ]; then
        name=""; barw=$(( width - ${#suffix} - 2 ))
    fi
    [ "$barw" -lt 5 ] && barw=5
    filled=$(( ndone * barw / total ))
    printf '[%s%s]%s%s' "$(repeat_char '█' "$filled")" "$(repeat_char '░' "$(( barw - filled ))")" "$name" "$suffix"
}

# --- bar pinned to the last terminal row -------------------------------------
UI_BAR_ACTIVE=0
UI_BAR_ROWS=0
UI_BAR_LAST_SEC=-1

ui_bar_init() {
    [ "${DUKA_NO_BAR:-0}" = 1 ] && return 0
    [ -t 1 ] || return 0
    case "${TERM:-dumb}" in dumb|"") return 0 ;; esac
    UI_BAR_ROWS="$(term_rows)"
    [ "$UI_BAR_ROWS" -ge 10 ] || return 0
    # scroll region = everything above the last row; make room first so nothing is overwritten
    printf '\n\e[1;%dr\e[%d;1H' $(( UI_BAR_ROWS - 1 )) $(( UI_BAR_ROWS - 1 ))
    UI_BAR_ACTIVE=1
    trap ui_bar_resize WINCH
    ui_bar_draw force
}

# ui_bar_draw [force]: redraw at most once a second
ui_bar_draw() {
    [ "$UI_BAR_ACTIVE" = 1 ] || return 0
    if [ "${1:-}" != force ] && [ "$SECONDS" = "$UI_BAR_LAST_SEC" ]; then return 0; fi
    UI_BAR_LAST_SEC=$SECONDS
    printf '\e7\e[%d;1H\e[2K\e[1;36m%s\e[0m\e8' "$UI_BAR_ROWS" "$(ui_bar_line)"
}

ui_bar_resize() {
    [ "$UI_BAR_ACTIVE" = 1 ] || return 0
    UI_BAR_ROWS="$(term_rows)"
    printf '\e[1;%dr' $(( UI_BAR_ROWS - 1 ))
    ui_bar_draw force
}

# ui_bar_teardown: give the whole screen back (always call on exit)
ui_bar_teardown() {
    [ "$UI_BAR_ACTIVE" = 1 ] || return 0
    UI_BAR_ACTIVE=0
    trap - WINCH
    printf '\e[1;%dr\e[%d;1H\e[2K' "$(term_rows)" "$(term_rows)"
}
