#!/bin/bash
# dev.sh - Native (no Docker) local development on the Mac.
#
# Docker is for prod, and for testing Docker changes via
# ./deploy-with-options.sh -e dev. Everyday work runs here: brew MySQL,
# php artisan serve, queue worker and Vite, all on the host.
#
# Usage:
#   ./dev.sh setup        one-time: php@8.4, MySQL, DB (imports Docker dev data), deps
#   ./dev.sh [up]         start MySQL + app (:8095) + queue + Vite (:5177); Ctrl-C stops
#   ./dev.sh status       show whether MySQL, PHP, queue and Vite are up
#   ./dev.sh stop         stop the MySQL service (frees RAM)
#   ./dev.sh artisan ...  run artisan against the native DB (also: composer, npm)
#   ./dev.sh e2e [...]    Playwright on a fresh copy of the DB (needs ./dev.sh up running)

set -e

cd "$(dirname "$0")"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}$*${NC}"; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }
die()  { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

MYSQL_FORMULA="mysql@8.0"
PHP_FORMULA="php@8.4"
BREW_PREFIX="$(brew --prefix 2>/dev/null || echo /opt/homebrew)"
APP_PORT_NATIVE="${APP_PORT:-8095}"

# Read a key from .env without sourcing it (values may contain shell chars).
env_value() {
    grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'
}

DB_NAME="$(env_value DB_DATABASE)"; DB_NAME="${DB_NAME:-duka}"
DB_USER="$(env_value DB_USERNAME)"; DB_USER="${DB_USER:-dukauser}"
DB_PASS="$(env_value DB_PASSWORD)"

# Env for every host-side php/node process. Exported (not written to .env) so
# the Docker stack keeps using .env untouched.
native_env() {
    export PATH="$BREW_PREFIX/opt/$PHP_FORMULA/bin:$BREW_PREFIX/opt/$PHP_FORMULA/sbin:$BREW_PREFIX/opt/$MYSQL_FORMULA/bin:$PATH"
    export DB_HOST=127.0.0.1
    export DB_PORT=3306
    export DUKA_NATIVE=1
    # bootstrap/cache/*.php is written by the container (DB_HOST=duka-db).
    # Point the host at nonexistent cache files; do NOT delete the real ones.
    export APP_CONFIG_CACHE=/tmp/duka-native-no-config.php
    export APP_ROUTES_CACHE=/tmp/duka-native-no-routes.php
    export APP_EVENTS_CACHE=/tmp/duka-native-no-events.php
}

# Duka's own MySQL 8.0 instance. brew's shared datadir (/opt/homebrew/var/mysql)
# was upgraded by MySQL 9.x and 8.0 cannot open it, so don't use brew services.
DUKA_MYSQL_DIR="$HOME/.duka-mysql"
DUKA_MYSQL_SOCK="$DUKA_MYSQL_DIR/mysql.sock"
MYSQL_BIN="$BREW_PREFIX/opt/$MYSQL_FORMULA/bin"

mysql_root() { "$MYSQL_BIN/mysql" -uroot --socket="$DUKA_MYSQL_SOCK" "$@"; }

ensure_mysql() {
    brew list --formula "$MYSQL_FORMULA" >/dev/null 2>&1 \
        || die "$MYSQL_FORMULA not installed. Run ./dev.sh setup"
    mysql_root -e 'SELECT 1' >/dev/null 2>&1 && return 0

    mkdir -p "$DUKA_MYSQL_DIR"
    cat > "$DUKA_MYSQL_DIR/my.cnf" <<CNF
[mysqld]
datadir=$DUKA_MYSQL_DIR/data
socket=$DUKA_MYSQL_SOCK
pid-file=$DUKA_MYSQL_DIR/mysql.pid
log-error=$DUKA_MYSQL_DIR/mysql.err
port=3306
bind-address=127.0.0.1
mysqlx=OFF
performance_schema=OFF
innodb_buffer_pool_size=256M
skip-log-bin
CNF
    if [ ! -d "$DUKA_MYSQL_DIR/data/mysql" ]; then
        info "Initializing MySQL data dir at $DUKA_MYSQL_DIR/data"
        "$MYSQL_BIN/mysqld" --defaults-file="$DUKA_MYSQL_DIR/my.cnf" --initialize-insecure >/dev/null 2>&1 \
            || die "mysqld --initialize failed; see $DUKA_MYSQL_DIR/mysql.err"
    fi
    "$MYSQL_BIN/mysqld" --defaults-file="$DUKA_MYSQL_DIR/my.cnf" --daemonize >/dev/null 2>&1 || true
    local i
    for i in $(seq 1 30); do
        mysql_root -e 'SELECT 1' >/dev/null 2>&1 && return 0
        sleep 1
    done
    die "Native MySQL did not start. Is something else on port 3306? See $DUKA_MYSQL_DIR/mysql.err"
}

docker_dev_running() {
    docker ps --format '{{.Names}}' 2>/dev/null | grep -qE '^duka-dev-(app|db)$'
}

cmd_setup() {
    [ -f .env ] || die ".env not found"
    [ -n "$DB_PASS" ] || die "DB_PASSWORD missing in .env"

    info "1/6 Homebrew packages"
    brew list --formula "$PHP_FORMULA" >/dev/null 2>&1 || brew install "$PHP_FORMULA"
    brew list --formula "$MYSQL_FORMULA" >/dev/null 2>&1 || brew install "$MYSQL_FORMULA"
    ok "$PHP_FORMULA, $MYSQL_FORMULA installed"

    info "2/6 MySQL service"
    ensure_mysql
    ok "MySQL running on 3306 (data: $DUKA_MYSQL_DIR/data)"

    info "3/6 Database and user"
    local have_tables
    have_tables=$(mysql_root -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}'")
    mysql_root -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASS}';
        GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%';
        FLUSH PRIVILEGES;"
    ok "Database ${DB_NAME}, user ${DB_USER}"

    native_env

    info "4/6 Data"
    if [ "${have_tables:-0}" -gt 0 ]; then
        warn "Native DB already has ${have_tables} tables; skipping import"
    elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^duka-dev-db$'; then
        info "Importing dev data from duka-dev-db..."
        docker exec -e MYSQL_PWD="$DB_PASS" duka-dev-db \
            mysqldump -uroot --single-transaction --routines --triggers "$DB_NAME" \
            | mysql_root "$DB_NAME"
        ok "Imported from Docker dev DB"
    else
        warn "duka-dev-db is not running; start it to import data. Falling back to migrate --seed."
        php artisan migrate --seed --force
    fi

    info "5/6 Dependencies"
    composer install
    # node_modules may hold linux binaries from the container (rollup-linux-*).
    if ls node_modules/@rollup 2>/dev/null | grep -q linux; then
        warn "Removing container-built node_modules"
        rm -rf node_modules
    fi
    npm ci --no-audit --no-fund
    npx --no-install playwright install chromium
    ok "composer + npm + Playwright Chromium installed"

    info "6/6 Storage link"
    php artisan storage:link >/dev/null 2>&1 || true
    ok "Setup done. Run ./dev.sh"
}

# ── Pretty step runner ───────────────────────────────────────────────────────
UP_LOG="/tmp/duka-native.log"          # services' output (followed after start-up)
STEP_LOG="/tmp/duka-native-steps.log"  # output of each start-up step
UP_TOTAL=7
UP_DONE=0
CPID=""
TTY=0; [ -t 1 ] && TTY=1

C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'; C_CYAN=$'\033[38;5;80m'; C_GREEN=$'\033[38;5;78m'
C_RED=$'\033[38;5;203m'; C_YEL=$'\033[38;5;221m'; C_VIO=$'\033[38;5;141m'; C_OFF=$'\033[0m'

# [██████░░░░░░░░░░] 3/7
bar() {
    local done=$1 total=$2 width=22 i out=""
    local fill=$(( done * width / total ))
    for ((i = 0; i < width; i++)); do
        if [ $i -lt $fill ]; then out+="█"; else out+="░"; fi
    done
    printf '%s%s%s %s%d/%d%s' "$C_CYAN" "$out" "$C_OFF" "$C_DIM" "$done" "$total" "$C_OFF"
}

cursor_show() { [ $TTY -eq 1 ] && printf '\033[?25h'; return 0; }

# run_step "Label" command args...   (command runs in background, spinner while it works)
run_step() {
    local label="$1"; shift
    local frames=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏) i=0 rc=0 t0=$SECONDS
    : > "$STEP_LOG"
    "$@" >> "$STEP_LOG" 2>&1 &
    local pid=$!
    if [ $TTY -eq 1 ]; then
        printf '\033[?25l'
        while kill -0 "$pid" 2>/dev/null; do
            printf '\r\033[K  %s%s%s %s  %s' "$C_VIO" "${frames[i % 10]}" "$C_OFF" "$label" "$(bar $UP_DONE $UP_TOTAL)"
            i=$((i + 1)); sleep 0.08
        done
        printf '\033[?25h'
    fi
    wait "$pid" || rc=$?
    local took=$((SECONDS - t0))
    if [ $rc -eq 0 ]; then
        UP_DONE=$((UP_DONE + 1))
        [ $TTY -eq 1 ] && printf '\r\033[K'
        printf '  %s✔%s %-38s %s%ss%s\n' "$C_GREEN" "$C_OFF" "$label" "$C_DIM" "$took" "$C_OFF"
    else
        [ $TTY -eq 1 ] && printf '\r\033[K'
        printf '  %s✘ %s%s\n' "$C_RED" "$label" "$C_OFF"
        echo -e "${C_DIM}$(grep -v opcache "$STEP_LOG" | tail -15 | sed 's/^/      /')${C_OFF}"
        stop_previous quiet
        exit 1
    fi
}

# ── Step bodies ──────────────────────────────────────────────────────────────
check_docker_free() {
    docker_dev_running || return 0
    echo "Docker dev is running (same ports 8095/5177). Stop it first:"
    echo "  docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.dev.yml stop"
    return 1
}

# Kill whatever a previous ./dev.sh left running (never touches MySQL or Docker).
stop_previous() {
    local p pid comm
    pkill -f "concurrently -k -n app,queue,vite" 2>/dev/null || true
    pkill -f "artisan queue:(listen|work)" 2>/dev/null || true
    for p in "$APP_PORT_NATIVE" 5177; do
        for pid in $(lsof -ti "tcp:$p" -sTCP:LISTEN 2>/dev/null); do
            comm="$(ps -o comm= -p "$pid" 2>/dev/null || true)"
            case "$comm" in
                *docker*|*vpnkit*|*colima*|*lima*|*qemu*|*vz*)
                    echo "Port $p is held by Docker ($comm); stop that first."; return 1 ;;
            esac
            kill "$pid" 2>/dev/null || true
        done
    done
    local i
    for i in $(seq 1 25); do
        lsof -ti "tcp:$APP_PORT_NATIVE" -sTCP:LISTEN "tcp:5177" >/dev/null 2>&1 || return 0
        sleep 0.2
    done
    # Still alive after 5s: force.
    for p in "$APP_PORT_NATIVE" 5177; do
        lsof -ti "tcp:$p" -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true
    done
    return 0
}

stop_previous_step() {
    if pgrep -f "artisan serve|node_modules/.bin/vite|queue:listen" >/dev/null 2>&1 \
        || lsof -ti "tcp:$APP_PORT_NATIVE" -sTCP:LISTEN >/dev/null 2>&1 \
        || lsof -ti tcp:5177 -sTCP:LISTEN >/dev/null 2>&1; then
        echo "Found a previous session, restarting it"
    fi
    stop_previous
}

start_services() {
    : > "$UP_LOG"
    # PHP_CLI_SERVER_WORKERS lets artisan serve handle parallel requests.
    PHP_CLI_SERVER_WORKERS=4 nohup npx --no-install concurrently -k \
        -n app,queue,vite -c "#93c5fd,#c4b5fd,#fdba74" \
        "php artisan serve --host=0.0.0.0 --port=${APP_PORT_NATIVE}" \
        "php artisan queue:listen --tries=1 --timeout=0" \
        "npm run dev" >> "$UP_LOG" 2>&1 < /dev/null &
    echo $! > /tmp/duka-native.pid
}

wait_port() {
    local port=$1 i
    for i in $(seq 1 120); do
        curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$port/" && return 0
        pgrep -f "concurrently -k -n app,queue,vite" >/dev/null 2>&1 || { echo "Services exited early:"; tail -20 "$UP_LOG"; return 1; }
        sleep 0.5
    done
    echo "Nothing answered on :$port after 60s"; tail -20 "$UP_LOG"; return 1
}

cmd_up() {
    [ -d node_modules ] && [ -d vendor ] || die "Dependencies missing. Run ./dev.sh setup"
    local domain; domain="$(env_value APP_DOMAIN)"
    native_env

    trap 'cursor_show' EXIT
    echo
    echo -e "  ${C_BOLD}${C_CYAN}Duka${C_OFF} ${C_DIM}· native dev · php $(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;') · node $(node -v)${C_OFF}"
    echo -e "  ${C_DIM}────────────────────────────────────────────────────${C_OFF}"

    run_step "Checking Docker dev is stopped"      check_docker_free
    run_step "Stopping previous session"           stop_previous_step
    run_step "Starting MySQL 8.0"                  ensure_mysql
    run_step "Migrating database"                  php artisan migrate --force
    run_step "Starting app · queue · vite"         start_services
    run_step "App ready on :${APP_PORT_NATIVE}"    wait_port "$APP_PORT_NATIVE"
    run_step "Vite ready on :5177"                 wait_port 5177

    echo -e "  ${C_DIM}────────────────────────────────────────────────────${C_OFF}"
    echo -e "  $(bar $UP_DONE $UP_TOTAL)  ${C_GREEN}${C_BOLD}All systems up${C_OFF}"
    echo
    echo -e "  ${C_BOLD}App ${C_OFF} ${C_CYAN}http://${domain}:${APP_PORT_NATIVE}${C_OFF}"
    echo -e "  ${C_BOLD}Vite${C_OFF} ${C_CYAN}http://localhost:5177${C_OFF}"
    echo -e "  ${C_DIM}Logs below · Ctrl-C stops app, queue, vite (MySQL stays; ./dev.sh stop to stop it)${C_OFF}"
    echo

    trap 'echo; echo -e "  ${C_YEL}Stopping app, queue, vite...${C_OFF}"; stop_previous >/dev/null 2>&1; cursor_show; echo -e "  ${C_GREEN}✔ Stopped${C_OFF}"; exit 0' INT TERM
    tail -n 0 -f "$UP_LOG"
}

cmd_stop() {
    "$MYSQL_BIN/mysqladmin" -uroot --socket="$DUKA_MYSQL_SOCK" shutdown 2>/dev/null || true
    ok "MySQL stopped"
}

cmd_status() {
    check() { # name, pgrep pattern
        if pgrep -f "$2" >/dev/null 2>&1; then echo -e "${GREEN}● up  ${NC} $1"; else echo -e "${RED}○ down${NC} $1"; fi
    }
    check "MySQL         (mysqld, :3306)"        "duka-mysql/my.cnf"
    check "PHP web       (artisan serve, :8095)" "artisan serve"
    check "PHP queue     (queue:listen)"         "queue:listen"
    check "Vite          (hot reload, :5177)"    "node_modules/.bin/vite"
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q .; then
        echo -e "${YELLOW}Docker containers running:${NC} $(docker ps --format '{{.Names}}' | tr '\n' ' ')"
    fi
}

case "${1:-up}" in
    status)           cmd_status ;;
    setup)            cmd_setup ;;
    up)               cmd_up ;;
    stop)             cmd_stop ;;
    artisan)          shift; native_env; exec php artisan "$@" ;;
    composer)         shift; native_env; exec composer "$@" ;;
    npm)              shift; native_env; exec npm "$@" ;;
    e2e)              shift; cmd_e2e "$@" ;;
    -h|--help|help)   sed -n '2,14p' "$0" ;;
    *)                die "Unknown command: $1 (try ./dev.sh help)" ;;
esac
