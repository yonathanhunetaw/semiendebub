#!/bin/bash
set -e

APP_ENV=$(sudo docker compose exec app printenv APP_ENV | tr -d '\r')
echo "Detected environment: $APP_ENV"

echo "🚀 Starting Smart Deployment..."

DOCKER_CHANGES=$(git diff --name-only HEAD@{1} HEAD | grep -E 'Dockerfile|docker-compose' || true)

if [ -n "$DOCKER_CHANGES" ]; then
    echo "⚙️ Docker changes detected. Running Deep Build..."
    sudo docker compose down --remove-orphans
    sudo docker compose build --no-cache
    sudo docker compose up -d
else
    echo "🏃 No Docker changes. Fast-tracking deployment..."
    sudo docker compose up -d
fi

# Wait for MySQL
echo "Waiting for MySQL..."
until sudo docker compose exec db mysqladmin ping -h "localhost" --silent; do
    echo -n "."; sleep 1
done
echo "✅ MySQL is ready!"

# Composer
echo "📦 Installing PHP dependencies..."
if [ "$APP_ENV" = "production" ]; then
    sudo docker compose exec app composer install --no-dev --optimize-autoloader --no-interaction
else
    sudo docker compose exec app composer install --optimize-autoloader --no-interaction
fi

# Frontend
echo "⚙️ Handling frontend..."

if [ "$APP_ENV" = "production" ]; then
    echo "🚀 Production build..."

    sudo docker compose exec app sh -c "
    if [ ! -d node_modules ]; then
        npm ci --no-audit --no-fund
    fi
    "

    sudo docker compose exec app npm run build

else
    echo "🧪 Dev mode..."

    sudo docker compose exec app pkill -f vite || true
    sudo docker compose exec -d app npm run dev -- --host
fi

# Database
echo "🛠️ Running migrations..."
if [ "$APP_ENV" = "production" ]; then
    sudo docker compose exec app php artisan migrate:fresh --force
else
    sudo docker compose exec app php artisan migrate:fresh --seed
fi

# Storage
sudo docker compose exec app php artisan storage:link --force

# Optimize
sudo docker compose exec app php artisan optimize:clear
sudo docker compose exec app php artisan optimize

echo "✅ Deployment complete!"
