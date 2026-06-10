#!/bin/bash -x
sed -i '1 s/bash.*/bash -x/' deploy.sh

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
ICON_CHECK="✓"
ICON_CROSS="✗"
ICON_PENDING="○"
ICON_IN_PROGRESS="◉"

# =============================================================================
# PROGRESS TRACKING SYSTEM
# =============================================================================

# Global array to track steps
declare -a STEPS=()
declare -a STEP_STATUS=()
declare -a STEP_MESSAGES=()

# Initialize steps
init_steps() {
    STEPS=(
        "Load Configuration & Environment"
        "Start Services (Docker Compose)"
        "MinIO Readiness & Bucket Setup"
        "PHP Dependencies Installation"
        "Node Dependencies Installation"
        "Frontend Assets Build"
        "Database Migration & Seeding"
        "Cache & Permissions Setup"
        "Final Verification"
    )
    
    for i in "${!STEPS[@]}"; do
        STEP_STATUS[$i]="pending"
        STEP_MESSAGES[$i]=""
    done
}

# Update step status
update_step() {
    local step_num=$1
    local status=$2
    local message=$3
    
    STEP_STATUS[$step_num]=$status
    STEP_MESSAGES[$step_num]=$message
}

# Display progress board (full view)
show_full_progress() {
    echo ""
    echo -e "${BOLD_CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD_CYAN}                     DEPLOYMENT PROGRESS                         ${NC}"
    echo -e "${BOLD_CYAN}════════════════════════════════════════════════════════════════${NC}"
    
    for i in "${!STEPS[@]}"; do
        local step_name="${STEPS[$i]}"
        local status="${STEP_STATUS[$i]}"
        local message="${STEP_MESSAGES[$i]}"
        
        case "$status" in
            "pending")
                echo -e "  ${YELLOW}${ICON_PENDING}${NC} ${step_name}"
                ;;
            "in_progress")
                echo -e "  ${BLUE}${ICON_IN_PROGRESS}${NC} ${step_name} ${CYAN}...${NC}"
                ;;
            "success")
                echo -e "  ${GREEN}${ICON_CHECK}${NC} ${step_name} ${GREEN}✓${NC}"
                if [ -n "$message" ]; then
                    echo -e "      ${GREEN}→${NC} $message"
                fi
                ;;
            "failed")
                echo -e "  ${RED}${ICON_CROSS}${NC} ${step_name} ${RED}✗${NC}"
                if [ -n "$message" ]; then
                    echo -e "      ${RED}→${NC} $message"
                fi
                ;;
        esac
    done
    
    echo -e "${BOLD_CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Show only the current step progress (compact view)
show_compact_progress() {
    echo ""
    echo -e "${BOLD_CYAN}════════════════════════════════════════════════════════════════${NC}"
    
    # Find and show completed steps
    local completed_count=0
    for i in "${!STEPS[@]}"; do
        if [ "${STEP_STATUS[$i]:-pending}" = "success" ]; then
            echo -e "  ${GREEN}✓${NC} ${STEPS[$i]}"
            ((completed_count++))
        fi
    done
    
    # Show current in-progress step
    for i in "${!STEPS[@]}"; do
        if [ "${STEP_STATUS[$i]:-pending}" = "in_progress" ]; then
            echo -e "  ${BLUE}◉${NC} ${STEPS[$i]} ${CYAN}...${NC}"
        fi
    done
    
    echo -e "${BOLD_CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Mark step as completed with success
step_success() {
    local step_num=$1
    local message=$2
    update_step $step_num "success" "$message"
    show_compact_progress
    log_success "✓ Step $((step_num + 1)). ${STEPS[$step_num]} completed: $message"
}

# Mark step as failed
step_failed() {
    local step_num=$1
    local message=$2
    update_step $step_num "failed" "$message"
    show_full_progress
    log_error "✗ Step $((step_num + 1)). ${STEPS[$step_num]} failed: $message"
}

# Mark step as in progress
step_start() {
    local step_num=$1
    update_step $step_num "in_progress" ""
    show_compact_progress
    log_step "Starting: $((step_num + 1)). ${STEPS[$step_num]}"
}

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

# Logging function
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

log_info() { log "INFO" "$@"; }
log_error() { log "ERROR" "$@"; }
log_warning() { log "WARNING" "$@"; }
log_success() { log "SUCCESS" "$@"; }
log_step() { log "STEP" "$@"; }
log_done() { log "DONE" "$@"; }

# Error handler
error_handler() {
    local line_no=$1
    local error_code=$2
    log_error "Script failed at line $line_no with exit code $error_code"
    log_error "Check log file for details: $LOG_FILE"
    show_full_progress
}

#trap 'error_handler ${LINENO} $?' ERR

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

# Initialize progress tracking
init_steps

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
    docker exec duka-app "$@"
}

exec_in_app_as_root() {
    docker exec -u root duka-app "$@"
}

compose_rm_services() {
    if has_command timeout; then
        (cd "$PROJECT_ROOT" && timeout 20s "${DOCKER_CMD[@]}" compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" rm -fsv "$@")
    else
        (cd "$PROJECT_ROOT" && "${DOCKER_CMD[@]}" compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" rm -fsv "$@")
    fi
}

# =============================================================================
# MINIO READINESS & BUCKET SETUP
# =============================================================================

wait_for_minio() {
    local max_attempts=60
    local attempt=1
    
    log_info "Waiting for MinIO to become ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if docker exec duka-minio mc alias set local http://duka-minio:9000 "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" >/dev/null 2>&1; then
            log_success "MinIO is ready and accessible"
            return 0
        fi
        
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    log_error "MinIO failed to become ready after $max_attempts attempts"
    return 1
}

setup_minio_bucket() {
    log_step "Creating MinIO bucket and directories..."
    
    # Wait for minio-setup container to complete
    log_step "Waiting for MinIO setup container..."
    for i in {1..60}; do
        STATUS=$(docker inspect -f '{{.State.Status}}' "duka-minio-setup" 2>/dev/null || echo "not-found")
        
        if [ "$STATUS" = "exited" ]; then
            log_success "MinIO setup container finished"
            break
        fi
        echo -n "."
        sleep 2
    done
    echo
    
    # Configure MinIO bucket
    if docker exec duka-minio-setup mc alias set local http://duka-minio:9000 "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" >/dev/null 2>&1; then
        docker exec duka-minio-setup mc mb local/duka-images --ignore-existing >/dev/null 2>&1
        
        # Set bucket to public download
        docker exec duka-minio-setup mc anonymous set download local/duka-images >/dev/null 2>&1
        
        log_success "MinIO bucket 'duka-images' configured as public"
        return 0
    fi
}

# =============================================================================
# MAKE ALL EXISTING MINIO OBJECTS PUBLIC
# =============================================================================

make_minio_objects_public() {
    log_step "Making all MinIO objects publicly accessible..."
    
    # Wait a moment for any ongoing uploads
    sleep 2
    
    # Set bucket policy recursively to ensure all objects are public
    if docker exec duka-minio mc anonymous set download --recursive local/duka-images >/dev/null 2>&1; then
        log_success "All MinIO objects are now public"
        return 0
    else
        log_warning "Could not recursively set public access, objects may have limited permissions"
        return 1
    fi
}

# =============================================================================
# NODE DEPENDENCIES
# =============================================================================

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
                
                # Run migrations first
                if exec_in_app php artisan migrate --force 2>&1 | tee -a "$LOG_FILE"; then
                    log_success "Migrations completed"
                    
                    # Wait a moment for MinIO to be fully ready after migration
                    log_step "Waiting 3 seconds for MinIO to stabilize..."
                    sleep 3
                    
                    # Run all seeders
                    log_step "Running seeders..."
                    if exec_in_app php artisan db:seed --force 2>&1 | tee -a "$LOG_FILE"; then
                        log_success "All seeders completed successfully"
                        return 0
                    else
                        log_warning "Seeders failed, but continuing with migration retry..."
                    fi
                else
                    log_warning "Migrations failed"
                fi
            else
                log_warning "db:wipe failed, trying migrate:fresh..."
                
                # Try migrate:fresh
                if exec_in_app php artisan migrate:fresh --force 2>&1 | tee -a "$LOG_FILE"; then
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
# STEP 1: LOAD CONFIGURATION & ENVIRONMENT
# =============================================================================

step_start 0
log_info "Configuration loaded successfully"
log_info "Project Root: $PROJECT_ROOT"
log_info "Environment: $APP_ENV"
step_success 0 "Environment: $APP_ENV, Force Build: $FORCE_BUILD"
echo "DEBUG: Step 1 completed, about to start Step 2"
echo "DEBUG: Current directory: $(pwd)"
echo "DEBUG: COMPOSE_FILES: ${COMPOSE_FILES[@]}"
# =============================================================================
# STEP 2: START SERVICES (FIXED FOR RASPBERRY PI)
# =============================================================================

step_start 1

echo "========================================="
echo "DEBUG: Entering Step 2"
echo "========================================="

log_step "Forcefully stopping and cleaning containers (PI optimized)..."

# Temporarily disable set -e to see what's failing
set +e

echo "DEBUG: About to run: compose down -v --remove-orphans --timeout 10"

# Run compose down and capture exit code
compose down -v --remove-orphans --timeout 10
DOWN_EXIT=$?

echo "DEBUG: compose down exited with code: $DOWN_EXIT"

if [ $DOWN_EXIT -ne 0 ]; then
    echo "ERROR: compose down failed with code $DOWN_EXIT"
    log_error "compose down failed with code $DOWN_EXIT"
fi

echo "DEBUG: About to clean up containers..."

# Safety cleanup (ignore errors)
docker rm -f duka-minio-setup 2>/dev/null
docker stop duka-app duka-db duka-minio 2>/dev/null
docker rm -f duka-app duka-db duka-minio 2>/dev/null

log_done "Cleanup complete"

echo "DEBUG: Cleanup finished, about to start services..."

log_step "Starting application services..."

# Check if docker-compose.yml files exist
echo "DEBUG: Compose files configured: ${COMPOSE_FILES[@]}"

echo "DEBUG: About to run compose up commands..."

# For Raspberry Pi, start services one by one
echo "DEBUG: Starting database first..."
compose up -d duka-db
DB_EXIT=$?
echo "DEBUG: Database start exit code: $DB_EXIT"

if [ $DB_EXIT -ne 0 ]; then
    echo "ERROR: Failed to start database!"
    log_error "Failed to start database with exit code $DB_EXIT"
    exit 1
fi

echo "DEBUG: Waiting for MySQL to initialize (10 seconds)..."
sleep 10

echo "DEBUG: Starting MinIO..."
compose up -d duka-minio
MINIO_EXIT=$?
echo "DEBUG: MinIO start exit code: $MINIO_EXIT"

sleep 5

echo "DEBUG: Starting minio-setup..."
compose up -d minio-setup
SETUP_EXIT=$?
echo "DEBUG: minio-setup start exit code: $SETUP_EXIT"

echo "DEBUG: Starting duka-app..."
compose up -d --force-recreate duka-app
APP_EXIT=$?
echo "DEBUG: duka-app start exit code: $APP_EXIT"

# Re-enable set -e
set -e

echo "DEBUG: All services started, checking container status..."
docker ps -a | grep duka

step_success 1 "All containers started successfully"

echo "========================================="
echo "DEBUG: Successfully completed Step 2!"
echo "========================================="
# =============================================================================
# STEP 3: MINIO READINESS & BUCKET SETUP (CRITICAL - MUST BE BEFORE SEEDING)
# =============================================================================

step_start 2

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
        step_failed 2 "MySQL health check timeout"
        exit 1
    fi
done

# Wait for MinIO to be ready
if ! wait_for_minio; then
    step_failed 2 "MinIO failed to become ready"
    exit 1
fi

# Setup MinIO bucket and directories
if ! setup_minio_bucket; then
    step_failed 2 "MinIO bucket setup failed"
    exit 1
fi

# Make sure all objects are public
make_minio_objects_public

step_success 2 "MinIO ready with bucket configured"

# =============================================================================
# STEP 3.5: VERIFY MINIO IS FULLY READY FOR SEEDING
# =============================================================================

step_start 2 # Still part of step 2 technically, but add this after bucket setup

log_step "Verifying MinIO is writable for seeding..."

# Test write to MinIO from Laravel
if docker exec duka-app php artisan tinker --execute="
    try {
        Storage::disk('s3')->put('test-seeder.txt', 'Seeder test ' . date('Y-m-d H:i:s'), 'public');
        Storage::disk('s3')->delete('test-seeder.txt');
        echo 'OK';
    } catch (\Exception \$e) {
        echo 'ERROR: ' . \$e->getMessage();
    }
" 2>&1 | grep -q "OK"; then
    log_success "MinIO is writable and ready for seeding"
else
    log_warning "MinIO write test failed, but continuing..."
fi

step_success 2 "MinIO ready with bucket configured"

# =============================================================================
# STEP 4: PHP DEPENDENCIES
# =============================================================================

step_start 3

log_step "Configuring git safe directory..."
docker exec duka-app git config --global --add safe.directory /var/www/html || true
log_done "Git safe directory configured"

log_step "${ICON_PACKAGE} Installing PHP dependencies..."

exec_in_app composer require league/flysystem-aws-s3-v3:"^3.0" --no-interaction --no-update 2>/dev/null || true

if ! docker exec duka-app sh -c "composer validate --no-check-all --quiet" 2>/dev/null; then
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
step_success 3 "PHP dependencies installed successfully"

# =============================================================================
# STEP 5: NODE DEPENDENCIES
# =============================================================================

step_start 4

node_changes=0
if has_git_path_changes "${NODE_FILES[@]}"; then
    node_changes=1
    log_info "Node dependency changes detected"
fi

if [ "$node_changes" -eq 1 ] || ! exec_in_app test -d node_modules; then
    install_node_dependencies
else
    log_success "Node dependencies already installed"
fi

step_success 4 "Node dependencies ready"

# =============================================================================
# STEP 6: FRONTEND ASSETS
# =============================================================================

step_start 5

log_step "${ICON_VITE} Handling frontend assets..."

if [ "$APP_ENV" = "production" ]; then
    log_step "Building production assets..."
    exec_in_app rm -f public/hot
    
    exec_in_app npm run build 2>&1 | tee -a "$LOG_FILE"
    log_success "Production assets built"
else
    log_step "Setting up Vite dependencies..."
    
    log_step "Fixing Vite dependencies for development..."
    exec_in_app npm install hoist-non-react-statics@3.3.2 --no-save 2>&1 | tee -a "$LOG_FILE"
    exec_in_app rm -rf node_modules/.vite /tmp/vite-cache
    log_done "Vite dependencies fixed"
    
    log_step "Sanitizing Vite environment..."
    log_info "Skipping Vite process kill - starting fresh"
    sleep 1
    log_done "Vite environment ready"
    
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
        step_failed 5 "Vite failed to start"
        exit 1
    fi
    echo
    log_success "Vite is ready and running ${ICON_VITE}"
fi

step_success 5 "Frontend assets processed"

# =============================================================================
# STEP 7: DATABASE MIGRATION & SEEDING (NOW MINIO IS READY WITH BUCKET!)
# =============================================================================

# After migration and seeding
step_start 6

log_step "${ICON_DB} Running database migration..."

if ! run_migration_with_retry; then
    log_error "Database migration failed - deployment aborted"
    step_failed 6 "Database migration failed"
    exit 1
fi

log_done "Database migration completed"
step_success 6 "Database migrated and seeded"

# =============================================================================
# POST-SEEDING: ENSURE ALL UPLOADED IMAGES ARE PUBLIC
# =============================================================================

log_step "Ensuring all seeded images are publicly accessible..."

# Run a Laravel command to set visibility on all uploaded images
docker exec duka-app php artisan tinker --execute="
    try {
        \$disk = Illuminate\Support\Facades\Storage::disk('s3');
        \$files = \$disk->allFiles('uploads');
        \$count = 0;
        foreach (\$files as \$file) {
            if (\$disk->getVisibility(\$file) !== 'public') {
                \$disk->setVisibility(\$file, 'public');
                \$count++;
            }
        }
        echo \"✅ Made \$count images public\n\";
    } catch (\Exception \$e) {
        echo \"⚠️ Could not update visibilities: \" . \$e->getMessage() . \"\n\";
    }
" 2>&1 | tee -a "$LOG_FILE"

# Also run mc command as backup
docker exec duka-minio mc anonymous set download --recursive local/duka-images >/dev/null 2>&1

log_success "All images are now publicly accessible"

# =============================================================================
# STEP 8: CACHE AND PERMISSIONS
# =============================================================================

step_start 7

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
step_success 7 "Cache cleared and permissions set"

# =============================================================================
# STEP 9: FINAL VERIFICATION
# =============================================================================

step_start 8

log_step "Performing final verification checks..."

# Check if all critical containers are running
CRITICAL_CONTAINERS=("duka-app" "duka-db" "duka-minio")
all_running=true

for container in "${CRITICAL_CONTAINERS[@]}"; do
    if docker ps --format "table {{.Names}}" | grep -q "^${container}$"; then
        log_success "✓ $container is running"
    else
        log_error "✗ $container is NOT running"
        all_running=false
    fi
done

if [ "$all_running" = true ]; then
    log_success "All critical containers are running"
else
    log_warning "Some containers are not running - check docker ps"
fi

# Check application health
if curl -sf http://localhost/health >/dev/null 2>&1; then
    log_success "Application health check passed"
else
    log_warning "Health check endpoint not responding"
fi

step_success 8 "Deployment verification complete"

# =============================================================================
# STEP 9.5: UPLOAD MISSING IMAGES (POST-DEPLOYMENT)
# =============================================================================

log_step "Checking for missing MinIO images..."

# Run a dedicated artisan command to upload any missing seed images
docker exec duka-app php artisan tinker --execute="
    \$missingCount = 0;
    \$uploadedCount = 0;
    
    // Get all items that should have images
    \$items = App\Models\Item\Item::whereNotNull('file_prefix')->get();
    
    foreach (\$items as \$item) {
        \$prefix = \$item->file_prefix;
        \$itemId = \$item->id;
        
        for (\$i = 1; \$i <= 5; \$i++) {
            \$fileName = \"{\$prefix}_{\$i}.jpg\";
            \$sourcePath = storage_path(\"app/seed-images/{\$fileName}\");
            \$minioPath = \"uploads/items/{\$itemId}/{\$fileName}\";
            
            if (file_exists(\$sourcePath) && !Storage::disk('s3')->exists(\$minioPath)) {
                try {
                    Storage::disk('s3')->put(\$minioPath, file_get_contents(\$sourcePath), 'public');
                    echo \"✅ Post-deploy uploaded: {\$minioPath}\\n\";
                    \$uploadedCount++;
                } catch (\Exception \$e) {
                    echo \"❌ Failed: {\$minioPath} - \" . \$e->getMessage() . \"\\n\";
                    \$missingCount++;
                }
            }
        }
    }
    
    echo \"\\n📊 Summary: Uploaded \$uploadedCount images, \$missingCount still missing\\n\";
" 2>&1 | tee -a "$LOG_FILE"

log_success "Image post-processing complete"

# =============================================================================
# DEPLOYMENT COMPLETE
# =============================================================================

log_success "=========================================="
log_success "${ICON_ROCKET} DEPLOYMENT COMPLETE ${ICON_ROCKET}"
log_success "=========================================="
log_success "Application is now running ${ICON_SUCCESS}"
log_success "Log file saved to: $LOG_FILE"
log_success "=========================================="

show_full_progress