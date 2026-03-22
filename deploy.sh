#!/bin/bash
set -e

APP_ENV=$(grep APP_ENV .env | cut -d '=' -f2)
echo "Detected environment: $APP_ENV"

# Select compose files
if [ "$APP_ENV" = "production" ]; then
    COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"
else
    COMPOSE_FILES="-f docker-compose.yml -f docker-compose.dev.yml"
fi

echo "🚀 Starting Smart Deployment..."

DOCKER_CHANGES=$(git diff --name-only HEAD@{1} HEAD | grep -E 'Dockerfile|docker-compose' || true)

if [ -n "$DOCKER_CHANGES" ]; then
    echo "⚙️ Docker changes detected. Running Deep Build..."
    sudo docker compose $COMPOSE_FILES down --remove-orphans
    sudo docker compose $COMPOSE_FILES build --no-cache
    sudo docker compose $COMPOSE_FILES up -d
else
    echo "🏃 No Docker changes. Fast-tracking deployment..."
    sudo docker compose $COMPOSE_FILES up -d
fi

# Wait for MySQL
echo "Waiting for MySQL..."
until sudo docker compose $COMPOSE_FILES exec db mysqladmin ping -h "localhost" --silent; do
    echo -n "."; sleep 1
done
echo "✅ MySQL is ready!"

# Composer
echo "📦 Installing PHP dependencies..."
if [ "$APP_ENV" = "production" ]; then
    sudo docker compose $COMPOSE_FILES exec app composer install --no-dev --optimize-autoloader --no-interaction
else
    sudo docker compose $COMPOSE_FILES exec app composer install --optimize-autoloader --no-interaction
fi

# Frontend
echo "⚙️ Handling frontend..."

if [ "$APP_ENV" = "production" ]; then
    echo "🚀 Production build..."

    sudo docker compose $COMPOSE_FILES exec app sh -c "
    if [ ! -f node_modules/.bin/vite ]; then
        npm ci --no-audit --no-fund
    fi
    "

    sudo docker compose $COMPOSE_FILES exec app npm run build

else
    echo "🧪 Dev mode..."

    sudo docker compose $COMPOSE_FILES exec app pkill -f vite || true
    sudo docker compose $COMPOSE_FILES exec -d app npm run dev -- --host
fi

# Database
echo "🛠️ Running migrations..."
if [ "$APP_ENV" = "production" ]; then
    sudo docker compose $COMPOSE_FILES exec app php artisan migrate:fresh --force
else
    sudo docker compose $COMPOSE_FILES exec app php artisan migrate:fresh --seed
fi

# Storage
sudo docker compose $COMPOSE_FILES exec app php artisan storage:link --force

# Optimize
sudo docker compose $COMPOSE_FILES exec app php artisan optimize:clear
sudo docker compose $COMPOSE_FILES exec app php artisan optimize

echo "✅ Deployment complete!"
