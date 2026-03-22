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

exec_in_app() {
    compose exec -T app "$@"
}

echo "Detected environment: $APP_ENV"
echo "RESET_DB=$RESET_DB"
echo "Starting deployment..."

echo "Building app image..."
compose build app

echo "Starting containers..."
compose up -d

echo "Waiting for MySQL..."
until compose exec -T db mysqladmin ping -h "localhost" --silent >/dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo
echo "MySQL is ready."

echo "Installing PHP dependencies..."
if [ "$APP_ENV" = "production" ]; then
    exec_in_app composer install --no-dev --optimize-autoloader --no-interaction
else
    exec_in_app composer install --optimize-autoloader --no-interaction
fi

echo "Handling frontend..."
if [ "$APP_ENV" = "production" ]; then
    exec_in_app rm -f public/hot
    exec_in_app npm ci --no-audit --no-fund
    exec_in_app npm run build
else
    exec_in_app rm -rf public/build
    exec_in_app npm ci --no-audit --no-fund
    exec_in_app sh -lc 'pkill -f "vite --host" || true'
    compose exec -d app npm run dev -- --host 0.0.0.0
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
