#!/bin/bash
set -euo pipefail

# =============================================================================
# COLOR CODES FOR LOGGING
# =============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[0;37m'

# Bold colors
BOLD_RED='\033[1;31m'
BOLD_GREEN='\033[1;32m'
BOLD_YELLOW='\033[1;33m'
BOLD_BLUE='\033[1;34m'
BOLD_PURPLE='\033[1;35m'
BOLD_CYAN='\033[1;36m'

# Reset
NC='\033[0m'

# Icons
ICON_SUCCESS="✅"
ICON_ERROR="❌"
ICON_WARNING="⚠️"
ICON_INFO="📍"
ICON_STEP="🔧"
ICON_DONE="✨"
ICON_ROCKET="🚀"
ICON_DB="🗄️"
ICON_PACKAGE="📦"
ICON_VITE="⚡"

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

# Logging function - outputs to both console and log file with colors
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case "$level" in
        "INFO")
            echo -e "[$timestamp] ${BLUE}[INFO]${NC} ${ICON_INFO} $message" | tee -a "$LOG_FILE"
            ;;
        "SUCCESS")
            echo -e "[$timestamp] ${GREEN}[SUCCESS]${NC} ${ICON_SUCCESS} $message" | tee -a "$LOG_FILE"
            ;;
        "ERROR")
            echo -e "[$timestamp] ${RED}[ERROR]${NC} ${ICON_ERROR} $message" | tee -a "$LOG_FILE"
            ;;
        "WARNING")
            echo -e "[$timestamp] ${YELLOW}[WARNING]${NC} ${ICON_WARNING} $message" | tee -a "$LOG_FILE"
            ;;
        "STEP")
            echo -e "[$timestamp] ${CYAN}[STEP]${NC} ${ICON_STEP} $message" | tee -a "$LOG_FILE"
            ;;
        "DONE")
            echo -e "[$timestamp] ${BOLD_GREEN}[DONE]${NC} ${ICON_DONE} $message" | tee -a "$LOG_FILE"
            ;;
        *)
            echo -e "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
            ;;
    esac
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

log_step() {
    log "STEP" "$@"
}

log_done() {
    log "DONE" "$@"
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
log_success "=========================================="
log_success "${ICON_ROCKET} DEPLOYMENT STARTED ${ICON_ROCKET}"
log_success "=========================================="
log_info "Project Root: $PROJECT_ROOT"
log_info "Environment: ${APP_ENV:-not set}"
log_info "Log file: $LOG_FILE"
log_success "=========================================="

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
    docker exec "$@" duka-app
}

exec_in_app_as_root() {
    docker exec -u root "$@" duka-app
}
compose_rm_services() {
    if has_command timeout; then
        (cd "$PROJECT_ROOT" && timeout 20s "${DOCKER_CMD[@]}" compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" rm -fsv "$@")
    else
        (cd "$PROJECT_ROOT" && "${DOCKER_CMD[@]}" compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" rm -fsv "$@")
    fi
}

install_node_dependencies() {
    log_step "Installing Node dependencies from lock file..."
    exec_in_app npm ci --no-audit --no-fund
    
    # Fix for hoist-non-react-statics on Raspberry Pi (ARM)
    if [ "$APP_ENV" != "production" ]; then
        log_step "Fixing hoist-non-react-statics for ARM/Raspberry Pi..."
        exec_in_app npm uninstall hoist-non-react-statics --no-save || true
        exec_in_app npm install hoist-non-react-statics@3.3.2 --no-save
        exec_in_app rm -rf node_modules/.vite /tmp/vite-cache
        log_done "Hoist-non-react-statics fixed for ARM compatibility"
    fi
    
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
    
    log_step "Starting database migration (max $max_attempts attempts)..."
    
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
        
        attempt=$((attempt + 1))
    done
    
    log_error "Migration failed after $max_attempts attempts"
    return 1
}

# =============================================================================
# MAIN DEPLOYMENT LOGIC
# =============================================================================

log_success "=========================================="
log_success "${ICON_ROCKET} DEPLOYMENT CONFIGURATION ${ICON_ROCKET}"
log_success "=========================================="
log_info "Environment: $APP_ENV"
log_info "Skip Database Reset: $SKIP_DB_RESET"
log_info "Force Build: $FORCE_BUILD"
log_info "Enable Observability: $ENABLE_OBSERVABILITY"
log_success "=========================================="

# =============================================================================
# DOCKER IMAGE BUILD
# =============================================================================

log_step "Checking Docker image status..."

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
    log_step "Building duka-app image..."
    compose build duka-app 2>&1 | tee -a "$LOG_FILE"
    
    log_step "Cleaning Docker cache..."
    docker_raw builder prune -af >/dev/null 2>&1 || true
    docker_raw image prune -af >/dev/null 2>&1 || true
    log_done "Image build complete"
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

log_step "Removing old containers..."
compose down -v --remove-orphans 2>/dev/null || true
docker rm -f duka-minio-setup 2>/dev/null || true
log_done "Old containers removed"

log_step "Starting application services..."

if [ "$ENABLE_OBSERVABILITY" = "1" ]; then
    log_step "Starting observability stack..."
    log_step "Starting database and MinIO..."
    compose up -d db minio 2>&1 | tee -a "$LOG_FILE"
    
    log_step "Removing stale observability containers..."
    compose_rm_services lgtm glitchtip-web glitchtip-worker || docker rm -f lgtm glitchtip-web glitchtip-worker 2>/dev/null || true
    
    log_step "Starting LGTM stack and GlitchTip..."
    compose up -d lgtm glitchtip-postgres glitchtip-redis 2>&1 | tee -a "$LOG_FILE"
    
    log_step "Waiting for GlitchTip PostgreSQL..."
    until compose exec -T glitchtip-postgres pg_isready -U "$GLITCHTIP_DB_USER" -d "$GLITCHTIP_DB_NAME" >/dev/null 2>&1; do
        echo -n "."
        sleep 1
    done
    echo
    log_success "GlitchTip PostgreSQL is ready"
    
    log_step "Running GlitchTip migrations..."
    compose run --rm glitchtip-web ./manage.py migrate 2>&1 | tee -a "$LOG_FILE"
    
    log_step "Setting up GlitchTip admin user..."
    compose run --rm \
        -e DJANGO_SUPERUSER_USERNAME="${GLITCHTIP_ADMIN_USERNAME:-admin}" \
        -e DJANGO_SUPERUSER_EMAIL="${GLITCHTIP_ADMIN_EMAIL:-admin@example.com}" \
        -e DJANGO_SUPERUSER_PASSWORD="${GLITCHTIP_ADMIN_PASSWORD:-change-this-password}" \
        glitchtip-web \
        ./manage.py shell -c "import os; from django.contrib.auth import get_user_model; User = get_user_model(); name = os.environ['DJANGO_SUPERUSER_USERNAME']; email = os.environ['DJANGO_SUPERUSER_EMAIL']; password = os.environ['DJANGO_SUPERUSER_PASSWORD']; exists = User.objects.filter(email=email).exists(); None if exists else User.objects.create_superuser(email=email, password=password, name=name)" 2>&1 | tee -a "$LOG_FILE"
    
    compose up -d glitchtip-web glitchtip-worker 2>&1 | tee -a "$LOG_FILE"
    log_step "Starting application services..."
    compose up -d --remove-orphans duka-app nginx minio_setup 2>&1 | tee -a "$LOG_FILE"
else
    log_info "Observability is DISABLED"
    log_step "Starting application services..."
    compose up -d --force-recreate --remove-orphans duka-app duka-db duka-minio minio-setup 2>&1 | tee -a "$LOG_FILE"
    
    log_step "Waiting for duka-app to be ready..."
    for i in {1..30}; do
        if docker exec duka-app php artisan --version >/dev/null 2>&1; then
            log_success "duka-app is ready"
            break
        fi
        echo -n "."
        sleep 2
    done
fi

# =============================================================================
# DATABASE READINESS
# =============================================================================

log_step "Waiting for MySQL to be healthy..."
for i in {1..30}; do
    STATUS=$(docker inspect -f '{{.State.Health.Status}}' duka-db 2>/dev/null)
    
    if [ "$STATUS" = "healthy" ]; then
        log_success "MySQL is healthy and ready"
        break
    fi
    
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

log_step "Configuring git safe directory..."
exec_in_app git config --global --add safe.directory /var/www/html || true
log_done "Git safe directory configured"

# =============================================================================
# PHP DEPENDENCIES
# =============================================================================

log_step "${ICON_PACKAGE} Installing PHP dependencies..."

exec_in_app composer require league/flysystem-aws-s3-v3:"^3.0" --no-interaction --no-update 2>/dev/null || true

if ! exec_in_app composer validate --no-check-all --quiet 2>/dev/null; then
    log_warning "Composer lock file out of sync, updating..."
    exec_in_app composer update league/flysystem-aws-s3-v3 --no-interaction 2>&1 | tee -a "$LOG_FILE"
fi

if [ "$APP_ENV" = "production" ]; then
    log_info "Production mode: Installing without dev dependencies"
    exec_in_app composer install --no-dev --optimize-autoloader --no-interaction 2>&1 | tee -a "$LOG_FILE"
else
    log_info "Development mode: Installing with dev dependencies"
    exec_in_app composer install --optimize-autoloader --no-interaction 2>&1 | tee -a "$LOG_FILE"
fi

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

log_done "PHP dependencies installed"

# =============================================================================
# FRONTEND ASSETS
# =============================================================================

log_step "${ICON_VITE} Handling frontend assets..."

if [ "$APP_ENV" = "production" ]; then
    log_step "Building production assets..."
    exec_in_app rm -f public/hot
    
    if [ "$node_changes" -eq 1 ] || ! exec_in_app test -x node_modules/.bin/vite; then
        install_node_dependencies
    fi
    
    exec_in_app npm run build 2>&1 | tee -a "$LOG_FILE"
    log_success "Production assets built"
else
    log_step "Setting up Vite dependencies first..."
    
    if [ "$node_changes" -eq 1 ] || ! exec_in_app test -x node_modules/.bin/vite; then
        install_node_dependencies
    fi
    
    log_step "Fixing Vite dependencies for development..."
    exec_in_app npm install hoist-non-react-statics@3.3.2 --no-save 2>&1 | tee -a "$LOG_FILE"
    exec_in_app rm -rf node_modules/.vite /tmp/vite-cache
    log_done "Vite dependencies fixed"
    
    log_step "Sanitizing Vite environment..."
    exec_in_app sh -lc 'pkill -f vite || true'
    sleep 1
    log_done "Vite environment sanitized"
    
    log_step "Launching Vite in background..."
    docker exec -d duka-app sh -lc 'npm run dev -- --host 0.0.0.0 --force >/tmp/vite.log 2>&1'
    VITE_EXIT=$?
    
    if [ $VITE_EXIT -ne 0 ]; then
        log_warning "Vite start command had issues (exit code: $VITE_EXIT), continuing anyway..."
    else
        log_done "Vite launch command issued"
    fi
    
    log_step "Waiting for Vite to become ready..."
    if ! exec_in_app sh -c '
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
        log_error "Vite failed to start. Check /tmp/vite.log"
        exec_in_app cat /tmp/vite.log 2>/dev/null | tail -20
        exit 1
    fi
    echo
    log_success "Vite is ready and running ${ICON_VITE}"
fi

# =============================================================================
# DATABASE MIGRATION
# =============================================================================

log_step "${ICON_DB} Running database migration..."

if ! run_migration_with_retry; then
    log_error "Database migration failed - deployment aborted"
    exit 1
fi

log_done "Database migration completed"

# =============================================================================
# CACHE AND PERMISSIONS
# =============================================================================

log_step "Setting up storage structure and permissions..."

exec_in_app mkdir -p storage/framework/sessions storage/framework/views storage/framework/cache/data storage/app/seed-images public/images/defaults storage/logs
exec_in_app touch storage/logs/laravel.log
exec_in_app chown -R 33:33 storage bootstrap/cache public/images
exec_in_app chmod -R 775 storage bootstrap/cache public/images
exec_in_app chmod 664 storage/logs/laravel.log

log_done "Storage permissions configured"

log_step "Cleaning up old cache files..."
exec_in_app rm -rf bootstrap/cache/*.php
log_done "Cache files cleaned"

log_step "Purging Laravel caches..."
exec_in_app php artisan cache:clear 2>&1 | tee -a "$LOG_FILE"
exec_in_app php artisan config:clear 2>&1 | tee -a "$LOG_FILE"
exec_in_app php artisan route:clear 2>&1 | tee -a "$LOG_FILE"
exec_in_app php artisan view:clear 2>&1 | tee -a "$LOG_FILE"
exec_in_app php artisan event:clear 2>&1 | tee -a "$LOG_FILE"
exec_in_app php artisan optimize:clear 2>&1 | tee -a "$LOG_FILE"
log_done "Laravel caches purged"

log_step "Refreshing Laravel optimizations..."
exec_in_app php artisan optimize:clear || true
exec_in_app php artisan storage:link --force

if [ "$APP_ENV" = "production" ]; then
    exec_in_app php artisan optimize 2>&1 | tee -a "$LOG_FILE"
else
    exec_in_app php artisan config:clear 2>&1 | tee -a "$LOG_FILE"
    exec_in_app php artisan route:clear 2>&1 | tee -a "$LOG_FILE"
    exec_in_app php artisan view:clear 2>&1 | tee -a "$LOG_FILE" || echo "View cache clear skipped"
fi

log_done "Laravel optimizations refreshed"

# =============================================================================
# MINIO SETUP & POLICY ENFORCEMENT
# =============================================================================

log_step "Configuring MinIO bucket..."

if docker exec duka-minio-setup mc alias set local http://duka-minio:9000 "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" >/dev/null 2>&1; then
    docker exec duka-minio-setup mc policy set public local/duka-images >/dev/null 2>&1
    log_success "MinIO bucket policy enforced as public"
else
    log_warning "Could not enforce MinIO policy (MinIO might be unreachable)"
fi

log_step "Verifying MinIO setup container..."
for i in {1..60}; do
    STATUS=$(docker inspect -f '{{.State.Status}}' "minio-setup" 2>/dev/null || echo "not-found")
    
    if [ "$STATUS" = "exited" ]; then
        log_success "MinIO setup container finished"
        break
    fi
    echo -n "."
    sleep 2
done
echo

log_step "Verifying MinIO items directory..."
if docker exec duka-minio-setup mc ls local/duka-images/uploads/items/ >/dev/null 2>&1; then
    log_success "MinIO items directory confirmed"
else
    log_info "MinIO items directory not found (likely empty)"
fi

# =============================================================================
# DEPLOYMENT COMPLETE
# =============================================================================

log_success "=========================================="
log_success "${ICON_ROCKET} DEPLOYMENT COMPLETE ${ICON_ROCKET}"
log_success "=========================================="
log_success "Application is now running ${ICON_SUCCESS}"
log_success "Log file saved to: $LOG_FILE"
log_success "=========================================="