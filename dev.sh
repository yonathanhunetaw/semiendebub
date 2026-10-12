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

cmd_up() {
    if docker_dev_running; then
        die "Docker dev is running (same ports 8095/5177). Stop it first:
  docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.dev.yml down"
    fi
    [ -d node_modules ] && [ -d vendor ] || die "Dependencies missing. Run ./dev.sh setup"

    ensure_mysql
    native_env

    info "Migrating..."
    php artisan migrate --force

    info "App  http://$(env_value APP_DOMAIN):${APP_PORT_NATIVE}   Vite :5177   (Ctrl-C to stop)"
    # PHP_CLI_SERVER_WORKERS lets artisan serve handle parallel requests.
    PHP_CLI_SERVER_WORKERS=4 exec npx --no-install concurrently -k \
        -n app,queue,vite -c "#93c5fd,#c4b5fd,#fdba74" \
        "php artisan serve --host=0.0.0.0 --port=${APP_PORT_NATIVE}" \
        "php artisan queue:listen --tries=1 --timeout=0" \
        "npm run dev"
}

# Playwright against a throwaway copy of the dev DB: duka → duka_e2e, a second
# app server on :8096 for it, and the test users/items from e2e:prepare.
# Vite comes from the running ./dev.sh, so that must be up.
E2E_DB="${DB_NAME}_e2e"
E2E_PORT="${E2E_PORT:-8096}"

cmd_e2e() {
    [ -f public/hot ] || die "Vite is not running. Start ./dev.sh in another terminal first."
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

cmd_stop() {
    "$MYSQL_BIN/mysqladmin" -uroot --socket="$DUKA_MYSQL_SOCK" shutdown 2>/dev/null || true
    ok "MySQL stopped"
}

case "${1:-up}" in
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
