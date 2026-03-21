#!/bin/bash
set -e

APP_ENV=$(sudo docker compose exec app printenv APP_ENV | tr -d '\r')
echo "Detected environment: $APP_ENV"

echo "🚀 Starting Smart Deployment..."

# 1️⃣ Fetch changes without merging yet
#git pull origin main
#
#docker compose build --no-cache
#docker compose up -d
#
#docker compose exec app composer install --no-dev --optimize-autoloader --no-interaction
#docker compose exec app npm ci --no-audit --no-fund
#docker compose exec app npm run build
#
#docker compose exec app php artisan migrate --force
#docker compose exec app php artisan optimize

# 2️⃣ Check for Docker-related changes
# This compares your local code to the incoming Git changes
 DOCKER_CHANGES=$(git diff --name-only HEAD@{1} HEAD | grep -E 'Dockerfile|docker-compose' || true)

# 3️⃣ Pull the latest code
# git merge origin main

if [ -n "$DOCKER_CHANGES" ]; then
    echo "⚙️ Docker changes detected. Running Deep Build..."
    sudo docker compose down --remove-orphans
    sudo docker compose build --no-cache
    sudo docker compose up -d
else
    echo "🏃 No Docker changes. Fast-tracking deployment..."
    sudo docker compose up -d
fi

# 4️⃣ Wait for MySQL
echo "Waiting for MySQL..."
until sudo docker compose exec db mysqladmin ping -h "localhost" --silent; do
    echo -n "."; sleep 1
done

# 3️⃣ Wait for MySQL to be ready
echo "Waiting for MySQL to be ready..."
until sudo docker compose exec db mysqladmin ping -h "localhost" --silent; do
    echo -n "."; sleep 1
done
echo "MySQL is ready!"

# 4️⃣ Compile frontend assets
echo "Compiling frontend assets..."
echo "📦 Installing PHP dependencies..."

if [ "$APP_ENV" = "production" ]; then
    echo "🚀 Production dependencies (no-dev)..."
    sudo docker compose exec app composer install --no-dev --optimize-autoloader --no-interaction
else
    echo "🧪 Dev dependencies..."
    sudo docker compose exec app composer install --optimize-autoloader --no-interaction
fi

# Only build frontend if package.json changed
echo "⚙️ Handling frontend based on environment..."

if [ "$APP_ENV" = "production" ]; then
    echo "🚀 Production mode: building assets..."

    sudo docker compose exec app sh -c "
    if [ ! -f node_modules/.bin/vite ]; then
        npm ci --no-audit --no-fund
    fi
    "

    sudo docker compose exec app npm run build
else
    echo "🧪 Dev mode: starting Vite dev server..."

    sudo docker compose exec -d app npm run dev -- --host
fi

# 5️⃣ Run Laravel migrations and seed
echo "Running migrations..."
sudo docker compose exec app php artisan migrate:fresh --force

echo "Seeding database..."
sudo docker compose exec app php artisan db:seed --force

# 6️⃣ Link storage
echo "Linking storage..."
sudo docker compose exec app php artisan storage:link --force

# 7️⃣ Clear and optimize cache
echo "Optimizing Laravel performance..."
sudo docker compose exec app php artisan optimize:clear
sudo docker compose exec app php artisan optimize

echo "Deployment complete! Site is live."
