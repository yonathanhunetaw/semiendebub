#!/bin/bash
set -euo pipefail

APP_ENV=$(
    awk -F= '
        $1 == "APP_ENV" {
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2)
            print $2
            exit
        }
    ' .env
)

env_value() {
    local key="$1"

    awk -F= -v target="$key" '
        $1 == target {
            value=$0
            sub(/^[^=]*=/, "", value)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
            print value
            exit
        }
    ' .env
}

if [ -z "${APP_ENV:-}" ]; then
    echo "APP_ENV is not set in .env"
    exit 1
fi

RESET_DB="${RESET_DB:-$(env_value RESET_DB)}"
FORCE_BUILD="${FORCE_BUILD:-$(env_value FORCE_BUILD)}"
ENABLE_OBSERVABILITY="${ENABLE_OBSERVABILITY:-$(env_value ENABLE_OBSERVABILITY)}"

RESET_DB="${RESET_DB:-0}"
FORCE_BUILD="${FORCE_BUILD:-0}"
ENABLE_OBSERVABILITY="${ENABLE_OBSERVABILITY:-0}"

DOCKER_FILES=(
    Dockerfile
    Dockerfile.dev
    docker-compose.yml
    docker-compose.dev.yml
    docker-compose.prod.yml
    docker-compose.observability.yml
    docker-entrypoint.sh
)

APP_BUILD_FILES=(
    app
    bootstrap
    config
    public
    resources
    routes
    artisan
    composer.json
    composer.lock
    package.json
    package-lock.json
    vite.config.js
    tsconfig.json
    jsconfig.json
    tailwind.config.js
    postcss.config.js
)

NODE_FILES=(
    package.json
    package-lock.json
)

if [ "$APP_ENV" = "production" ]; then
    COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.prod.yml)
else
    COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.dev.yml)
fi

if [ "$ENABLE_OBSERVABILITY" = "1" ]; then
    if [ ! -f docker-compose.observability.yml ]; then
        echo "ENABLE_OBSERVABILITY=1 but docker-compose.observability.yml was not found."
        exit 1
    fi

    COMPOSE_FILES+=(-f docker-compose.observability.yml)
fi

if docker info >/dev/null 2>&1; then
    DOCKER_CMD=(docker)
else
    DOCKER_CMD=(sudo docker)
fi

compose() {
    "${DOCKER_CMD[@]}" compose "${COMPOSE_FILES[@]}" "$@"
}

docker_raw() {
    "${DOCKER_CMD[@]}" "$@"
}

exec_in_app() {
    compose exec -T app "$@"
}

echo "Detected environment: $APP_ENV"
echo "RESET_DB=$RESET_DB"
echo "FORCE_BUILD=$FORCE_BUILD"
echo "ENABLE_OBSERVABILITY=$ENABLE_OBSERVABILITY"
echo "Starting deployment..."

if [ "$ENABLE_OBSERVABILITY" = "1" ]; then
    echo "Ensuring Loki Docker logging driver is installed..."
    if ! docker_raw plugin inspect loki >/dev/null 2>&1; then
        docker_raw plugin install grafana/loki-docker-driver:latest --alias loki --grant-all-permissions
    fi
fi

docker_changes=""
app_build_changes=""
node_changes=""

if [ "$FORCE_BUILD" = "1" ]; then
    docker_changes="forced"
elif git rev-parse --verify HEAD >/dev/null 2>&1; then
    tracked_changes=$(git diff --name-only HEAD -- "${DOCKER_FILES[@]}" || true)
    untracked_changes=$(git ls-files --others --exclude-standard -- "${DOCKER_FILES[@]}" || true)
    docker_changes="${tracked_changes}${untracked_changes}"
else
    docker_changes=$(find "${DOCKER_FILES[@]}" -maxdepth 0 -type f 2>/dev/null || true)
fi

if [ "$FORCE_BUILD" = "1" ]; then
    app_build_changes="forced"
elif git rev-parse --verify HEAD >/dev/null 2>&1; then
    tracked_app_changes=$(git diff --name-only HEAD -- "${APP_BUILD_FILES[@]}" || true)
    untracked_app_changes=$(git ls-files --others --exclude-standard -- "${APP_BUILD_FILES[@]}" || true)
    app_build_changes="${tracked_app_changes}${untracked_app_changes}"
else
    app_build_changes=$(find "${APP_BUILD_FILES[@]}" -maxdepth 0 2>/dev/null || true)
fi

if [ "$APP_ENV" = "production" ] && { [ -n "$app_build_changes" ] || [ -n "$docker_changes" ]; }; then
    echo "Production code/config changes detected. Rebuilding app image..."
    compose build --no-cache app
    echo "Cleaning Docker build cache..."
    docker_raw builder prune -af >/dev/null 2>&1 || true
    docker_raw image prune -f >/dev/null 2>&1 || true
elif [ "$APP_ENV" = "production" ]; then
    echo "No production code/config changes detected. Skipping image rebuild."
elif [ -n "$docker_changes" ]; then
    echo "Docker-related changes detected. Rebuilding app image..."
    compose build --no-cache app
    echo "Cleaning Docker build cache..."
    docker_raw builder prune -af >/dev/null 2>&1 || true
    docker_raw image prune -f >/dev/null 2>&1 || true
else
    echo "No Docker-related changes detected. Skipping image rebuild."
fi

if git rev-parse --verify HEAD >/dev/null 2>&1; then
    tracked_node_changes=$(git diff --name-only HEAD -- "${NODE_FILES[@]}" || true)
    untracked_node_changes=$(git ls-files --others --exclude-standard -- "${NODE_FILES[@]}" || true)
    node_changes="${tracked_node_changes}${untracked_node_changes}"
else
    node_changes=$(find "${NODE_FILES[@]}" -maxdepth 0 -type f 2>/dev/null || true)
fi

echo "Starting containers..."
compose up -d

if [ "$ENABLE_OBSERVABILITY" = "1" ]; then
    echo "Starting observability services..."
    compose up -d lgtm glitchtip-postgres glitchtip-redis glitchtip-web
fi

if [ "$APP_ENV" = "production" ]; then
    echo "Ensuring Apache SSL site is enabled..."
    compose exec -T app bash -lc 'a2enmod ssl >/dev/null 2>&1 || true && a2ensite default-ssl >/dev/null 2>&1 || true && apachectl -k graceful'
fi

echo "Waiting for MySQL..."
until compose exec -T db mysqladmin ping -h "localhost" --silent >/dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo
echo "MySQL is ready."

echo "Configuring git safe directory..."
exec_in_app git config --global --add safe.directory /var/www/html || true

echo "Installing PHP dependencies..."
if [ "$APP_ENV" = "production" ]; then
    exec_in_app composer install --no-dev --optimize-autoloader --no-interaction
else
    exec_in_app composer install --optimize-autoloader --no-interaction
fi

echo "Handling frontend..."
if [ "$APP_ENV" = "production" ]; then
    echo "Building production assets..."
    exec_in_app rm -f public/hot
    if [ -n "$node_changes" ] || ! exec_in_app test -x node_modules/.bin/vite; then
        echo "Installing Node dependencies..."
        exec_in_app npm ci --no-audit --no-fund
    fi
    exec_in_app npm run build
else
    echo "Starting Vite dev server..."
    exec_in_app rm -rf public/build
    if [ -n "$node_changes" ] || ! exec_in_app test -x node_modules/.bin/vite; then
        echo "Installing Node dependencies..."
        exec_in_app npm ci --no-audit --no-fund
    fi
    if exec_in_app sh -lc 'curl -sf http://127.0.0.1:5177/@vite/client >/dev/null 2>&1'; then
        echo "Vite is already running."
    else
        echo "Launching Vite..."
        compose exec -d app sh -lc 'npm run dev -- --host 0.0.0.0 >/tmp/vite.log 2>&1'
    fi

    echo "Waiting for Vite..."
    if ! exec_in_app sh -lc '
        for i in $(seq 1 60); do
            if curl -sf http://127.0.0.1:5177/@vite/client >/dev/null 2>&1; then
                exit 0
            fi
            printf "."
            sleep 1
        done
        exit 1
    '; then
        echo
        echo "Vite failed to become ready within 60s."
        echo "Last Vite log output:"
        exec_in_app sh -lc 'tail -n 100 /tmp/vite.log 2>/dev/null || echo "No /tmp/vite.log found."'
        exit 1
    fi
    echo
    echo "Vite is ready."
fi

echo "Running database setup..."
if [ "$RESET_DB" = "1" ]; then
    if [ "$APP_ENV" = "production" ]; then
        echo "RESET_DB=1 is not allowed in production."
        exit 1
    fi

    exec_in_app php artisan migrate:fresh --seed --force
else
    exec_in_app php artisan migrate:fresh --seed --force
fi

echo "Refreshing Laravel caches..."
exec_in_app php artisan optimize:clear
exec_in_app php artisan storage:link --force

if [ "$APP_ENV" = "production" ]; then
    exec_in_app php artisan optimize
else
    exec_in_app php artisan config:clear
    exec_in_app php artisan route:clear
    exec_in_app php artisan view:clear
fi

echo "Deployment complete."
