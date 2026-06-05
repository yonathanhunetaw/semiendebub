#!/bin/bash
set -euo pipefail

# =============================================================================
# CONFIGURATION & PATH RESOLUTION
# =============================================================================

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Determine PROJECT_ROOT
if [ "$(basename "$SCRIPT_DIR")" = "docker" ]; then
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
else
    PROJECT_ROOT="$SCRIPT_DIR"
fi

# Set up logging
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/deploy_$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$LOG_DIR"

# Logging function - outputs to both console and log file
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

log_info() {
    log "INFO" "$@"
}

log_error() {
    log "ERROR" "$@"
}

log_warning() {
    log "WARNING" "$@"
}

log_success() {
    log "SUCCESS" "$@"
}

# Error handler
error_handler() {
    local line_no=$1
    local error_code=$2
    log_error "Script failed at line $line_no with exit code $error_code"
    log_error "Check log file for details: $LOG_FILE"
}

trap 'error_handler ${LINENO} $?' ERR

# Paths
ENV_FILE="$PROJECT_ROOT/.env"
BASE_DIR="$PROJECT_ROOT/docker"

# Validate .env exists
if [ ! -f "$ENV_FILE" ]; then
    log_error ".env file not found at: $ENV_FILE"
    exit 1
fi

# Source .env file
set -a
source "$ENV_FILE"
set +a

# Log deployment start
log_info "=========================================="
log_info "Deployment Started"
log_info "=========================================="
log_info "Project Root: $PROJECT_ROOT"
log_info "Environment: ${APP_ENV:-not set}"
log_info "Log file: $LOG_FILE"
log_info "=========================================="

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

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

# Docker command detection
if docker info >/dev/null 2>&1; then
    DOCKER_CMD=(docker)
    log_info "Using docker without sudo"
else
    DOCKER_CMD=(sudo docker)
    log_info "Using docker with sudo"
fi

# =============================================================================
# VARIABLE LOADING WITH DEFAULTS
# =============================================================================

# Parse command-line flags
SKIP_DB_RESET=0
for arg in "$@"; do
    case $arg in
        --no-reset|--skip-reset|--no-seed)
            SKIP_DB_RESET=1
            ;;
    esac
done

# Load from .env or use defaults
APP_ENV="${APP_ENV:-}"
RESET_DB="${RESET_DB:-$(env_value RESET_DB)}"
FORCE_BUILD="${FORCE_BUILD:-$(env_value FORCE_BUILD)}"
ENABLE_OBSERVABILITY="${ENABLE_OBSERVABILITY:-$(env_value ENABLE_OBSERVABILITY)}"
GLITCHTIP_DB_USER="${GLITCHTIP_DB_USER:-$(env_value GLITCHTIP_DB_USER)}"
GLITCHTIP_DB_NAME="${GLITCHTIP_DB_NAME:-$(env_value GLITCHTIP_DB_NAME)}"

# Apply defaults
FORCE_BUILD="${FORCE_BUILD:-0}"
ENABLE_OBSERVABILITY="${ENABLE_OBSERVABILITY:-0}"
GLITCHTIP_DB_USER="${GLITCHTIP_DB_USER:-glitchtip}"
GLITCHTIP_DB_NAME="${GLITCHTIP_DB_NAME:-glitchtip}"

# Validate required variables
if [ -z "$APP_ENV" ]; then
    log_error "APP_ENV is not set in .env"
    exit 1
fi

# =============================================================================
# FILE ARRAYS FOR CHANGE DETECTION
# =============================================================================

DOCKER_FILES=(
    "$BASE_DIR/Dockerfile"
    "$BASE_DIR/Dockerfile.dev"
    "$BASE_DIR/docker-compose.yml"
    "$BASE_DIR/docker-compose.dev.yml"
    "$BASE_DIR/docker-compose.prod.yml"
    "$BASE_DIR/docker-compose.observability.yml"
)

NODE_FILES=(
    "$PROJECT_ROOT/package.json"
    "$PROJECT_ROOT/package-lock.json"
)

# =============================================================================
# DOCKER COMPOSE CONFIGURATION
# =============================================================================

# Build compose files array
COMPOSE_FILES=()
if [ "$APP_ENV" = "production" ]; then
    COMPOSE_FILES=(-f "$BASE_DIR/docker-compose.yml" -f "$BASE_DIR/docker-compose.prod.yml")
else
    COMPOSE_FILES=(-f "$BASE_DIR/docker-compose.yml" -f "$BASE_DIR/docker-compose.dev.yml" -f "$BASE_DIR/docker-compose.prod.yml")
fi

# Add observability if enabled
if [ "$ENABLE_OBSERVABILITY" = "1" ]; then
    if [ ! -f "$BASE_DIR/docker-compose.observability.yml" ]; then
        log_error "$BASE_DIR/docker-compose.observability.yml not found"
        exit 1
    fi
    COMPOSE_FILES+=(-f "$BASE_DIR/docker-compose.observability.yml")
    log_info "Observability stack is ENABLED"
fi

# Cloudflared check
if check_cloudflared; then
    log_info "Cloudflared detected - using host-based networking"
fi

# =============================================================================
# DOCKER COMPOSE WRAPPER
# =============================================================================

compose() {
    (cd "$PROJECT_ROOT" && \
     "${DOCKER_CMD[@]}" compose \
        --env-file "$ENV_FILE" \
        "${COMPOSE_FILES[@]}" \
        "$@")
}

docker_raw() {
    "${DOCKER_CMD[@]}" "$@"
}

exec_in_app() {
    compose exec -T duka-app "$@"
}

exec_in_app_as_root() {
    compose exec -T -u root duka-app "$@"
}

compose_rm_services() {
    if has_command timeout; then
        (cd "$PROJECT_ROOT" && timeout 20s "${DOCKER_CMD[@]}" compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" rm -fsv "$@")
    else
        (cd "$PROJECT_ROOT" && "${DOCKER_CMD[@]}" compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" rm -fsv "$@")
    fi
}

install_node_dependencies() {
    log_info "Installing Node dependencies..."
    exec_in_app npm ci --no-audit --no-fund
    log_success "Node dependencies installed"
}

reset_node_dependencies() {
    log_warning "Resetting Node dependencies..."
    exec_in_app_as_root sh -lc 'find node_modules -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true'
    install_node_dependencies
}

# =============================================================================
# MIGRATION WITH DEADLOCK HANDLING
# =============================================================================

run_migration_with_retry() {
    local max_attempts=3
    local attempt=1
    
    log_info "Starting database migration (max $max_attempts attempts)..."
    
    while [ "$attempt" -le "$max_attempts" ]; do
        log_info "Migration attempt $attempt of $max_attempts"
        
        if [ "$SKIP_DB_RESET" = "0" ]; then
            log_info "Attempting to refresh and seed database..."
            
            # Try db:wipe first
            if exec_in_app php artisan db:wipe --force 2>&1 | tee -a "$LOG_FILE"; then
                log_success "Database wiped successfully"
                if exec_in_app php artisan migrate --seed --force 2>&1 | tee -a "$LOG_FILE"; then
                    log_success "Migration and seeding completed successfully"
                    return 0
                fi
            else
                log_warning "db:wipe failed, trying migrate:fresh..."
                
                # Try migrate:fresh
                if exec_in_app php artisan migrate:fresh --seed --force 2>&1 | tee -a "$LOG_FILE"; then
                    log_success "Migration and seeding completed successfully"
                    return 0
                fi
            fi
        else
            log_info "Skipping database reset, running incremental migrations..."
            if exec_in_app php artisan migrate --force 2>&1 | tee -a "$LOG_FILE"; then
                log_success "Incremental migration completed successfully"
                return 0
            fi
        fi
        
        log_warning "Migration attempt $attempt failed"
        
        if [ "$attempt" -lt "$max_attempts" ]; then
            local wait_time=5
            log_info "Waiting $wait_time seconds before retry..."
            sleep $wait_time
        fi
        
        # CORRECTED INCREMENT
        attempt=$((attempt + 1))
    done
    
    log_error "Migration failed after $max_attempts attempts"
    return 1
}

# =============================================================================
# MAIN DEPLOYMENT LOGIC
# =============================================================================

log_info "=========================================="
log_info "Deployment Configuration"
log_info "=========================================="
log_info "Environment: $APP_ENV"
log_info "Skip Database Reset: $SKIP_DB_RESET"
log_info "Force Build: $FORCE_BUILD"
log_info "Enable Observability: $ENABLE_OBSERVABILITY"
log_info "=========================================="

# =============================================================================
# DOCKER IMAGE BUILD
# =============================================================================

should_rebuild=0
if [ "$FORCE_BUILD" = "1" ]; then
    log_info "FORCE_BUILD=1 detected - forcing rebuild"
    should_rebuild=1
elif has_git_path_changes "${DOCKER_FILES[@]}"; then
    log_info "Docker configuration changes detected"
    should_rebuild=1
else
    log_info "No Docker changes detected - skipping rebuild"
fi

if [ "$should_rebuild" -eq 1 ]; then
    log_info "Building duka-app image..."
    compose build duka-app 2>&1 | tee -a "$LOG_FILE"
    
    log_info "Cleaning Docker cache..."
    docker_raw builder prune -af >/dev/null 2>&1 || true
    docker_raw image prune -af >/dev/null 2>&1 || true
    log_success "Image build complete"
fi

# =============================================================================
# NODE DEPENDENCIES
# =============================================================================

node_changes=0
if has_git_path_changes "${NODE_FILES[@]}"; then
    node_changes=1
    log_info "Node dependency changes detected"
fi

# =============================================================================
# START SERVICES
# =============================================================================

# Clean up stale containers and force-release their names
log_info "Removing old containers..."

# Stop and remove all containers associated with this project
# The --volumes flag is crucial here; it detaches the data lock
compose down -v --remove-orphans 2>/dev/null || true

# Explicitly wipe the container by name if it's still hanging around
docker rm -f duka-minio-setup 2>/dev/null || true

log_info "Starting application services..."

if [ "$ENABLE_OBSERVABILITY" = "1" ]; then
    log_info "Starting observability stack..."
    log_info "Starting database and MinIO..."
    compose up -d db minio 2>&1 | tee -a "$LOG_FILE"
    
    log_info "Removing stale observability containers..."
    compose_rm_services lgtm glitchtip-web glitchtip-worker || docker rm -f lgtm glitchtip-web glitchtip-worker 2>/dev/null || true
    
    log_info "Starting LGTM stack and GlitchTip..."
    compose up -d lgtm glitchtip-postgres glitchtip-redis 2>&1 | tee -a "$LOG_FILE"
    
    log_info "Waiting for GlitchTip PostgreSQL..."
    until compose exec -T glitchtip-postgres pg_isready -U "$GLITCHTIP_DB_USER" -d "$GLITCHTIP_DB_NAME" >/dev/null 2>&1; do
        echo -n "."
        sleep 1
    done
    echo
    log_success "GlitchTip PostgreSQL is ready"
    
    log_info "Running GlitchTip migrations..."
    compose run --rm glitchtip-web ./manage.py migrate 2>&1 | tee -a "$LOG_FILE"
    
    log_info "Setting up GlitchTip admin user..."
    compose run --rm \
        -e DJANGO_SUPERUSER_USERNAME="${GLITCHTIP_ADMIN_USERNAME:-admin}" \
        -e DJANGO_SUPERUSER_EMAIL="${GLITCHTIP_ADMIN_EMAIL:-admin@example.com}" \
        -e DJANGO_SUPERUSER_PASSWORD="${GLITCHTIP_ADMIN_PASSWORD:-change-this-password}" \
        glitchtip-web \
        ./manage.py shell -c "import os; from django.contrib.auth import get_user_model; User = get_user_model(); name = os.environ['DJANGO_SUPERUSER_USERNAME']; email = os.environ['DJANGO_SUPERUSER_EMAIL']; password = os.environ['DJANGO_SUPERUSER_PASSWORD']; exists = User.objects.filter(email=email).exists(); None if exists else User.objects.create_superuser(email=email, password=password, name=name)" 2>&1 | tee -a "$LOG_FILE"
    
    compose up -d glitchtip-web glitchtip-worker 2>&1 | tee -a "$LOG_FILE"
    log_info "Starting application services..."
    compose up -d --remove-orphans duka-app nginx minio_setup 2>&1 | tee -a "$LOG_FILE"
else
    log_info "Observability is DISABLED"
    log_info "Starting application services..."
    # Update the names below to match your config output exactly
    compose up -d --force-recreate --remove-orphans duka-app duka-db duka-minio minio-setup 2>&1 | tee -a "$LOG_FILE"
fi

# =============================================================================
# DATABASE READINESS
# =============================================================================

log_info "Waiting for MySQL to be healthy..."
# This asks Docker to tell us the status of the container, not try to login
for i in {1..30}; do
    STATUS=$(docker inspect -f '{{.State.Health.Status}}' duka-db 2>/dev/null)
    
    if [ "$STATUS" = "healthy" ]; then
        log_success "MySQL is healthy and ready"
        break
    fi
    
    # If healthchecks aren't configured in your YML, fallback to a simple sleep
    if [ "$STATUS" = "<no value>" ]; then
        log_info "Healthcheck not configured, waiting 5 seconds..."
        sleep 5
        break
    fi
    
    echo -n "."
    sleep 2
    
    if [ $i -eq 30 ]; then
        log_error "MySQL timed out waiting for health."
        exit 1
    fi
done

# =============================================================================
# CONFIGURE GIT SAFE DIRECTORY
# =============================================================================

log_info "Configuring git safe directory..."
exec_in_app git config --global --add safe.directory /var/www/html || true

# =============================================================================
# PHP DEPENDENCIES
# =============================================================================

log_info "Installing PHP dependencies..."

# Add S3 package if needed
exec_in_app composer require league/flysystem-aws-s3-v3:"^3.0" --no-interaction --no-update 2>/dev/null || true

# Validate composer
if ! exec_in_app composer validate --no-check-all --quiet 2>/dev/null; then
    log_warning "Composer lock file out of sync, updating..."
    exec_in_app composer update league/flysystem-aws-s3-v3 --no-interaction 2>&1 | tee -a "$LOG_FILE"
fi

# Install dependencies
if [ "$APP_ENV" = "production" ]; then
    log_info "Production mode: Installing without dev dependencies"
    exec_in_app composer install --no-dev --optimize-autoloader --no-interaction 2>&1 | tee -a "$LOG_FILE"
else
    log_info "Development mode: Installing with dev dependencies"
    exec_in_app composer install --optimize-autoloader --no-interaction 2>&1 | tee -a "$LOG_FILE"
fi

# Handle S3 driver issues
S3_CONVERTER_FILE="vendor/league/flysystem-aws-s3-v3/src/PortableVisibilityConverter.php"
if ! exec_in_app test -f "$S3_CONVERTER_FILE" || has_git_path_changes "composer.lock"; then
    log_warning "S3 driver files missing or composer.lock changed, reinstalling..."
    
    if ! exec_in_app test -f "$S3_CONVERTER_FILE"; then
        exec_in_app rm -rf vendor/league/flysystem-aws-s3-v3
    fi
    
    if [ "$APP_ENV" = "production" ]; then
        exec_in_app composer install --no-dev --optimize-autoloader --no-interaction 2>&1 | tee -a "$LOG_FILE"
    else
        exec_in_app composer install --optimize-autoloader --no-interaction 2>&1 | tee -a "$LOG_FILE"
    fi
else
    log_success "PHP dependencies up to date"
fi

# =============================================================================
# FRONTEND ASSETS
# =============================================================================

log_info "Handling frontend assets..."

if [ "$APP_ENV" = "production" ]; then
    log_info "Building production assets..."
    exec_in_app rm -f public/hot
    
    if [ "$node_changes" -eq 1 ] || ! exec_in_app test -x node_modules/.bin/vite; then
        install_node_dependencies
    fi
    
    exec_in_app npm run build 2>&1 | tee -a "$LOG_FILE"
    log_success "Production assets built"
else
    log_info "Starting Vite development server..."
    
    log_info "Sanitizing Vite environment..."
    exec_in_app sh -lc 'rm -rf node_modules/.vite /tmp/vite-cache'
    sleep 1
    
    if [ "$node_changes" -eq 1 ] || ! exec_in_app test -x node_modules/.bin/vite; then
        install_node_dependencies
    fi
    
    if exec_in_app sh -lc 'curl -sf http://127.0.0.1:5177/@vite/client >/dev/null 2>&1'; then
        log_info "Vite is already running"
    else
        log_info "Launching Vite..."
        compose exec -d duka-app sh -lc 'npm run dev -- --host 0.0.0.0 --force >/tmp/vite.log 2>&1'
    fi
    
    log_info "Waiting for Vite to become ready..."
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
        log_warning "Vite failed to become ready within 120 seconds"
        
        if exec_in_app sh -lc 'grep -q "@rollup/rollup-linux-arm64-gnu" /tmp/vite.log 2>/dev/null'; then
            log_warning "Detected stale Rollup dependencies, resetting..."
            reset_node_dependencies
            log_info "Relaunching Vite after reset..."
            compose exec -d duka-app sh -lc 'npm run dev -- --host 0.0.0.0 --force >/tmp/vite.log 2>&1'
            
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
                log_error "Vite still failed after dependency reset"
                exit 1
            fi
            echo
            log_success "Vite ready after dependency reset"
        else
            log_error "Vite failed to start"
            exit 1
        fi
    fi
    echo
    log_success "Vite is ready"
fi

# =============================================================================
# DATABASE MIGRATION (WITH DEADLOCK HANDLING)
# =============================================================================

if ! run_migration_with_retry; then
    log_error "Database migration failed - deployment aborted"
    exit 1
fi

# =============================================================================
# CACHE AND PERMISSIONS (FIXED)
# =============================================================================

log_info "Setting up storage structure and permissions..."

# 1. Ensure the directories exist
exec_in_app mkdir -p storage/framework/sessions storage/framework/views storage/framework/cache/data storage/app/seed-images public/images/defaults storage/logs

# 2. Create the log file if it doesn't exist
exec_in_app touch storage/logs/laravel.log

# 3. Set permissions
# We target the specific folders and files
exec_in_app chown -R 33:33 storage bootstrap/cache public/images
exec_in_app chmod -R 775 storage bootstrap/cache public/images

# 4. Set specific log file permissions
exec_in_app chmod 664 storage/logs/laravel.log

# ----------------------------------------
log_info "Cleaning up old cache files..."
exec_in_app rm -rf bootstrap/cache/*.php
# -----------------------------------------



log_info "Purging Laravel caches..."
exec_in_app php artisan cache:clear 2>&1 | tee -a "$LOG_FILE"
exec_in_app php artisan config:clear 2>&1 | tee -a "$LOG_FILE"
exec_in_app php artisan route:clear 2>&1 | tee -a "$LOG_FILE"
exec_in_app php artisan view:clear 2>&1 | tee -a "$LOG_FILE"
exec_in_app php artisan event:clear 2>&1 | tee -a "$LOG_FILE"
exec_in_app php artisan optimize:clear 2>&1 | tee -a "$LOG_FILE"

log_info "Refreshing Laravel optimizations..."
exec_in_app php artisan optimize:clear || true
exec_in_app php artisan storage:link --force

if [ "$APP_ENV" = "production" ]; then
    exec_in_app php artisan optimize 2>&1 | tee -a "$LOG_FILE"
else
    exec_in_app php artisan config:clear 2>&1 | tee -a "$LOG_FILE"
    exec_in_app php artisan route:clear 2>&1 | tee -a "$LOG_FILE"
    exec_in_app php artisan view:clear 2>&1 | tee -a "$LOG_FILE" || echo "View cache clear skipped"
fi

# =============================================================================
# FORCE MINIO PUBLIC POLICY
# =============================================================================
log_info "Ensuring MinIO bucket is public..."
if docker exec duka-minio-setup mc alias set local http://duka-minio:9000 "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" >/dev/null 2>&1; then
    docker exec duka-minio-setup mc policy set public local/duka-images >/dev/null 2>&1
    log_success "MinIO bucket policy enforced as public."
else
    log_warning "Could not enforce MinIO policy (MinIO might be unreachable)."
fi

# Sanity check
log_info "Verifying MinIO items directory..."
if docker exec duka-minio-setup mc ls local/duka-images/uploads/items/ >/dev/null 2>&1; then
    log_success "MinIO items directory confirmed."
else
    log_warning "MinIO items directory not found (this is normal if no images have been uploaded yet)."
fi

# =============================================================================
# MINIO SETUP & POLICY ENFORCEMENT
# =============================================================================

log_info "Verifying MinIO setup container..."
MINIO_SETUP_CONTAINER="${PROJECT_ROOT##*/}_minio_setup"
MINIO_SETUP_CONTAINER=$(echo "$MINIO_SETUP_CONTAINER" | tr '[:upper:]' '[:lower:]')

# Wait for setup container to finish
for i in {1..60}; do
    # Ensure this name matches exactly what 'docker ps' says
    STATUS=$(docker inspect -f '{{.State.Status}}' "minio-setup" 2>/dev/null || echo "not-found")
    
    # Sometimes it's 'exited', sometimes it's 'dead' or 'removing'
    if [ "$STATUS" = "exited" ]; then
        log_success "MinIO setup container finished."
        break
    fi
    echo -n "."
    sleep 2
done

# Force the policy to public to ensure no 403 errors
log_info "Ensuring MinIO bucket is public..."
if docker exec duka-minio-setup mc alias set local http://duka-minio:9000 "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" >/dev/null 2>&1; then
    docker exec duka-minio-setup mc policy set public local/duka-images >/dev/null 2>&1
    log_success "MinIO bucket policy enforced as public."
else
    log_warning "Could not enforce MinIO policy (MinIO might be unreachable)."
fi

# Sanity check
log_info "Verifying MinIO items directory..."
if docker exec duka-minio-setup mc ls local/duka-images/uploads/items/ >/dev/null 2>&1; then
    log_success "MinIO items directory confirmed."
else
    log_info "MinIO items directory not found (likely empty)."
fi

# ... (rest of your script)

# =============================================================================
# DEPLOYMENT COMPLETE
# =============================================================================

log_success "=========================================="
log_success "DEPLOYMENT COMPLETE"
log_success "=========================================="
log_success "Application is now running"
log_success "Log file saved to: $LOG_FILE"
log_success "=========================================="

# Show logs (This should be the very last thing in your file)
# log_info "Showing application logs (Ctrl+C to exit)..."
# docker logs -f duka-app