#!/bin/bash
set -e

echo "🔧 Fixing Laravel permissions..."

# Ensure ALL required Laravel directories exist
mkdir -p \
  /var/www/html/storage/logs \
  /var/www/html/storage/framework/cache \
  /var/www/html/storage/framework/sessions \
  /var/www/html/storage/framework/views \
  /var/www/html/bootstrap/cache

# Fix ownership & permissions
chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache
chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache

echo "✅ Permissions OK"

echo "Waiting for MySQL at $DB_HOST..."

MAX_RETRIES=30
COUNT=0

until mysqladmin ping \
    -h "$DB_HOST" \
    -u "$DB_USERNAME" \
    -p"$DB_PASSWORD" \
    --ssl=0 \
    --protocol=TCP \
    --silent; do

    COUNT=$((COUNT+1))
    if [ $COUNT -ge $MAX_RETRIES ]; then
        echo "❌ MySQL is not ready after $MAX_RETRIES attempts, exiting."
        exit 1
    fi
    echo "Waiting for MySQL at $DB_HOST..."
    sleep 2
done

echo "✅ MySQL is ready!"

# --- NEW: Laravel Optimizations ---
if [ "$APP_ENV" = "production" ]; then
    echo "🚀 Optimizing for Production..."
    echo "🛠️ Running migrations and clearing caches..."
    php artisan migrate --force
    php artisan config:cache
    php artisan route:cache
    php artisan view:cache
else
    echo "🛠️ Clearing caches for Development..."
    echo "🛠️ Running migrations and clearing caches for Development..."
    php artisan migrate --force
    php artisan cache:clear
    php artisan config:clear
fi

# Enable SSL only if in production AND certs exist
if [ "$APP_ENV" = "production" ] \
   && [ -f /etc/apache2/ssl/fullchain.pem ] \
   && [ -f /etc/apache2/ssl/privkey.pem ]; then
    echo "🔒 Enabling Apache SSL"
    a2enmod ssl
    a2ensite default-ssl
else
    echo "🌐 Running HTTP only"
fi

# 🔥 START VITE ONLY IN DEV
if [ "$APP_ENV" != "production" ]; then
    echo "🧪 Starting Vite dev server inside container..."
    npm install
    npm run dev -- --host &
fi

# Start Apache
exec apache2-foreground
