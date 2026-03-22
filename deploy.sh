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

if [ -z "${APP_ENV:-}" ]; then
    echo "APP_ENV is not set in .env"
    exit 1
fi

RESET_DB="${RESET_DB:-0}"
FORCE_BUILD="${FORCE_BUILD:-0}"

DOCKER_FILES=(
    Dockerfile
    Dockerfile.dev
    docker-compose.yml
    docker-compose.dev.yml
    docker-compose.prod.yml
    docker-entrypoint.sh
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
echo "Starting deployment..."

docker_changes=""
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

if [ "$APP_ENV" = "production" ]; then
    echo "Production deploy: rebuilding app image to include latest application code..."
    compose build --no-cache app
    echo "Cleaning Docker build cache..."
    docker_raw builder prune -af >/dev/null 2>&1 || true
    docker_raw image prune -f >/dev/null 2>&1 || true
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
    exec_in_app php artisan migrate --force
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
