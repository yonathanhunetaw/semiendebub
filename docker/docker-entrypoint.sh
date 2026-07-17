#!/bin/sh
set -e

# =============================================================================
# 🔧 FIX LARAVEL DIRECTORIES & PERMISSIONS BEFORE RUNNING ANY COMMANDS
# =============================================================================
echo "🔧 Fixing Laravel storage directories and permissions..."

mkdir -p \
  /var/www/html/storage/logs \
  /var/www/html/storage/framework/cache/data \
  /var/www/html/storage/framework/sessions \
  /var/www/html/storage/framework/views \
  /var/www/html/bootstrap/cache

chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache
chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache

echo "✅ Permissions OK"

# =============================================================================
# ⏳ SERVICE READINESS
# =============================================================================
echo "⏳ Waiting for MySQL..."

until mysqladmin ping \
    -h "$DB_HOST" \
    -u "$DB_USERNAME" \
    -p"$DB_PASSWORD" \
    --skip-ssl \
    --silent; do
    echo "Waiting for MySQL..."
    sleep 2
done

echo "✅ MySQL is ready!"

# =============================================================================
# 🖼️ PROXY CONFIGURATION 
# =============================================================================
echo "🖼️ Configuring image proxy to MinIO..."

cat > /etc/apache2/conf-available/proxy-images.conf << 'PROXYEOF'
ProxyPass /images/ http://duka-minio:9000/duka-images/
ProxyPassReverse /images/ http://duka-minio:9000/duka-images/

<Location /images/>
    Header set Access-Control-Allow-Origin "*"
    Header set Access-Control-Allow-Methods "GET, HEAD, OPTIONS"
    Header set Cache-Control "public, max-age=3600"
    
    <IfModule mod_rewrite.c>
        RewriteEngine Off
    </IfModule>
</Location>

<Directory /images/>
    Options -Indexes
</Directory>
PROXYEOF

a2enmod proxy proxy_http headers
a2enconf proxy-images

echo "✅ Image proxy configured to duka-minio"

# =============================================================================
# 🌐 APACHE SITE VHOSTS & VIRTUAL HOST CONFIG
# =============================================================================
BASE_DOMAIN="${APP_SYSTEM_DOMAIN:-duka.local}"

sed -i "/ServerName/d" /etc/apache2/sites-available/000-default.conf
sed -i "/ServerAlias \\*\\./d" /etc/apache2/sites-available/000-default.conf
sed -i "/RewriteEngine On/d" /etc/apache2/sites-available/000-default.conf
sed -i "/RewriteCond %{HTTPS} !=on/d" /etc/apache2/sites-available/000-default.conf
sed -i "/RewriteRule \\^ https:\\/\\/%{HTTP_HOST}%{REQUEST_URI} \\[L,R=301\\]/d" /etc/apache2/sites-available/000-default.conf
sed -i "/DocumentRoot/a ServerName ${BASE_DOMAIN}" /etc/apache2/sites-available/000-default.conf
sed -i "/ServerName/a ServerAlias *.${BASE_DOMAIN}" /etc/apache2/sites-available/000-default.conf

sed -i "/ServerName/d" /etc/apache2/sites-available/default-ssl.conf
sed -i "/ServerAlias \\*\\./d" /etc/apache2/sites-available/default-ssl.conf
sed -i "/DocumentRoot/a ServerName ${BASE_DOMAIN}" /etc/apache2/sites-available/default-ssl.conf
sed -i "/ServerName/a ServerAlias *.${BASE_DOMAIN}" /etc/apache2/sites-available/default-ssl.conf

# =============================================================================
# 🚀 LARAVEL CONFIGURATION & MIGRATIONS
# =============================================================================
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

# =============================================================================
# 🔒 SSL SETUP
# =============================================================================
if [ "$APP_ENV" = "production" ] \
   && [ -f /etc/apache2/ssl/fullchain.pem ] \
   && [ -f /etc/apache2/ssl/privkey.pem ]; then
    echo "🔒 Enabling Apache SSL"
    cat <<'EOF' >> /etc/apache2/sites-available/000-default.conf
RewriteEngine On
RewriteCond %{HTTPS} !=on
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
EOF
    a2enmod ssl
    a2ensite default-ssl
else
    echo "🌐 Running HTTP only"
fi

# =============================================================================
# 🚀 HAND CONTROL OFF TO APACHE
# =============================================================================
# "$@" evaluates to whatever command Docker passes (which is "apache2-foreground" via CMD)
exec "$@"