#!/bin/bash
set -e

echo "🔧 Fixing Laravel permissions..."

mkdir -p \
  storage/logs \
  storage/framework/cache \
  storage/framework/sessions \
  storage/framework/views \
  bootstrap/cache

chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache

echo "✅ Permissions OK"

echo "⏳ Waiting for MySQL..."

until mysqladmin ping \
    -h "$DB_HOST" \
    -u "$DB_USERNAME" \
    -p"$DB_PASSWORD" \
    --silent; do
    echo "Waiting for MySQL..."
    sleep 2
done

echo "✅ MySQL is ready!"

BASE_DOMAIN="${APP_SYSTEM_DOMAIN:-duka.local}"

sed -i "/ServerName/d" /etc/apache2/sites-available/000-default.conf
sed -i "/ServerAlias \\*\\./d" /etc/apache2/sites-available/000-default.conf
sed -i "/DocumentRoot/a ServerName ${BASE_DOMAIN}" /etc/apache2/sites-available/000-default.conf
sed -i "/ServerName/a ServerAlias *.${BASE_DOMAIN}" /etc/apache2/sites-available/000-default.conf

# Laravel setup
if [ "$APP_ENV" = "production" ]; then
    echo "🚀 Production mode..."

    php artisan migrate --force
    php artisan config:cache
    php artisan route:cache
    php artisan view:cache
else
    echo "🧪 Development mode..."

    php artisan migrate --force
    php artisan cache:clear
    php artisan config:clear
fi

# SSL (production only)
if [ "$APP_ENV" = "production" ] \
   && [ -f /etc/apache2/ssl/fullchain.pem ] \
   && [ -f /etc/apache2/ssl/privkey.pem ]; then
    echo "🔒 Enabling Apache SSL"
    a2enmod ssl
    a2ensite default-ssl
else
    echo "🌐 Running HTTP only"
fi

exec apache2-foreground
