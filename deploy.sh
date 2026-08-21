#!/bin/bash

# Track how long the deployment takes (like npm run build)
DEPLOY_START_TIME=$(date +%s)

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

# Step timing / indentation state
IN_STEP=0               # 1 while inside a step block — log() uses this to indent
CURRENT_STEP_START_TIME=0  # epoch seconds when current step started

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

# Mark step as in progress — prints the opening ┌─ header with total elapsed time
step_start() {
    local step_num=$1
    update_step "$step_num" "in_progress" ""
    CURRENT_STEP_START_TIME=$(date +%s)
    IN_STEP=1

    local total_elapsed=$(( $(date +%s) - DEPLOY_START_TIME ))
    local total_mins=$(( total_elapsed / 60 ))
    local total_secs=$(( total_elapsed % 60 ))
    local step_label="Step $((step_num + 1)): ${STEPS[$step_num]}"

    # Box-drawing header with right-aligned elapsed time
    echo ""
    echo -e "${BOLD_CYAN}┌─ ${step_label} $(printf '%.0s─' {1..20}) [${total_mins}m ${total_secs}s elapsed]${NC}"
    echo "$(echo "[$(date '+%Y-%m-%d %H:%M:%S')] [STEP] Starting: $((step_num + 1)). ${STEPS[$step_num]}")" >> "$LOG_FILE"
}

# Mark step as completed with success — prints the closing └─ footer with step time
step_success() {
    local step_num=$1
    local message=$2
    local step_elapsed=$(( $(date +%s) - CURRENT_STEP_START_TIME ))
    local step_mins=$(( step_elapsed / 60 ))
    local step_secs=$(( step_elapsed % 60 ))
    update_step "$step_num" "success" "$message"
    IN_STEP=0
    echo -e "${GREEN}└─ ✓ done in ${step_mins}m ${step_secs}s${NC}"
    echo "$(echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] ✓ Step $((step_num + 1)). ${STEPS[$step_num]} completed in ${step_mins}m ${step_secs}s: $message")" >> "$LOG_FILE"
    echo ""
}

# Mark step as failed — prints the closing └─ footer in red with step time
step_failed() {
    local step_num=$1
    local message=$2
    local step_elapsed=$(( $(date +%s) - CURRENT_STEP_START_TIME ))
    local step_mins=$(( step_elapsed / 60 ))
    local step_secs=$(( step_elapsed % 60 ))
    update_step "$step_num" "failed" "$message"
    IN_STEP=0
    echo -e "${RED}└─ ✗ failed after ${step_mins}m ${step_secs}s — ${message}${NC}"
    echo "$(echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] ✗ Step $((step_num + 1)). ${STEPS[$step_num]} failed after ${step_mins}m ${step_secs}s: $message")" >> "$LOG_FILE"
    echo ""
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

    # When inside a step block, indent terminal output under the ┌─ header
    local indent=""
    [ "${IN_STEP:-0}" = "1" ] && indent="  │  "

    # Log file always gets the full unindented timestamped line
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"

    # Terminal gets the grouped/indented view
    case "$level" in
        "INFO")
            echo -e "${indent}[$timestamp] ${BLUE}[INFO]${NC} ${ICON_INFO} $message"
            ;;
        "SUCCESS")
            echo -e "${indent}[$timestamp] ${GREEN}[SUCCESS]${NC} ${ICON_SUCCESS} $message"
            ;;
        "ERROR")
            echo -e "${indent}[$timestamp] ${RED}[ERROR]${NC} ${ICON_ERROR} $message"
            ;;
        "WARNING")
            echo -e "${indent}[$timestamp] ${YELLOW}[WARNING]${NC} ${ICON_WARNING} $message"
            ;;
        "STEP")
            echo -e "${indent}[$timestamp] ${CYAN}[STEP]${NC} ${ICON_STEP} $message"
            ;;
        "DONE")
            echo -e "${indent}[$timestamp] ${BOLD_GREEN}[DONE]${NC} ${ICON_DONE} $message"
            ;;
        *)
            echo -e "${indent}[$timestamp] [$level] $message"
            ;;
    esac
}


log_info() { log "INFO" "$@"; }
log_error() { log "ERROR" "$@"; }
log_warning() { log "WARNING" "$@"; }
log_success() { log "SUCCESS" "$@"; }
log_step() { log "STEP" "$@"; }
log_done() { log "DONE" "$@"; }

# Stream raw output from commands, indenting it for the terminal
log_stream() {
    local indent=""
    [ "${IN_STEP:-0}" = "1" ] && indent="  │  "
    while IFS= read -r line; do
        echo -e "${indent}${NC}${line}"
        echo "$line" >> "$LOG_FILE"
    done
}


# Print elapsed time in Xm Xs format (like npm run build)
elapsed_time() {
    local elapsed=$(( $(date +%s) - DEPLOY_START_TIME ))
    local mins=$(( elapsed / 60 ))
    local secs=$(( elapsed % 60 ))
    echo "${mins}m ${secs}s"
}

# Print the final "Done in Xm Xs" banner like npm
finish_banner() {
    local elapsed=$(( $(date +%s) - DEPLOY_START_TIME ))
    local mins=$(( elapsed / 60 ))
    local secs=$(( elapsed % 60 ))
    echo ""
    echo -e "${BOLD_GREEN}✨ Done in ${mins}m ${secs}s${NC}"
    echo ""
}

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
BASE_DIR="$PROJECT_ROOT/docker"

# =============================================================================
# ENVIRONMENT SELECTION & CONFIGURATION
# =============================================================================

ENVIRONMENT="$1"

if [ "$ENVIRONMENT" = "prod" ]; then
    echo "🚀 Deploying PRODUCTION environment..."
    ENV_FILE="$PROJECT_ROOT/.env.production"
    COMPOSE_FILES=(-f "$BASE_DIR/docker-compose.yml" -f "$BASE_DIR/docker-compose.prod.yml")
elif [ "$ENVIRONMENT" = "dev" ]; then
    echo "💻 Deploying DEVELOPMENT environment..."
    ENV_FILE="$PROJECT_ROOT/.env"
    COMPOSE_FILES=(-f "$BASE_DIR/docker-compose.yml" -f "$BASE_DIR/docker-compose.dev.yml")
else
    echo "❌ Please specify an environment!"
    echo "Usage: ./deploy.sh dev  OR  ./deploy.sh prod"
    exit 1
fi

# Validate target env file exists
if [ ! -f "$ENV_FILE" ]; then
    log_error "Environment file not found at: $ENV_FILE"
    exit 1
fi

# Source target env file while preserving values explicitly supplied
# by the deployment wrapper/environment.
#
# Important:
#   ./deploy-with-options.sh --observability
#   sets ENABLE_OBSERVABILITY=1 before calling this script.
#
# We must not allow .env / .env.production to overwrite that explicit
# command-line wrapper choice.

_OVERRIDE_ENABLE_OBSERVABILITY="${ENABLE_OBSERVABILITY+x}"
_OVERRIDE_ENABLE_OBSERVABILITY_VALUE="${ENABLE_OBSERVABILITY:-}"

_OVERRIDE_FORCE_BUILD="${FORCE_BUILD+x}"
_OVERRIDE_FORCE_BUILD_VALUE="${FORCE_BUILD:-}"

set -a
source "$ENV_FILE"
set +a

# Restore explicit overrides from the wrapper.
if [ "$_OVERRIDE_ENABLE_OBSERVABILITY" = "x" ]; then
    ENABLE_OBSERVABILITY="$_OVERRIDE_ENABLE_OBSERVABILITY_VALUE"
fi

if [ "$_OVERRIDE_FORCE_BUILD" = "x" ]; then
    FORCE_BUILD="$_OVERRIDE_FORCE_BUILD_VALUE"
fi

unset _OVERRIDE_ENABLE_OBSERVABILITY
unset _OVERRIDE_ENABLE_OBSERVABILITY_VALUE
unset _OVERRIDE_FORCE_BUILD
unset _OVERRIDE_FORCE_BUILD_VALUE

# Resolve container names from COMPOSE_PROJECT_NAME so dev and prod stacks
# never collide. These variables are used throughout the rest of the script.
APP_CONTAINER="${COMPOSE_PROJECT_NAME:-duka}-app"
DB_CONTAINER="${COMPOSE_PROJECT_NAME:-duka}-db"
MINIO_CONTAINER="${COMPOSE_PROJECT_NAME:-duka}-minio"
MINIO_SETUP_CONTAINER="${COMPOSE_PROJECT_NAME:-duka}-minio-setup"

# Log deployment start
log_success "=========================================="
log_success "${ICON_ROCKET} DEPLOYMENT STARTED ${ICON_ROCKET}"
log_success "=========================================="
log_info "Project Root: $PROJECT_ROOT"
log_info "Environment: ${APP_ENV:-not set}"
log_info "Compose Project: ${COMPOSE_PROJECT_NAME:-default}"
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

# Default to skipping the database reset
SKIP_DB_RESET=1

for arg in "${@:2}"; do
    case $arg in
        -r|--reset-db)
            SKIP_DB_RESET=0
            ;;
        --no-reset|--skip-reset|--no-seed)
            SKIP_DB_RESET=1
            ;;
    esac
done    

# Load from .env but ignore any accidental RESET_DB=1 settings unless flags are used
APP_ENV="${APP_ENV:-}"
RESET_DB="${RESET_DB:-0}"

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

# COMPOSE_FILES array was already set during environment selection above.
# Add observability overlay if enabled.
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
    docker exec "$APP_CONTAINER" "$@"
}

exec_in_app_as_root() {
    docker exec -u root "$APP_CONTAINER" "$@"
}

# Wait until the app container is in 'running' state (not created/restarting)
wait_for_app_container() {
    local max_attempts=60
    local attempt=1
    log_step "Waiting for app container to be in running state..."
    while [ $attempt -le $max_attempts ]; do
        local status
        status=$(docker inspect -f '{{.State.Status}}' "$APP_CONTAINER" 2>/dev/null || echo "not-found")
        if [ "$status" = "running" ]; then
            log_success "App container is running"
            return 0
        fi
        if [ "$status" = "exited" ] || [ "$status" = "dead" ]; then
            log_error "App container exited unexpectedly (status: $status)"
            docker logs "$APP_CONTAINER" 2>&1 | tail -30 | log_stream
            return 1
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    log_error "App container did not reach running state after ${max_attempts} attempts"
    docker logs "$APP_CONTAINER" 2>&1 | tail -30 | log_stream
    return 1
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
        if docker exec "$MINIO_CONTAINER" \
        mc ls local >/dev/null 2>&1
        then
            log_success "MinIO is ready and authenticated"
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
        STATUS=$(docker inspect -f '{{.State.Status}}' "$MINIO_SETUP_CONTAINER" 2>/dev/null || echo "not-found")
        
        if [ "$STATUS" = "exited" ]; then
            log_success "MinIO setup container finished"
            break
        fi
        echo -n "."
        sleep 2
    done
    echo
    
    # Configure MinIO bucket
    if [ "$STATUS" = "exited" ]; then
        EXIT_CODE=$(docker inspect -f '{{.State.ExitCode}}' "$MINIO_SETUP_CONTAINER")

        if [ "$EXIT_CODE" = "0" ]; then
            log_success "MinIO bucket configured"
            return 0
        else
            log_error "MinIO setup failed"
            docker logs "$MINIO_SETUP_CONTAINER"
            return 1
        fi
    fi
}

# =============================================================================
# MAKE ALL EXISTING MINIO OBJECTS PUBLIC
# =============================================================================

make_minio_objects_public() {
    log_step "Making all MinIO objects publicly accessible..."

    sleep 2

    # The minio-setup container already exited (restart: "no"), so spin up a
    # fresh temporary mc container.
    # KEY POINTS:
    #   1. --entrypoint /bin/sh  because minio/mc sets `mc` as its ENTRYPOINT
    #   2. Use service name `duka-minio` (Docker DNS), NOT the container name
    #   3. Pass credentials and bucket as -e vars so no shell quoting nightmares
    local MC_OUTPUT
    MC_OUTPUT=$(docker run --rm \
        --entrypoint /bin/sh \
        --network "${COMPOSE_PROJECT_NAME:-duka}_duka-network" \
        -e MC_HOST_local="http://${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}@duka-minio:9000" \
        -e BUCKET="${AWS_BUCKET}" \
        minio/mc:latest \
        -c 'mc anonymous set download local/$BUCKET' 2>&1)

    if [ $? -eq 0 ]; then
        log_success "MinIO bucket is publicly accessible"
        return 0
    else
        log_warning "Could not set public access: $MC_OUTPUT"
        return 1
    fi
}

# =============================================================================
# NODE DEPENDENCIES
# =============================================================================

install_node_dependencies() {
    log_step "Installing Node dependencies from lock file..."
    exec_in_app npm install --no-audit --no-fund --loglevel=info 2>&1 | log_stream

    # Fix for hoist-non-react-statics on Raspberry Pi (ARM)
    if [ "$APP_ENV" != "production" ]; then
        log_step "Fixing hoist-non-react-statics for ARM/Raspberry Pi..."
        exec_in_app npm uninstall hoist-non-react-statics --no-save 2>&1 | log_stream || true
        exec_in_app npm install hoist-non-react-statics@3.3.2 --no-save 2>&1 | log_stream
        exec_in_app rm -rf node_modules/.vite /tmp/vite-cache
        # npm rebuild can exit non-zero on ARM even when it succeeds; use || true
        exec_in_app npm rebuild 2>&1 | log_stream || true
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
            if exec_in_app php artisan db:wipe --force 2>&1 | log_stream; then
                log_success "Database wiped successfully"
                
                # Run migrations first
                if exec_in_app php artisan migrate --force 2>&1 | log_stream; then
                    log_success "Migrations completed"
                    
                    # Wait a moment for MinIO to be fully ready after migration
                    log_step "Waiting 3 seconds for MinIO to stabilize..."
                    sleep 3
                    
                    # Run all seeders
                    log_step "Running seeders..."
                    if exec_in_app php artisan db:seed --force 2>&1 | log_stream; then
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
                if exec_in_app php artisan migrate:fresh --force 2>&1 | log_stream; then
                    log_success "Migration and seeding completed successfully"
                    return 0
                fi
            fi
        else
            log_info "Skipping database reset, running incremental migrations..."
            if exec_in_app php artisan migrate --force 2>&1 | log_stream; then
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

# =============================================================================
# STEP 2: START SERVICES (FIXED FOR RASPBERRY PI)
# =============================================================================

step_start 1

log_step "Forcefully stopping and cleaning containers (PI optimized)..."

# Temporarily disable set -e while bringing services down
set +e

log_info "Running: compose down --remove-orphans --timeout 10"

# We use plain 'down' (no -v) to preserve database data between deploys
compose down --remove-orphans --timeout 10
DOWN_EXIT=$?

if [ $DOWN_EXIT -ne 0 ]; then
    log_warning "compose down exited with code $DOWN_EXIT — continuing cleanup"
fi

log_info "Cleaning up any remaining containers..."

# Safety cleanup — stop/remove THIS namespace's containers, plus legacy bare-named
# ones for the one-time migration away from the old un-namespaced setup.
docker rm -f "$MINIO_SETUP_CONTAINER" duka-minio-setup 2>/dev/null || true
docker stop "$APP_CONTAINER" "$DB_CONTAINER" "$MINIO_CONTAINER" \
             duka-app duka-db duka-minio 2>/dev/null || true
docker rm -f "$APP_CONTAINER" "$DB_CONTAINER" "$MINIO_CONTAINER" \
             duka-app duka-db duka-minio 2>/dev/null || true
log_done "Cleanup complete"

log_step "Starting application services..."

# For Raspberry Pi, start services one by one
log_info "Starting database first..."
compose up -d duka-db
DB_EXIT=$?
log_info "Database start exit code: $DB_EXIT"

if [ $DB_EXIT -ne 0 ]; then
    log_error "Failed to start database with exit code $DB_EXIT"
    exit 1
fi

log_info "Waiting for MySQL to initialize (10 seconds)..."
sleep 10

log_info "Starting MinIO..."
compose up -d duka-minio
MINIO_EXIT=$?
log_info "MinIO start exit code: $MINIO_EXIT"

sleep 5

log_info "Starting minio-setup..."
compose up -d minio-setup
SETUP_EXIT=$?
log_info "minio-setup start exit code: $SETUP_EXIT"

log_info "Starting duka-app..."
if ! compose up -d --force-recreate duka-app; then
    log_error "Failed to start duka-app container. Exit code: $?"
    log_error "Check port conflicts and container logs:"
    docker logs "$APP_CONTAINER" 2>&1 | tail -30 | log_stream
    exit 1
fi

# Verify the container is actually running
sleep 2
if [ "$(docker inspect -f '{{.State.Status}}' "$APP_CONTAINER" 2>/dev/null)" != "running" ]; then
    log_error "Container $APP_CONTAINER is not running. Aborting."
    docker logs "$APP_CONTAINER" 2>&1 | tail -30 | log_stream
    exit 1
fi

# =============================================================================
# UPDATED OBSERVABILITY BLOCK: Run Migrations & Setup Superuser
# =============================================================================
if [ "$ENABLE_OBSERVABILITY" = "1" ]; then
    log_step "Running GlitchTip database migrations..."
    if compose -f "$BASE_DIR/docker-compose.observability.yml" run --rm glitchtip-migrate; then
        log_success "GlitchTip database migrations completed successfully"
    else
        log_error "GlitchTip database migrations failed"
        exit 1
    fi
    
    log_step "Ensuring GlitchTip superuser exists..."
    if compose --env-file "$ENV_FILE" -f "$BASE_DIR/docker-compose.yml" -f "$BASE_DIR/docker-compose.observability.yml" run --rm glitchtip-web python manage.py createsuperuser --noinput 2>&1 | log_stream; then
        log_success "GlitchTip superuser created successfully"
    else
        log_info "Superuser already exists, proceeding..."
    fi

    log_info "Starting remaining observability services (GlitchTip web/worker, LGTM)..."
    compose -f "$BASE_DIR/docker-compose.observability.yml" up -d
fi
# =============================================================================

log_success "App container started successfully"

log_step "Waiting for app container to be ready before pre-creating storage..."
wait_for_app_container

log_step "Pre-creating storage structures to prevent Blade cache errors..."
exec_in_app mkdir -p storage/framework/sessions storage/framework/views storage/framework/cache/data storage/app/seed-images public/images/defaults storage/logs
exec_in_app touch storage/logs/laravel.log
exec_in_app chown -R 33:33 storage bootstrap/cache public/images
exec_in_app chmod -R 775 storage bootstrap/cache public/images
log_done "Pre-deployment storage structures are ready"

# Re-enable set -e
set -e

log_info "All services started — current container status:"
docker ps -a | grep duka | log_stream

step_success 1 "All containers started successfully"


# =============================================================================
# STEP 3: MINIO READINESS & BUCKET SETUP (CRITICAL - MUST BE BEFORE SEEDING)
# =============================================================================

step_start 2

log_step "Waiting for MySQL to be healthy..."
for i in {1..30}; do
    STATUS=$(docker inspect -f '{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null)
    
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

# Configure bucket
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
if docker exec "$APP_CONTAINER" php artisan tinker --execute="
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
docker exec "$APP_CONTAINER" git config --global --add safe.directory /var/www/html || true
log_done "Git safe directory configured"

log_step "${ICON_PACKAGE} Installing PHP dependencies..."

# Set composer install flags based on environment
if [ "$APP_ENV" = "production" ]; then
    INSTALL_FLAGS="--no-dev --optimize-autoloader --no-interaction"
    log_info "Production mode: Installing without dev dependencies"
else
    INSTALL_FLAGS="--optimize-autoloader --no-interaction"
    log_info "Development mode: Installing with dev dependencies"
fi

# 1. Require the S3 Driver package without updating yet
exec_in_app composer require league/flysystem-aws-s3-v3:^3.0 --no-interaction --no-update 2>/dev/null || true

# 2. Check if composer.lock is valid using a standalone check
if ! exec_in_app composer validate --no-check-all --quiet 2>/dev/null; then
    log_warning "Composer lock file out of sync, updating package tracking..."
    exec_in_app composer update league/flysystem-aws-s3-v3 --no-interaction 2>&1 | log_stream
fi

# 3. Perform the clean master dependency installation
exec_in_app composer install $INSTALL_FLAGS 2>&1 | log_stream

# Define files path
S3_CONVERTER_FILE="vendor/league/flysystem-aws-s3-v3/src/PortableVisibilityConverter.php"

# Detect if we need to run composer (vendor is empty, file missing, or lockfile changed)
if [ ! -d "vendor" ] || [ ! -f "$S3_CONVERTER_FILE" ] || has_git_path_changes "composer.lock"; then
    log_warning "Dependencies are missing or composer.lock changed. Pre-populating vendor directory..."

    # Define composition flags
    COMPOSE_CMD="composer install --optimize-autoloader --no-interaction"
    if [ "$APP_ENV" = "production" ]; then
        log_info "Production mode: Installing without dev dependencies"
        COMPOSE_CMD="composer install --no-dev --optimize-autoloader --no-interaction"
    fi

    # Run inside the container
    exec_in_app $COMPOSE_CMD 2>&1 | log_stream
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

# Also check the vite binary exists — node_modules dir can exist but be incomplete
# (e.g. after a failed previous deploy or a fresh container with a mounted volume)
if ! exec_in_app test -f node_modules/.bin/vite; then
    log_warning "node_modules/.bin/vite missing — forcing full install"
    node_changes=1
fi

if [ "$node_changes" -eq 1 ] || ! exec_in_app test -d node_modules; then
    install_node_dependencies
else
    log_success "Node dependencies already installed and complete"
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
    
    exec_in_app npm run build 2>&1 | log_stream
    log_success "Production assets built"
else
    log_step "Cleaning up production assets for development mode..."
    exec_in_app rm -rf public/build

    log_step "Checking Vite dependencies..."
    # Only run install if node_modules is missing or package.json changed
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        log_info "Installing fresh dependencies..."
        docker exec "$APP_CONTAINER" bash -lc 'npm ci --no-audit --no-fund'
    else
        log_info "Dependencies already up to date, skipping install."
    fi

    # Pre-flight: ensure vite binary exists — force reinstall if missing
    if ! exec_in_app test -f node_modules/.bin/vite; then
        log_warning "Vite binary not found in node_modules/.bin — running npm install to fix..."
        docker exec "$APP_CONTAINER" bash -lc 'npm install --no-audit --no-fund' 2>&1 | log_stream
    fi

    exec_in_app rm -rf node_modules/.vite /tmp/vite-cache
    log_done "Vite dependencies checked"

    log_step "Fixing esbuild architecture for Docker..."
    # esbuild v0.17+ removed install.js — npm rebuild re-links the correct native binary
    exec_in_app npm rebuild esbuild 2>&1 | log_stream || true
    sleep 1
    log_done "Vite environment ready"

    log_step "Launching Vite in background..."
    # Use bash (not sh/dash) so node_modules/.bin is on PATH via npm run
    # docker exec -d is already detached — no & needed
    docker exec -d "$APP_CONTAINER" bash -lc 'npm run dev -- --host 0.0.0.0 --force >/tmp/vite.log 2>&1'
    log_done "Vite launch command issued"

    log_step "Waiting for Vite to become ready..."
    if ! exec_in_app sh -c '
        i=1
        while [ $i -le 120 ]; do
            if curl -sf http://127.0.0.1:5177/@vite/client >/dev/null 2>&1; then
                exit 0
            fi
            printf "."
            sleep 1
            i=$((i + 1))
        done
        exit 1
    '; then
        echo
        log_error "Vite failed to start. Last 20 lines of /tmp/vite.log:"
        exec_in_app cat /tmp/vite.log 2>/dev/null | tail -20 | log_stream
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
docker exec "$APP_CONTAINER" php artisan tinker --execute="
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
" 2>&1 | log_stream

# Also ensure all bucket objects are public via a fresh mc container.
# Uses MC_HOST_local env var (no alias setup needed, avoids shell quoting issues).
docker run --rm \
    --entrypoint /bin/sh \
    --network "${COMPOSE_PROJECT_NAME:-duka}_duka-network" \
    -e MC_HOST_local="http://${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}@duka-minio:9000" \
    -e BUCKET="${AWS_BUCKET}" \
    minio/mc:latest \
    -c 'mc anonymous set download --recursive local/$BUCKET' 2>&1 | log_stream || true

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
exec_in_app php artisan cache:clear 2>&1 | log_stream
exec_in_app php artisan config:clear 2>&1 | log_stream
exec_in_app php artisan route:clear 2>&1 | log_stream
exec_in_app php artisan view:clear 2>&1 | log_stream
exec_in_app php artisan event:clear 2>&1 | log_stream
exec_in_app php artisan optimize:clear 2>&1 | log_stream
log_done "Laravel caches purged"

log_step "Refreshing Laravel optimizations..."
exec_in_app php artisan optimize:clear || true
exec_in_app php artisan storage:link --force

if [ "$APP_ENV" = "production" ]; then
    exec_in_app php artisan optimize 2>&1 | log_stream
else
    exec_in_app php artisan config:clear 2>&1 | log_stream
    exec_in_app php artisan route:clear 2>&1 | log_stream
    exec_in_app php artisan view:clear 2>&1 | log_stream || echo "View cache clear skipped"
fi

log_done "Laravel optimizations refreshed"
step_success 7 "Cache cleared and permissions set"

# =============================================================================
# STEP 9: FINAL VERIFICATION
# =============================================================================

step_start 8

log_step "Performing final verification checks..."

# Check if all critical containers are running
CRITICAL_CONTAINERS=("$APP_CONTAINER" "$DB_CONTAINER" "$MINIO_CONTAINER")
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
docker exec "$APP_CONTAINER" php artisan tinker --execute="
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
" 2>&1 | log_stream

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

finish_banner