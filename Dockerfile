FROM php:8.4-apache

WORKDIR /var/www/html

# 1. System deps
RUN apt-get update && apt-get install -y \
    git unzip zip curl \
    default-mysql-client \
    libpng-dev libonig-dev libxml2-dev libzip-dev \
    libicu-dev libbz2-dev libgmp-dev libldap2-dev \
    libpq-dev libxslt1-dev libtidy-dev \
    libsodium-dev libsnmp-dev snmp \
    libfreetype6-dev libjpeg62-turbo-dev \
    pkg-config \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 2. PHP extensions
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
    bcmath bz2 calendar exif gd gettext gmp intl \
    mysqli opcache pcntl pdo_mysql pdo_pgsql \
    shmop snmp soap sockets sodium tidy xsl zip

# 3. Install Node (ONLY for build step)
RUN curl -fsSL https://deb.nodesource.com/setup_23.x | bash - \
    && apt-get install -y nodejs \
    && apt-get install -y npm

# 4. Apache config (KEEP THIS 🔥)
RUN a2enmod rewrite headers ssl \
    && sed -i 's|/var/www/html|/var/www/html/public|g' /etc/apache2/sites-available/000-default.conf

# SSL vhost setup
RUN sed -i 's|/var/www/html|/var/www/html/public|g' \
       /etc/apache2/sites-available/default-ssl.conf \
 && sed -i 's|/etc/ssl/certs/ssl-cert-snakeoil.pem|/etc/apache2/ssl/fullchain.pem|g' \
       /etc/apache2/sites-available/default-ssl.conf \
 && sed -i 's|/etc/ssl/private/ssl-cert-snakeoil.key|/etc/apache2/ssl/privkey.pem|g' \
       /etc/apache2/sites-available/default-ssl.conf

# 5. Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# 6. Copy only manifests first (cache optimization)
COPY composer.json composer.lock package*.json ./

RUN git config --global --add safe.directory /var/www/html

# 7. Install dependencies
# Install PHP deps
RUN composer install --no-interaction --prefer-dist --no-scripts

# Install Node deps
RUN npm install

# 8. Copy full project
COPY . .

# 9. Build frontend (🔥 THIS FIXES YOUR ERROR)
RUN npm run build

# 10. Permissions
RUN mkdir -p storage bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

# 11. SSL entrypoint
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["docker-entrypoint.sh"]
