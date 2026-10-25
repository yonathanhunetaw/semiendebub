#!/bin/bash
# dev.sh - Native (no Docker) local development on the Mac.
#
# Docker is for prod, and for testing Docker changes via
# `make deploy-dev`. Everyday work runs here: brew MySQL,
# php artisan serve, queue worker and Vite, all on the host.
#
# Usage:
#   ./deploy/dev.sh setup        one-time: php@8.4, MySQL, DB (imports Docker dev data), deps
#   ./deploy/dev.sh [up]         start MySQL + app (:8095) + queue + Vite (:5177); Ctrl-C stops
#   ./deploy/dev.sh status       show whether MySQL, PHP, queue and Vite are up
#   ./deploy/dev.sh stop         stop the MySQL service (frees RAM)
#   ./deploy/dev.sh artisan ...  run artisan against the native DB (also: composer, npm)
#   ./deploy/dev.sh e2e [...]    Playwright on a fresh copy of the DB (needs ./deploy/dev.sh up running)
#   ./deploy/dev.sh pull-prod    replace the dev DB with prod's newest R2 backup (safety dump first)
#   ./deploy/dev.sh compare      how dev differs from prod: code, migrations, settings, versions
#   ./deploy/dev.sh mysql        a mysql shell on the dev DB (also: gzip -dc dump.sql.gz | ./deploy/dev.sh mysql)

set -e

cd "$(dirname "$0")/.."

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
        || die "$MYSQL_FORMULA not installed. Run ./deploy/dev.sh setup"
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
    ok "Setup done. Run ./deploy/dev.sh"
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

# Kill whatever a previous ./deploy/dev.sh left running (never touches MySQL or Docker).
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
        kill -0 "$(cat /tmp/duka-native.pid 2>/dev/null)" 2>/dev/null || { echo "Services exited early:"; tail -20 "$UP_LOG"; return 1; }
        sleep 0.5
    done
    echo "Nothing answered on :$port after 60s"; tail -20 "$UP_LOG"; return 1
}

cmd_up() {
    [ -d node_modules ] && [ -d vendor ] || die "Dependencies missing. Run ./deploy/dev.sh setup"
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
    echo -e "  ${C_DIM}Logs below · Ctrl-C stops app, queue, vite (MySQL stays; ./deploy/dev.sh stop to stop it)${C_OFF}"
    echo

    trap 'echo; echo -e "  ${C_YEL}Stopping app, queue, vite...${C_OFF}"; stop_previous >/dev/null 2>&1; cursor_show; echo -e "  ${C_GREEN}✔ Stopped${C_OFF}"; exit 0' INT TERM
    tail -n 0 -f "$UP_LOG"
}

# Playwright against a throwaway copy of the dev DB: duka → duka_e2e, a second
# app server on :8096 for it, and the test users/items from e2e:prepare.
# Vite comes from the running ./deploy/dev.sh, so that must be up.
E2E_DB="${DB_NAME}_e2e"
E2E_PORT="${E2E_PORT:-8096}"

cmd_e2e() {
    [ -f public/hot ] || die "Vite is not running. Start ./deploy/dev.sh in another terminal first."
    ensure_mysql
    native_env

    info "Copying ${DB_NAME} → ${E2E_DB}"
    mysql_root -e "DROP DATABASE IF EXISTS \`${E2E_DB}\`;
        CREATE DATABASE \`${E2E_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        GRANT ALL PRIVILEGES ON \`${E2E_DB}\`.* TO '${DB_USER}'@'%';"
    "$MYSQL_BIN/mysqldump" -uroot --socket="$DUKA_MYSQL_SOCK" --single-transaction --routines --triggers "$DB_NAME" \
        | mysql_root "$E2E_DB"

    # The test server: its own DB and URL, jobs run inline, and nothing
    # leaves the machine (Discord login/visit pings, mail, Sentry); no debugbar
    # covering the phone UI.
    export DB_DATABASE="$E2E_DB"
    export APP_URL="http://$(env_value APP_DOMAIN):${E2E_PORT}"
    export QUEUE_CONNECTION=sync MAIL_MAILER=log SENTRY_LARAVEL_DSN= DEBUGBAR_ENABLED=false
    export DISCORD_VISIT_WEBHOOK_URL= DISCORD_DAILY_VISIT_WEBHOOK_URL= DISCORD_LOGIN_WEBHOOK_URL=
    # Pictures (the r2 disk) go to storage/app/public/r2-local, never prod's bucket.
    export R2_LOCAL=true

    php artisan migrate --force >/dev/null
    mkdir -p e2e/.fixture
    php artisan e2e:prepare > e2e/.fixture/fixture.json || { cat e2e/.fixture/fixture.json; die "e2e:prepare failed"; }
    ok "Test users and items ready (e2e/.fixture/fixture.json)"

    # artisan serve forks php -S, so stop whatever holds the port.
    trap 'lsof -ti "tcp:$E2E_PORT" -sTCP:LISTEN | xargs kill 2>/dev/null || true' EXIT
    PHP_CLI_SERVER_WORKERS=4 php artisan serve --host=0.0.0.0 --port="$E2E_PORT" > e2e/.fixture/server.log 2>&1 &
    local i
    for i in $(seq 1 30); do
        curl -s -o /dev/null "$APP_URL/login" && break
        sleep 1
    done

    export E2E_PORT
    npx --no-install playwright test "$@"
}

# Prod's R2 helpers (deploy/db-lib.sh), read-only here: this never writes the lease,
# heartbeats or events. R2 settings come from .env.production on this Mac.
prod_r2() {
    APP_ROOT="$PWD"
    # shellcheck source=db-lib.sh
    . deploy/db-lib.sh
    export DUKA_ENV_FILE="$PWD/.env.production"
    db_init
    find_mc || die "mc (MinIO client) not found: brew install minio/stable/mc"
}

# Load prod's newest backup into the native dev database (a safety dump of dev first).
cmd_pull_prod() {
    [ "$(env_value APP_ENV)" != production ] || die ".env says APP_ENV=production: refusing to treat this as dev"
    [ -f .env.production ] || die ".env.production not found (its R2 settings say where the backups are)"
    ensure_mysql
    native_env
    prod_r2

    local info sha tmp stamp safety
    info="$(r2_latest_info)"
    sha="$(json_get "$info" sha256)"
    [ -n "$sha" ] || die "No backup found in R2 (latest.json is missing or unreadable)"
    info "Newest prod backup: $(json_get "$info" file), by $(json_get "$info" node) at $(json_get "$info" time)"

    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    mkdir -p "$HOME/.duka-backup"
    safety="$HOME/.duka-backup/dev-pre-pull_${stamp}.sql.gz"
    info "1/5 Safety dump of the dev database → $safety"
    ( set -o pipefail; "$MYSQL_BIN/mysqldump" -uroot --socket="$DUKA_MYSQL_SOCK" --single-transaction --routines --triggers "$DB_NAME" | gzip > "$safety" ) \
        || die "Safety dump failed: nothing was changed"

    info "2/5 Downloading and checking the backup"
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' RETURN
    local rc=0
    r2_fetch_latest "$tmp/latest.sql.gz" "$sha" || rc=$?
    [ "$rc" -eq 0 ] || die "Download failed$([ "$rc" -eq 2 ] && echo ': the checksum differs, an upload is probably running. Try again in a minute')"

    info "3/5 Replacing the dev database"
    local tables
    tables="$(mysql_root -N -B -e "SET SESSION group_concat_max_len=1000000; SELECT GROUP_CONCAT(CONCAT(CHAR(96),table_name,CHAR(96))) FROM information_schema.tables WHERE table_schema='${DB_NAME}' AND table_type='BASE TABLE'")"
    if [ -n "$tables" ] && [ "$tables" != NULL ]; then
        mysql_root "$DB_NAME" -e "SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS $tables; SET FOREIGN_KEY_CHECKS=1;"
    fi
    ( set -o pipefail; gzip -dc "$tmp/latest.sql.gz" | mysql_root "$DB_NAME" ) \
        || die "Import failed. Put dev back with: gzip -dc $safety | ./deploy/dev.sh mysql"

    info "4/5 Making it safe for dev"
    # Prod's queued jobs would run again from the dev queue (mails, webhooks, notifications).
    mysql_root "$DB_NAME" -e "DELETE FROM jobs;" 2>/dev/null || true
    php artisan migrate --force
    php artisan optimize:clear >/dev/null

    info "5/5 What is in dev now"
    mysql_root -t "$DB_NAME" -e "SELECT 'users' AS what, COUNT(*) AS \`rows\` FROM users
        UNION ALL SELECT 'stores', COUNT(*) FROM stores
        UNION ALL SELECT 'items', COUNT(*) FROM items
        UNION ALL SELECT 'item_stocks', COUNT(*) FROM item_stocks" 2>/dev/null || true
    ok "Dev now has prod's data as of $(json_get "$info" time). Log in with a prod account."
    echo "   Dev's old data: $safety"
}

# Show how this Mac's dev differs from prod: code, migrations, settings, versions.
# Prints names and same/different only, never a value.
cmd_compare() {
    native_env
    prod_r2
    local deployed head
    deployed="$(json_get "$(deploy_marker_read)" commit)"
    head="$(git rev-parse HEAD)"

    info "Code"
    if [ -z "$deployed" ]; then warn "Prod has not published a deployed commit"
    elif [ "$head" = "$deployed" ]; then ok "Same commit as prod (${head:0:7})"
    elif git merge-base --is-ancestor "$deployed" "$head" 2>/dev/null; then
        warn "Dev is $(git rev-list --count "$deployed..$head") commit(s) ahead of prod (${deployed:0:7} → ${head:0:7}): deploy to bring prod up"
    else warn "Dev ${head:0:7} and prod ${deployed:0:7} differ: git fetch && git log --oneline ${deployed:0:7}..HEAD"
    fi
    [ -z "$(git status --porcelain)" ] || warn "Uncommitted changes: $(git status --porcelain | wc -l | tr -d ' ') file(s)"

    info "Database"
    ensure_mysql
    local pending
    pending="$(php artisan migrate:status 2>/dev/null | grep -c 'Pending' || true)"
    if [ "${pending:-0}" -eq 0 ]; then ok "No pending migrations in dev"; else warn "$pending migration(s) pending in dev: ./deploy/dev.sh artisan migrate"; fi
    local mine latest
    latest="$(json_get "$(r2_latest_info)" time)"
    mine="$(ls -t "$HOME"/.duka-backup/dev-pre-pull_*.sql.gz 2>/dev/null | head -1)"
    echo "   Newest prod backup: ${latest:-none}. Last time dev loaded prod: $( [ -n "$mine" ] && date -r "$(stat -f %m "$mine")" '+%F %T' || echo never) (make dev-from-prod)"

    info "Settings (.env vs .env.production)"
    # Meant to differ: the environment itself, the node/tunnel/Cloudflare keys, Docker limits, dev tools.
    local expected=' APP_ENV APP_DEBUG APP_URL APP_DOMAIN APP_SYSTEM_DOMAIN APP_PORT ASSET_URL SESSION_DOMAIN SESSION_COOKIE SESSION_SECURE_COOKIE SANCTUM_STATEFUL_DOMAINS LOG_LEVEL DEBUGBAR_ENABLED DEBUGBAR_EDITOR AWS_URL R2_URL VITE_DEV_SERVER_URL COMPOSE_PROJECT_NAME DB_HOSTNAME MYSQL_EXPOSE_PORT MINIO_PORT MINIO_CONSOLE_PORT SENTRY_LARAVEL_DSN '
    keys() { grep -E '^[A-Z_][A-Z0-9_]*=' "$1" | cut -d= -f1 | sort -u; }
    val() { grep -m1 -E "^$2=" "$1" | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'; }
    local k only_dev only_prod diff=""
    only_dev="$(comm -23 <(keys .env) <(keys .env.production) | grep -vE '^(APP|DB)_(CPU|MEM)_|^DEBUGBAR_|^GLITCHTIP_|^DISCORD_(LOGIN|NOTIFY)' | tr '\n' ' ')"
    only_prod="$(comm -13 <(keys .env) <(keys .env.production) | grep -vE '^(NODE_|TUNNEL_|BACKUP_|CLOUDFLARE_|SYNC_DB|MYSQL_SERVER_ID|AUTO_DEPLOY|DEPLOY_GRACE|ASSET_URL|GOOGLE_ANALYTICS_ID)' | tr '\n' ' ')"
    for k in $(comm -12 <(keys .env) <(keys .env.production)); do
        case "$expected" in *" $k "*) continue ;; esac
        [ "$(val .env "$k")" = "$(val .env.production "$k")" ] || diff="$diff $k"
    done
    [ -z "$only_dev" ] && ok "No setting is only in dev" || warn "Only in dev: $only_dev"
    [ -z "$only_prod" ] && ok "No setting is only in prod" || warn "Only in prod: $only_prod"
    [ -z "$diff" ] && ok "All shared settings match (apart from the expected ones)" || warn "Different values:$diff"

    info "Versions (dev on this Mac vs the prod image)"
    echo "   PHP    dev $(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')    prod $(sed -nE 's/^FROM php:([0-9.]+).*/\1/p' docker/Dockerfile | head -1)"
    echo "   Node   dev $(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')      prod $(sed -nE 's/.*setup_([0-9]+)\.x.*/\1/p' docker/Dockerfile | head -1)"
    echo "   MySQL  dev $("$MYSQL_BIN/mysql" --version | sed -E 's/.*Ver ([0-9]+\.[0-9]+).*/\1/')   prod $(sed -nE 's/.*image: mysql:([0-9.]+).*/\1/p' docker/docker-compose.yml | head -1)"
    echo
    echo "This Mac's .env.production may differ from the servers' copies: run  make env-keys  on each and compare."
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
    pull-prod)        cmd_pull_prod ;;
    compare)          cmd_compare ;;
    mysql)            shift; mysql_root "$DB_NAME" "$@" ;;
    -h|--help|help)   sed -n '2,17p' "$0" ;;
    *)                die "Unknown command: $1 (try ./deploy/dev.sh help)" ;;
esac
