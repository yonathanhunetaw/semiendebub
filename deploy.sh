#!/bin/bash
set -euo pipefail

# =============================================================================
# 1. ABSOLUTE PATH RESOLUTION - Fixes script context sensitivity
# =============================================================================

# Get the directory where this script lives (docker/ subdirectory)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Determine PROJECT_ROOT (parent of docker/ if script is in docker/, otherwise script dir)
if [ "$(basename "$SCRIPT_DIR")" = "docker" ]; then
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
else
    PROJECT_ROOT="$SCRIPT_DIR"
fi

# CRITICAL: Absolute path to .env file
ENV_FILE="$PROJECT_ROOT/.env"

# Validate .env exists before proceeding
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found at: $ENV_FILE"
    echo "Please ensure $ENV_FILE exists before running this script."
    exit 1
fi

# Debug output (can be removed after testing)
echo "=== Path Resolution ==="
echo "Script directory: $SCRIPT_DIR"
echo "Project root: $PROJECT_ROOT"
echo "Environment file: $ENV_FILE"
echo "======================"

# =============================================================================
# 2. ENVIRONMENT VARIABLE LOADING - Single source of truth
# =============================================================================

# Load .env file into shell variables (for script use)
set -a  # automatically export all variables
source "$ENV_FILE"
set +a

# Function to extract values from .env (fallback if source fails)
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
    ' "$ENV_FILE"
}

# =============================================================================
# 3. DOCKER COMPOSE WRAPPER - Correct environment file handling
# =============================================================================

# Determine docker command (with/without sudo)
if docker info >/dev/null 2>&1; then
    DOCKER_CMD=(docker)
else
    DOCKER_CMD=(sudo docker)
fi

# Build compose files array based on environment
BASE_DIR="$PROJECT_ROOT"  # Dockerfiles are in project root for build context
COMPOSE_FILES=()

if [ "$APP_ENV" = "production" ]; then
    COMPOSE_FILES=(-f "$PROJECT_ROOT/docker/docker-compose.yml" -f "$PROJECT_ROOT/docker/docker-compose.prod.yml")
else
    COMPOSE_FILES=(-f "$PROJECT_ROOT/docker/docker-compose.yml" -f "$PROJECT_ROOT/docker/docker-compose.dev.yml" -f "$PROJECT_ROOT/docker/docker-compose.prod.yml")
fi

# Add observability if enabled
if [ "${ENABLE_OBSERVABILITY:-0}" = "1" ]; then
    if [ ! -f "$PROJECT_ROOT/docker/docker-compose.observability.yml" ]; then
        echo "Error: $PROJECT_ROOT/docker/docker-compose.observability.yml not found."
        exit 1
    fi
    COMPOSE_FILES+=(-f "$PROJECT_ROOT/docker/docker-compose.observability.yml")
fi

# SINGLE AUTHORITATIVE compose() FUNCTION
compose() {
    # CRITICAL: --env-file points to absolute path of root .env
    # Working directory is PROJECT_ROOT (where .env lives)
    (cd "$PROJECT_ROOT" && \
     "${DOCKER_CMD[@]}" compose \
        --env-file "$ENV_FILE" \
        "${COMPOSE_FILES[@]}" \
        "$@")
}

# Helper for raw docker commands
docker_raw() {
    "${DOCKER_CMD[@]}" "$@"
}

# Helper for executing commands in the app container
exec_in_app() {
    compose exec -T duka_app "$@"
}

exec_in_app_as_root() {
    compose exec -T -u root duka_app "$@"
}

# Helper for removing compose services with timeout
compose_rm_services() {
    if has_command timeout; then
        (cd "$PROJECT_ROOT" && timeout 20s "${DOCKER_CMD[@]}" compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" rm -fsv "$@")
    else
        (cd "$PROJECT_ROOT" && "${DOCKER_CMD[@]}" compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" rm -fsv "$@")
    fi
}

# =============================================================================
# 4. UTILITY FUNCTIONS
# =============================================================================

has_git_path_changes() {
    if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
        return 1
    fi

    if ! git diff --quiet HEAD -- "$@"; then
        return 0
    fi

    if git ls-files --others --exclude-standard -- "$@" | grep -q .; then
        return 0
    fi

    return 1
}

has_command() {
    command -v "$1" >/dev/null 2>&1
}

check_cloudflared() {
    command -v cloudflared >/dev/null 2>&1
}

install_node_dependencies() {
    exec_in_app npm ci --no-audit --no-fund
}

reset_node_dependencies() {
    echo "Resetting Node dependencies inside the app container..."
    exec_in_app_as_root sh -lc 'find node_modules -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true'
    install_node_dependencies
}

# =============================================================================
# 5. MAIN DEPLOYMENT LOGIC
# =============================================================================

echo "=== Deployment Configuration ==="
echo "Environment: $APP_ENV"
echo "RESET_DB: ${RESET_DB:-0}"
echo "FORCE_BUILD: ${FORCE_BUILD:-0}"
echo "ENABLE_OBSERVABILITY: ${ENABLE_OBSERVABILITY:-0}"
echo "================================"

# Validate required variables
if [ -z "${APP_ENV:-}" ]; then
    echo "ERROR: APP_ENV is not set in $ENV_FILE"
    exit 1
fi

# Set defaults
RESET_DB="${RESET_DB:-0}"
FORCE_BUILD="${FORCE_BUILD:-0}"
ENABLE_OBSERVABILITY="${ENABLE_OBSERVABILITY:-0}"

# Define file arrays for change detection
DOCKER_FILES=(
    "$PROJECT_ROOT/docker/Dockerfile"
    "$PROJECT_ROOT/docker/Dockerfile.dev"
    "$PROJECT_ROOT/docker/docker-compose.yml"
    "$PROJECT_ROOT/docker/docker-compose.dev.yml"
    "$PROJECT_ROOT/docker/docker-compose.prod.yml"
    "$PROJECT_ROOT/docker/docker-compose.observability.yml"
)

NODE_FILES=(
    "$PROJECT_ROOT/package.json"
    "$PROJECT_ROOT/package-lock.json"
)

# =============================================================================
# 6. DOCKER IMAGE BUILD
# =============================================================================

docker_changes=0
should_rebuild=0

if [ "$FORCE_BUILD" = "1" ]; then
    echo "FORCE_BUILD=1 detected. Rebuilding image..."
    should_rebuild=1
elif has_git_path_changes "${DOCKER_FILES[@]}"; then
    echo "Docker-related changes detected. Rebuilding image..."
    should_rebuild=1
else
    echo "No Docker-related changes detected. Skipping image rebuild."
fi

if [ "$should_rebuild" -eq 1 ]; then
    echo "Rebuilding duka_app image..."
    compose build duka_app

    echo "Cleaning Docker build cache..."
    docker_raw builder prune -af >/dev/null 2>&1 || true
    docker_raw image prune -af >/dev/null 2>&1 || true
fi

# =============================================================================
# 7. CHECK FOR NODE CHANGES
# =============================================================================

node_changes=0
if has_git_path_changes "${NODE_FILES[@]}"; then
    node_changes=1
    echo "Node dependency changes detected."
fi

# =============================================================================
# 8. START SERVICES
# =============================================================================

if [ "$ENABLE_OBSERVABILITY" = "1" ]; then
    echo "Starting application database..."
    compose up -d db minio

    echo "Removing stale observability containers..."
    compose_rm_services lgtm glitchtip-web glitchtip-worker || docker rm -f lgtm glitchtip-web glitchtip-worker 2>/dev/null || true

    echo "Starting observability services..."
    compose up -d lgtm glitchtip-postgres glitchtip-redis

    echo "Waiting for GlitchTip Postgres..."
    until compose exec -T glitchtip-postgres pg_isready -U "${GLITCHTIP_DB_USER:-glitchtip}" -d "${GLITCHTIP_DB_NAME:-glitchtip}" >/dev/null 2>&1; do
        echo -n "."
        sleep 1
    done
    echo
    echo "GlitchTip Postgres is ready."

    echo "Running GlitchTip migrations..."
    compose run --rm glitchtip-web ./manage.py migrate

    echo "Ensuring GlitchTip admin user exists..."
    compose run --rm \
        -e DJANGO_SUPERUSER_USERNAME="${GLITCHTIP_ADMIN_USERNAME:-admin}" \
        -e DJANGO_SUPERUSER_EMAIL="${GLITCHTIP_ADMIN_EMAIL:-admin@example.com}" \
        -e DJANGO_SUPERUSER_PASSWORD="${GLITCHTIP_ADMIN_PASSWORD:-change-this-password}" \
        glitchtip-web \
        ./manage.py shell -c "import os; from django.contrib.auth import get_user_model; User = get_user_model(); name = os.environ['DJANGO_SUPERUSER_USERNAME']; email = os.environ['DJANGO_SUPERUSER_EMAIL']; password = os.environ['DJANGO_SUPERUSER_PASSWORD']; exists = User.objects.filter(email=email).exists(); None if exists else User.objects.create_superuser(email=email, password=password, name=name)"

    compose up -d glitchtip-web glitchtip-worker
    echo "Starting duka_app and nginx_proxy..."
    compose up -d --remove-orphans duka_app nginx_proxy minio_setup
else
    echo "Starting duka_app and nginx_proxy..."
    compose up -d --remove-orphans duka_app nginx_proxy minio_setup
fi

# =============================================================================
# 9. WAIT FOR DATABASE
# =============================================================================

echo "Waiting for MySQL to be ready..."
until compose exec -T db mysqladmin ping -h "localhost" --silent >/dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo
echo "MySQL is ready."

# =============================================================================
# 10. CONFIGURE GIT
# =============================================================================

echo "Configuring git safe directory..."
exec_in_app git config --global --add safe.directory /var/www/html || true

# =============================================================================
# 11. INSTALL PHP DEPENDENCIES
# =============================================================================

echo "Installing PHP dependencies..."

# Add S3 package if not present
exec_in_app composer require league/flysystem-aws-s3-v3:"^3.0" --no-interaction --no-update 2>/dev/null || true

# Check lock file sync
if ! exec_in_app composer validate --no-check-all --quiet 2>/dev/null; then
    echo "Lock file out of sync, updating..."
    exec_in_app composer update league/flysystem-aws-s3-v3 --no-interaction
fi

# Standard install
if [ "$APP_ENV" = "production" ]; then
    exec_in_app composer install --no-dev --optimize-autoloader --no-interaction
else
    exec_in_app composer install --optimize-autoloader --no-interaction
fi

# Handle S3 driver issues
S3_CONVERTER_FILE="vendor/league/flysystem-aws-s3-v3/src/PortableVisibilityConverter.php"
if ! exec_in_app test -f "$S3_CONVERTER_FILE" || has_git_path_changes "composer.lock"; then
    echo "S3 driver files missing or composer.lock changed. Syncing dependencies..."
    
    if ! exec_in_app test -f "$S3_CONVERTER_FILE"; then
        exec_in_app rm -rf vendor/league/flysystem-aws-s3-v3
    fi

    if [ "$APP_ENV" = "production" ]; then
        exec_in_app composer install --no-dev --optimize-autoloader --no-interaction
    else
        exec_in_app composer install --optimize-autoloader --no-interaction
    fi
else
    echo "PHP dependencies are already up to date."
fi

# =============================================================================
# 12. HANDLE FRONTEND
# =============================================================================

echo "Handling frontend..."

if [ "$APP_ENV" = "production" ]; then
    echo "Building production assets..."
    exec_in_app rm -f public/hot
    if [ "$node_changes" -eq 1 ] || ! exec_in_app test -x node_modules/.bin/vite; then
        echo "Installing Node dependencies..."
        install_node_dependencies
    fi
    exec_in_app npm run build
else
    echo "Starting Vite dev server..."
    
    echo "Sanitizing Vite environment..."
    exec_in_app sh -lc 'rm -rf node_modules/.vite /tmp/vite-cache'
    
    sleep 1
    
    if [ "$node_changes" -eq 1 ] || ! exec_in_app test -x node_modules/.bin/vite; then
        echo "Installing Node dependencies..."
        install_node_dependencies
    fi

    if exec_in_app sh -lc 'curl -sf http://127.0.0.1:5177/@vite/client >/dev/null 2>&1'; then
        echo "Vite is already running."
    else
        echo "Launching Vite..."
        compose exec -d duka_app sh -lc 'npm run dev -- --host 0.0.0.0 --force >/tmp/vite.log 2>&1'
    fi

    echo "Waiting for Vite..."
    if ! exec_in_app sh -lc '
        for i in $(seq 1 120); do
            if curl -sf http://127.0.0.1:5177/@vite/client >/dev/null 2>&1; then
                exit 0
            fi
            printf "."
            sleep 1
        done
        exit 1
    '; then
        echo
        echo "Vite failed to become ready within 120s."
        echo "Last Vite log output:"
        exec_in_app sh -lc 'tail -n 100 /tmp/vite.log 2>/dev/null || echo "No /tmp/vite.log found."'
        
        if exec_in_app sh -lc 'grep -q "@rollup/rollup-linux-arm64-gnu" /tmp/vite.log 2>/dev/null'; then
            echo "Detected stale Rollup optional dependency set. Resetting..."
            reset_node_dependencies
            echo "Relaunching Vite..."
            compose exec -d duka_app sh -lc 'npm run dev -- --host 0.0.0.0 --force >/tmp/vite.log 2>&1'
            echo "Waiting for Vite after dependency reset..."
            if ! exec_in_app sh -lc '
                for i in $(seq 1 120); do
                    if curl -sf http://127.0.0.1:5177/@vite/client >/dev/null 2>&1; then
                        exit 0
                    fi
                    printf "."
                    sleep 1
                done
                exit 1
            '; then
                echo
                echo "Vite still failed after reinstalling Node dependencies."
                exec_in_app sh -lc 'tail -n 100 /tmp/vite.log 2>/dev/null || echo "No /tmp/vite.log found."'
                exit 1
            fi
            echo
            echo "Vite is ready after dependency reset."
        else
            exit 1
        fi
    fi
    echo
    echo "Vite is ready."
fi

# =============================================================================
# 13. RUN DATABASE MIGRATIONS
# =============================================================================

echo "Running database setup..."
if [ "$RESET_DB" = "1" ]; then
    if [ "$APP_ENV" = "production" ]; then
        echo "ERROR: RESET_DB=1 is not allowed in production."
        exit 1
    fi
    echo "Performing fresh migration and seeding..."
    exec_in_app php artisan migrate:fresh --seed --force
else
    echo "Running incremental migrations..."
    exec_in_app php artisan migrate --force
fi

# =============================================================================
# 14. CLEAR AND RECONFIGURE CACHES
# =============================================================================

echo "Purging Laravel cache..."
exec_in_app php artisan cache:clear
exec_in_app php artisan config:clear
exec_in_app php artisan route:clear
exec_in_app php artisan view:clear
exec_in_app php artisan event:clear
exec_in_app php artisan optimize:clear

echo "Ensuring storage structure and permissions..."
exec_in_app mkdir -p \
    storage/framework/sessions \
    storage/framework/views \
    storage/framework/cache/data \
    storage/app/seed-images \
    public/images/defaults

exec_in_app chown -R 33:33 storage bootstrap/cache public/images
exec_in_app chmod -R 775 storage bootstrap/cache public/images

exec_in_app touch storage/logs/laravel.log
exec_in_app chown 33:33 storage/logs/laravel.log
exec_in_app chmod 664 storage/logs/laravel.log

echo "Refreshing Laravel caches..."
exec_in_app php artisan optimize:clear || true
exec_in_app php artisan storage:link --force

if [ "$APP_ENV" = "production" ]; then
    exec_in_app php artisan optimize
else
    exec_in_app php artisan config:clear
    exec_in_app php artisan route:clear
    exec_in_app php artisan view:clear || echo "View cache clear skipped or path not found."
fi

# =============================================================================
# 15. VERIFY MINIO SETUP
# =============================================================================

echo "Waiting for MinIO setup to complete..."
# Use container name pattern from docker-compose files
MINIO_SETUP_CONTAINER="${PROJECT_ROOT##*/}_minio_setup"
MINIO_SETUP_CONTAINER=$(echo "$MINIO_SETUP_CONTAINER" | tr '[:upper:]' '[:lower:]')

# Wait for minio_setup container to exit
for i in {1..60}; do
    STATUS=$(docker inspect -f '{{.State.Status}}' "$MINIO_SETUP_CONTAINER" 2>/dev/null || echo "not-found")
    if [ "$STATUS" = "exited" ]; then
        echo
        break
    elif [ "$STATUS" = "not-found" ]; then
        echo "MinIO setup container not found, skipping verification..."
        break
    fi
    echo -n "."
    sleep 2
done

if docker inspect "$MINIO_SETUP_CONTAINER" >/dev/null 2>&1; then
    EXIT_CODE=$(docker inspect -f '{{.State.ExitCode}}' "$MINIO_SETUP_CONTAINER" 2>/dev/null || echo "0")
    if [ "${EXIT_CODE:-0}" != "0" ]; then
        echo "Warning: MinIO setup failed with exit code $EXIT_CODE (continuing anyway)"
    else
        echo "MinIO buckets configured successfully."
    fi
fi

# =============================================================================
# 16. FINAL CLEANUP AND COMPLETION
# =============================================================================

exec_in_app php artisan config:clear

echo "==================================="
echo "=== DEPLOYMENT COMPLETE ==="
echo "==================================="
echo "Following application logs (Ctrl+C to stop)..."
docker logs -f duka_app