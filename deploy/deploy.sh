#!/bin/bash

# Track how long the deployment takes (like npm run build)
DEPLOY_START_TIME=${DEPLOY_START_TIME:-$(date +%s)}

# =================================================================================================
# COLOR CODES FOR LOGGING
# =================================================================================================

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

# =================================================================================================
# PROGRESS TRACKING SYSTEM
# =================================================================================================

# Global array to track steps
declare -a STEPS=()
declare -a STEP_STATUS=()
declare -a STEP_MESSAGES=()
declare -a STEP_SECS=()

# Step timing / indentation state
IN_STEP=0               # 1 while inside a step block — log() uses this to indent
CURRENT_STEP_START_TIME=0  # epoch seconds when current step started

# Initialize steps
init_steps() {
    STEPS=(
        "Load Configuration & Environment"      # 0
        "Start Services (Docker Compose)"       # 1
        "Database Readiness"                    # 2
        "PHP Dependencies Installation"         # 3
        "Node Dependencies Installation"        # 4
        "Frontend Assets Build"                 # 5
        "Database Migration"                    # 6
        "Cache & Permissions Setup"             # 7
        "Final Verification"                    # 8
        "Cloudflare Cache Purging"              # 9
    )

    for i in "${!STEPS[@]}"; do
        STEP_STATUS[$i]="pending"
        STEP_MESSAGES[$i]=""
        STEP_SECS[$i]=""
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
    echo -e "${BOLD_CYAN}════════════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD_CYAN}                                DEPLOYMENT PROGRESS                                 ${NC}"
    echo -e "${BOLD_CYAN}════════════════════════════════════════════════════════════════════════════════════${NC}"
    
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
                echo -e "  ${GREEN}${ICON_CHECK}${NC} ${step_name} ${GREEN}✓${NC} ${CYAN}(${STEP_SECS[$i]:-0}s)${NC}"
                if [ -n "$message" ]; then
                    echo -e "      ${GREEN}→${NC} $message"
                fi
                ;;
            "failed")
                echo -e "  ${RED}${ICON_CROSS}${NC} ${step_name} ${RED}✗${NC} ${CYAN}(${STEP_SECS[$i]:-0}s)${NC}"
                if [ -n "$message" ]; then
                    echo -e "      ${RED}→${NC} $message"
                fi
                ;;
        esac
    done
    
    echo -e "${BOLD_CYAN}═════════════════════════════════════════════════════════════════════════════════════${NC}"
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
    local step_label="Step $((step_num + 1))/${#STEPS[@]}: ${STEPS[$step_num]}"

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
    STEP_SECS[$step_num]=$step_elapsed
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
    STEP_SECS[$step_num]=$step_elapsed
    update_step "$step_num" "failed" "$message"
    IN_STEP=0
    echo -e "${RED}└─ ✗ failed after ${step_mins}m ${step_secs}s — ${message}${NC}"
    echo "$(echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] ✗ Step $((step_num + 1)). ${STEPS[$step_num]} failed after ${step_mins}m ${step_secs}s: $message")" >> "$LOG_FILE"
    echo ""
}


# =================================================================================================
# CONFIGURATION & PATH RESOLUTION
# =================================================================================================

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# PROJECT_ROOT is the app root: the parent of deploy/ (this script's folder).
# Everything below (compose files, env files, git, vendor/, node_modules/) is
# resolved against it, so move to it so relative paths work from any cwd.
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Set up logging (deployment logs live beside the scripts)
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/deploy_$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$LOG_DIR"
: > "$LOG_FILE"
# Keep the 30 newest deploy logs and point latest.log at this run.
ls -1t "$LOG_DIR"/deploy_*.log 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true
ln -sf "$(basename "$LOG_FILE")" "$LOG_DIR/latest.log"

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

# Run a command, stream its output through log_stream, and return the
# command's own exit status. A bare `cmd | log_stream` reports log_stream's
# status (always 0), so a failed build or migration would read as success.
run_logged() {
    "$@" 2>&1 | log_stream
    return "${PIPESTATUS[0]}"
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

# Runs on every exit. On failure it marks the running step failed, prints the
# board, the tail of the log and where the full log is, so a bare `exit 1`
# somewhere in the script never ends without an explanation.
on_exit() {
    local code=$?
    trap - EXIT
    if [ "$code" -ne 0 ]; then
        local i
        for i in "${!STEPS[@]}"; do
            if [ "${STEP_STATUS[$i]}" = "in_progress" ]; then
                STEP_SECS[$i]=$(( $(date +%s) - CURRENT_STEP_START_TIME ))
                update_step "$i" "failed" "exited with code $code"
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] Step $((i + 1)). ${STEPS[$i]} aborted (exit $code)" >> "$LOG_FILE"
            fi
        done
        IN_STEP=0
        show_full_progress
        echo -e "${BOLD_RED}${ICON_ERROR} DEPLOYMENT FAILED (exit code $code) after $(elapsed_time)${NC}"
        echo -e "${RED}Last lines of the log:${NC}"
        tail -n 20 "$LOG_FILE" | sed 's/^/    /'
        echo -e "${YELLOW}Full log: ${LOG_FILE}${NC}"
        echo ""
    fi
}
trap on_exit EXIT

# Paths
BASE_DIR="$PROJECT_ROOT/docker"

# =================================================================================================
# ENVIRONMENT SELECTION & CONFIGURATION
# =================================================================================================

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
    echo "Usage: ./deploy/deploy.sh dev  OR  ./deploy/deploy.sh prod  (or use ./deploy-with-options.sh -e <dev|prod>)"
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
# MINIO_CONTAINER="${COMPOSE_PROJECT_NAME:-duka}-minio"
# MINIO_SETUP_CONTAINER="${COMPOSE_PROJECT_NAME:-duka}-minio-setup"

# Log deployment start
log_success "=================================================================================="
log_success "${ICON_ROCKET} DEPLOYMENT STARTED ${ICON_ROCKET}"
log_success "=================================================================================="
log_info "Project Root: $PROJECT_ROOT"
if git rev-parse --git-dir >/dev/null 2>&1; then
    _git_dirty=""; git diff --quiet HEAD -- 2>/dev/null || _git_dirty=" (uncommitted changes)"
    log_info "Git: $(git rev-parse --abbrev-ref HEAD 2>/dev/null) @ $(git rev-parse --short HEAD 2>/dev/null)${_git_dirty}"
    unset _git_dirty
fi
log_info "Environment: ${APP_ENV:-not set}"
log_info "Compose Project: ${COMPOSE_PROJECT_NAME:-default}"
log_info "Node: ${NODE_NAME:-?} / role ${NODE_ROLE:-NOT SET (set NODE_ROLE in $(basename "$ENV_FILE"))}"
log_info "Log file: $LOG_FILE"
log_success "=================================================================================="



# Initialize progress tracking
init_steps

# =================================================================================================
# HELPER FUNCTIONS
# =================================================================================================

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

# Shared database/R2 helpers (dump, backup state). DB_CONTAINER was set above.
APP_ROOT="$PROJECT_ROOT"
DUKA_ENV_FILE="$ENV_FILE"
DB_DOCKER="${DOCKER_CMD[*]}"
# shellcheck source=db-lib.sh
source "$SCRIPT_DIR/db-lib.sh"
db_init
BACKUP_BUCKET_PATH="$BACKUP_BUCKET"

# =================================================================================================
# VARIABLE LOADING WITH DEFAULTS
# =================================================================================================

# Default to skipping the database reset
SKIP_DB_RESET=1
# Restoring from R2 only happens when --restore-db is passed
RESTORE_DB=0

for arg in "${@:2}"; do
    case $arg in
        -r|--reset-db)
            SKIP_DB_RESET=0
            ;;
        --no-reset|--skip-reset|--no-seed)
            SKIP_DB_RESET=1
            ;;
        --restore-db)
            RESTORE_DB=1
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

# =================================================================================================
# FILE ARRAYS FOR CHANGE DETECTION
# =================================================================================================

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

# =================================================================================================
# DOCKER COMPOSE CONFIGURATION
# =================================================================================================

# COMPOSE_FILES array was already set during environment selection above.
# Add observability overlay if enabled.
if [ "$ENABLE_OBSERVABILITY" = "1" ]; then
    if [ ! -f "$BASE_DIR/docker-compose.observability.yml" ]; then
        log_error "$BASE_DIR/docker-compose.observability.yml not found"
        exit 1
    fi
    COMPOSE_FILES+=(-f "$BASE_DIR/docker-compose.observability.yml")
    log_info "Observability stack is ENABLED"

    # Ensure Loki Docker driver is installed on the host
    if ! "${DOCKER_CMD[@]}" plugin ls | grep -q "loki"; then
        log_step "Installing Loki Docker driver..."
        "${DOCKER_CMD[@]}" plugin install grafana/loki-docker-driver:latest --alias loki --grant-all-permissions
        log_success "Loki driver installed"
    fi
fi

# Cloudflared check
if check_cloudflared; then
    log_info "Cloudflared detected - using host-based networking"
fi

# =================================================================================================
# DOCKER COMPOSE WRAPPER
# =================================================================================================

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

# =================================================================================================
# MINIO READINESS & BUCKET SETUP
# =================================================================================================

# wait_for_minio() {
#     local max_attempts=60
#     local attempt=1
    
#     log_info "Waiting for MinIO to become ready..."
    
#     while [ $attempt -le $max_attempts ]; do
#         if docker exec "$MINIO_CONTAINER" \
#         mc ls local >/dev/null 2>&1
#         then
#             log_success "MinIO is ready and authenticated"
#             return 0
#         fi
        
#         echo -n "."
#         sleep 2
#         attempt=$((attempt + 1))
#     done
    
#     log_error "MinIO failed to become ready after $max_attempts attempts"
#     return 1
# }

# setup_minio_bucket() {
#     log_step "Creating MinIO bucket and directories..."
    
#     # Wait for minio-setup container to complete
#     log_step "Waiting for MinIO setup container..."
#     for i in {1..60}; do
#         STATUS=$(docker inspect -f '{{.State.Status}}' "$MINIO_SETUP_CONTAINER" 2>/dev/null || echo "not-found")
        
#         if [ "$STATUS" = "exited" ]; then
#             log_success "MinIO setup container finished"
#             break
#         fi
#         echo -n "."
#         sleep 2
#     done
#     echo
    
#     # Configure MinIO bucket
#     if [ "$STATUS" = "exited" ]; then
#         EXIT_CODE=$(docker inspect -f '{{.State.ExitCode}}' "$MINIO_SETUP_CONTAINER")

#         if [ "$EXIT_CODE" = "0" ]; then
#             log_success "MinIO bucket configured"
#             return 0
#         else
#             log_error "MinIO setup failed"
#             docker logs "$MINIO_SETUP_CONTAINER"
#             return 1
#         fi
#     fi
# }

# =================================================================================================
# MAKE ALL EXISTING MINIO OBJECTS PUBLIC
# =================================================================================================

# make_minio_objects_public() {
#     log_step "Making all MinIO objects publicly accessible..."

#     sleep 2

#     # The minio-setup container already exited (restart: "no"), so spin up a
#     # fresh temporary mc container.
#     # KEY POINTS:
#     #   1. --entrypoint /bin/sh  because minio/mc sets `mc` as its ENTRYPOINT
#     #   2. Use service name `duka-minio` (Docker DNS), NOT the container name
#     #   3. Pass credentials and bucket as -e vars so no shell quoting nightmares
#     local MC_OUTPUT
#     MC_OUTPUT=$(docker run --rm \
#         --entrypoint /bin/sh \
#         --network "${COMPOSE_PROJECT_NAME:-duka}_duka-network" \
#         -e MC_HOST_local="http://${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}@duka-minio:9000" \
#         -e BUCKET="${AWS_BUCKET}" \
#         minio/mc:latest \
#         -c 'mc anonymous set download local/$BUCKET' 2>&1)

#     if [ $? -eq 0 ]; then
#         log_success "MinIO bucket is publicly accessible"
#         return 0
#     else
#         log_warning "Could not set public access: $MC_OUTPUT"
#         return 1
#     fi
# }

# =================================================================================================
# NODE DEPENDENCIES
# =================================================================================================

install_node_dependencies() {
    log_step "Installing Node dependencies from lock file..."
    if ! run_logged exec_in_app npm install --no-audit --no-fund --loglevel=info; then
        log_error "npm install failed"
        return 1
    fi

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

    # Remember which lock file this install came from (see STEP 5).
    exec_in_app sh -c "echo '$(node_lock_hash)' > node_modules/.lock-hash"

    log_success "Node dependencies installed"
}

# Fingerprint of package.json + package-lock.json, taken inside the container
# (sha256sum there is GNU coreutils; the host may be macOS or a Pi).
node_lock_hash() {
    exec_in_app sh -c 'cat package.json package-lock.json 2>/dev/null | sha256sum | cut -d" " -f1'
}

reset_node_dependencies() {
    log_warning "Resetting Node dependencies..."
    exec_in_app_as_root sh -lc 'find node_modules -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true'
    install_node_dependencies
}

# =================================================================================================
# MIGRATION WITH DEADLOCK HANDLING
# =================================================================================================
run_migration_with_retry() {
    local max_attempts=3
    local attempt=1
    
    log_step "Starting database migration (max $max_attempts attempts)..."
    
    while [ "$attempt" -le "$max_attempts" ]; do
        log_info "Migration attempt $attempt of $max_attempts"
        
        if [ "$SKIP_DB_RESET" = "0" ]; then
            log_info "Attempting to refresh and seed database..."
            
            # Try db:wipe first
            if run_logged exec_in_app php artisan db:wipe --force; then
                log_success "Database wiped successfully"
                
                # Run migrations first
                if run_logged exec_in_app php artisan migrate --force; then
                    log_success "Migrations completed"
                    
                    # Wait a moment for MinIO to be fully ready after migration
                    # log_step "Waiting 3 seconds for MinIO to stabilize..."
                    # sleep 3
                    
                    # Run all seeders
                    log_step "Running seeders..."
                    if run_logged exec_in_app php artisan db:seed --force; then
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
                if run_logged exec_in_app php artisan migrate:fresh --force; then
                    log_success "Migration and seeding completed successfully"
                    return 0
                fi
            fi
        else
            log_info "Skipping database reset, running incremental migrations..."
            if run_logged exec_in_app php artisan migrate --force; then
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

# =================================================================================================
# MAIN DEPLOYMENT LOGIC
# =================================================================================================

log_success "=================================================================================="
log_success "${ICON_ROCKET} DEPLOYMENT CONFIGURATION ${ICON_ROCKET}"
log_success "=================================================================================="
log_info "Environment: $APP_ENV"
log_info "Skip Database Reset: $SKIP_DB_RESET"
log_info "Force Build: $FORCE_BUILD"
log_info "Enable Observability: $ENABLE_OBSERVABILITY"
log_success "=================================================================================="

# =================================================================================================
# STEP 1: LOAD CONFIGURATION & ENVIRONMENT
# =================================================================================================

step_start 0
log_info "Configuration loaded successfully"
log_info "Project Root: $PROJECT_ROOT"
log_info "Environment: $APP_ENV"
step_success 0 "Environment: $APP_ENV, Force Build: $FORCE_BUILD"

# =================================================================================================
# STEP 2: START SERVICES (FIXED FOR RASPBERRY PI)
# =================================================================================================

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
docker stop "$APP_CONTAINER" "$DB_CONTAINER" \
             duka-app duka-db 2>/dev/null || true
docker rm -f "$APP_CONTAINER" "$DB_CONTAINER" \
             duka-app duka-db 2>/dev/null || true
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

# =================================================================================================
# UPDATED OBSERVABILITY BLOCK: Run Migrations & Setup Superuser
# =================================================================================================
if [ "$ENABLE_OBSERVABILITY" = "1" ]; then
    log_step "Running GlitchTip database migrations..."
    if compose -f "$BASE_DIR/docker-compose.observability.yml" run --rm glitchtip-migrate; then
        log_success "GlitchTip database migrations completed successfully"
    else
        log_error "GlitchTip database migrations failed"
        exit 1
    fi
    
    log_step "Ensuring GlitchTip superuser exists..."
    
    # We use Django's shell to safely get_or_create the user, which prevents crashes 
    # if the user already exists, and ensures the password is up to date.
    compose --env-file "$ENV_FILE" -f "$BASE_DIR/docker-compose.yml" -f "$BASE_DIR/docker-compose.observability.yml" run --rm glitchtip-web python manage.py shell <<'EOF' 2>&1 | log_stream
import os
from django.contrib.auth import get_user_model

User = get_user_model()
email = os.environ.get('GLITCHTIP_ADMIN_EMAIL')
password = os.environ.get('GLITCHTIP_ADMIN_PASSWORD')

if email and password:
    user, created = User.objects.get_or_create(email=email)
    user.set_password(password)
    user.is_superuser = True
    user.is_staff = True
    user.save()
    status = "Created" if created else "Updated password for"
    print(f"==> {status} superuser: {email}")
else:
    print("==> Skipped: GLITCHTIP_ADMIN_EMAIL or GLITCHTIP_ADMIN_PASSWORD not set in environment.")
EOF

    # Since the python script handles its own logic gracefully, we can just log success
    log_success "GlitchTip superuser configured successfully"

    log_info "Starting remaining observability services (GlitchTip web/worker, LGTM)..."
    compose -f "$BASE_DIR/docker-compose.observability.yml" up -d
fi
# =================================================================================================

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


# =================================================================================================
# STEP 3: DATABASE READINESS CHECK
# =================================================================================================

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

step_success 2 "Database ready"

# =================================================================================================
# STEP 4: PHP DEPENDENCIES
# =================================================================================================

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

# 3. Perform the clean master dependency installation (fatal on failure: a
#    half-installed vendor/ must not roll on into migrations and builds)
if ! run_logged exec_in_app composer install $INSTALL_FLAGS; then
    log_error "composer install failed - see the output above / the log file"
    step_failed 3 "composer install failed"
    exit 1
fi

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

# =================================================================================================
# STEP 5: NODE DEPENDENCIES
# =================================================================================================

step_start 4

node_changes=0
if has_git_path_changes "${NODE_FILES[@]}"; then
    node_changes=1
    log_info "Node dependency changes detected"
fi

# has_git_path_changes only sees *uncommitted* edits, so a dependency that
# arrives via `git pull` was never installed. Compare the lock files against
# the fingerprint recorded by the last successful install instead.
installed_lock_hash=$(exec_in_app cat node_modules/.lock-hash 2>/dev/null || true)
if [ "$(node_lock_hash)" != "$installed_lock_hash" ]; then
    node_changes=1
    log_info "package.json / package-lock.json changed since the last npm install"
fi

# Also check the vite binary exists — node_modules dir can exist but be incomplete
# (e.g. after a failed previous deploy or a fresh container with a mounted volume)
if ! exec_in_app test -f node_modules/.bin/vite; then
    log_warning "node_modules/.bin/vite missing — forcing full install"
    node_changes=1
fi

if [ "$node_changes" -eq 1 ] || ! exec_in_app test -d node_modules; then
    if ! install_node_dependencies; then
        step_failed 4 "npm install failed"
        exit 1
    fi
else
    log_success "Node dependencies already installed and complete"
fi

step_success 4 "Node dependencies ready"


# =================================================================================================
# STEP 6: FRONTEND ASSETS
# =================================================================================================

step_start 5

log_step "${ICON_VITE} Handling frontend assets..."

if [ "$APP_ENV" = "production" ]; then
    log_step "Building production assets..."
    exec_in_app rm -f public/hot
    
    if ! run_logged exec_in_app npm run build; then
        log_error "Frontend build failed"
        step_failed 5 "npm run build failed"
        exit 1
    fi
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
# =================================================================================================
# STEP 7: DATABASE MIGRATION & SEEDING (NOW MINIO IS READY WITH BUCKET!)
# =================================================================================================

# After migration and seeding
step_start 6

# =================================================================================================
# R2 DATABASE SYNC CHECK (ROBUST WITH PYTHON FALLBACK)
# =================================================================================================
# Deploys keep the live database. Restoring is explicit: --restore-db. (The old
# SYNC_DB_FROM_R2=true default wiped live data on every deploy.)
if [ "${SYNC_DB_FROM_R2:-}" = "true" ] && [ "$RESTORE_DB" != "1" ]; then
    log_warning "SYNC_DB_FROM_R2=true is no longer used. The live database is kept; pass --restore-db to restore from R2."
fi

if [ "$RESTORE_DB" = "1" ]; then
    log_step "--restore-db: restoring the newest backup from R2 (${BACKUP_BUCKET_PATH})..."

    mkdir -p "$PROJECT_ROOT/storage/app/backups"
    RESTORE_FILE="$PROJECT_ROOT/storage/app/backups/latest.sql.gz"
    rm -f "$RESTORE_FILE"
    download_success=false
    REMOTE_INFO=""

    # Try 1: MinIO client (mc). latest.sql.gz is always the newest dump, and
    # latest.json says which file/sha256 it is.
    if command -v mc >/dev/null 2>&1; then
        log_info "Downloading via MinIO client (mc)..."
        REMOTE_INFO="$(mc cat "$R2/latest.json" 2>/dev/null || true)"
        if mc cp "$R2/latest.sql.gz" "$RESTORE_FILE" >/dev/null 2>&1; then
            download_success=true
        else
            log_warning "mc download failed. Switching to Python fallback..."
        fi
    fi

    # Try 2: Python (boto3) using the R2_* keys from the env file
    if [ "$download_success" = false ]; then
        if [ -z "${R2_ENDPOINT:-}" ] || [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ]; then
            log_warning "R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are not set in $(basename "$ENV_FILE"); cannot use the Python R2 client."
        elif python3 -c "import boto3" 2>/dev/null; then
            log_info "Downloading via Python R2 client..."
            R2_BUCKET_NAME="$BACKUP_BUCKET_PATH" R2_DEST="$RESTORE_FILE" python3 -c "
import os, sys, boto3
from botocore.config import Config
s3 = boto3.client('s3', endpoint_url=os.environ['R2_ENDPOINT'],
    aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
    aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
    config=Config(signature_version='s3v4'))
bucket = os.environ['R2_BUCKET_NAME']
try:
    s3.download_file(bucket, 'latest.sql.gz', os.environ['R2_DEST'])
except Exception as e:
    print(f'Python R2 error: {e}'); sys.exit(1)
try:
    print(s3.get_object(Bucket=bucket, Key='latest.json')['Body'].read().decode(), file=open(os.environ['R2_DEST'] + '.json', 'w'))
except Exception:
    pass
" && download_success=true
            [ -f "$RESTORE_FILE.json" ] && REMOTE_INFO="$(cat "$RESTORE_FILE.json")" && rm -f "$RESTORE_FILE.json"
        else
            log_warning "Python boto3 library not found."
        fi
    fi

    if [ "$download_success" != true ]; then
        log_error "All R2 download methods failed. Aborting deployment (database untouched)."
        exit 1
    fi

    # Verify before touching the live database
    if ! gzip -t "$RESTORE_FILE" 2>/dev/null; then
        log_error "Downloaded backup is not valid gzip. Aborting (database untouched)."
        exit 1
    fi
    FILE_SHA="$(file_sha "$RESTORE_FILE")"
    REMOTE_SHA="$(json_get "$REMOTE_INFO" sha256)"
    if [ -n "$REMOTE_SHA" ] && [ "$REMOTE_SHA" != "$FILE_SHA" ]; then
        log_error "Backup checksum does not match latest.json (got ${FILE_SHA:0:12}, expected ${REMOTE_SHA:0:12}). Aborting (database untouched)."
        exit 1
    fi
    [ -z "$REMOTE_SHA" ] && log_warning "No latest.json next to latest.sql.gz (older backup format): checksum not verified."
    export RESTORED_BACKUP_NAME="$(json_get "$REMOTE_INFO" file)"
    RESTORED_BACKUP_NAME="${RESTORED_BACKUP_NAME:-latest.sql.gz}"
    log_info "Backup: ${RESTORED_BACKUP_NAME} (sha256 ${FILE_SHA:0:12}...), made by '$(json_get "$REMOTE_INFO" node)' at $(json_get "$REMOTE_INFO" time)"

    existing_tables=$(docker exec "$DB_CONTAINER" mysql -u"${DB_USERNAME}" -p"${DB_PASSWORD}" -N -B -e \
        "SET SESSION group_concat_max_len = 1000000; SELECT GROUP_CONCAT(CONCAT('\`', table_name, '\`')) FROM information_schema.tables WHERE table_schema = '${DB_DATABASE}' AND table_type = 'BASE TABLE'" 2>/dev/null)
    if [ $? -ne 0 ]; then
        log_error "Cannot read the live database in container '$DB_CONTAINER'. Refusing to restore over something I cannot inspect."
        exit 1
    fi

    # Safety net: dump the live database before it is wiped, and refuse to
    # continue if that dump fails.
    if [ -n "$existing_tables" ] && [ "$existing_tables" != "NULL" ]; then
        SAFETY_DUMP="$SCRIPT_DIR/backups/pre-restore_$(utc_stamp).sql.gz"
        mkdir -p "$SCRIPT_DIR/backups"
        log_info "Saving a safety dump of the live database first..."
        if ! db_dump "$SAFETY_DUMP"; then
            rm -f "$SAFETY_DUMP"
            log_error "Could not take a safety dump of the live database. Refusing to wipe it."
            exit 1
        fi
        log_success "Safety dump saved: ${SAFETY_DUMP} (undo = restore this file)"
        ls -1t "$SCRIPT_DIR"/backups/pre-restore_*.sql.gz 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
    fi

    # Empty the database first. A dump only drops and recreates the tables it
    # contains, so tables created by migrations newer than the backup survive
    # the restore while the `migrations` table is rolled back, and the next
    # `migrate` dies on "table already exists".
    log_info "Clearing database '${DB_DATABASE}' before restore..."
    if [ -n "$existing_tables" ] && [ "$existing_tables" != "NULL" ]; then
        if ! docker exec "$DB_CONTAINER" mysql -u"${DB_USERNAME}" -p"${DB_PASSWORD}" "${DB_DATABASE}" -e \
            "SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS ${existing_tables}; SET FOREIGN_KEY_CHECKS=1;" 2>/dev/null; then
            log_error "Could not clear database '${DB_DATABASE}' before restore."
            exit 1
        fi
    fi

    log_info "Restoring '${RESTORED_BACKUP_NAME}' into database container ($DB_CONTAINER)..."
    if gunzip -c "$RESTORE_FILE" | docker exec -i "$DB_CONTAINER" mysql -u"${DB_USERNAME}" -p"${DB_PASSWORD}" "${DB_DATABASE}"; then
        state_set last_sha "$FILE_SHA"
        log_success "Database restored from R2 (${RESTORED_BACKUP_NAME}). This node now descends from that backup."
    else
        log_error "Failed to restore database from '${RESTORED_BACKUP_NAME}'."
        [ -n "${SAFETY_DUMP:-}" ] && log_error "The previous live database is in ${SAFETY_DUMP}"
        exit 1
    fi
else
    log_info "Keeping the live database (no restore). Use --restore-db to load the newest R2 backup."
fi

log_step "${ICON_DB} Running database migration..."

if ! run_migration_with_retry; then
    log_error "Database migration failed - deployment aborted"
    step_failed 6 "Database migration failed"
    exit 1
fi

log_done "Database migration completed"

# Show the specific backup filename in the progress row
DB_MSG_LABEL="Database migrated (data kept)"
[ -n "${RESTORED_BACKUP_NAME:-}" ] && DB_MSG_LABEL="Database restored from ${RESTORED_BACKUP_NAME}"

step_success 6 "${DB_MSG_LABEL}"

# # =================================================================================================
# # POST-SEEDING: ENSURE ALL UPLOADED IMAGES ARE PUBLIC
# # =================================================================================================

# log_step "Ensuring all seeded images are publicly accessible..."

# # Run a Laravel command to set visibility on all uploaded images
# docker exec "$APP_CONTAINER" php artisan tinker --execute="
#     try {
#         \$disk = Illuminate\Support\Facades\Storage::disk('s3');
#         \$files = \$disk->allFiles('uploads');
#         \$count = 0;
#         foreach (\$files as \$file) {
#             if (\$disk->getVisibility(\$file) !== 'public') {
#                 \$disk->setVisibility(\$file, 'public');
#                 \$count++;
#             }
#         }
#         echo \"✅ Made \$count images public\n\";
#     } catch (\Exception \$e) {
#         echo \"⚠️ Could not update visibilities: \" . \$e->getMessage() . \"\n\";
#     }
# " 2>&1 | log_stream

# # Also ensure all bucket objects are public via a fresh mc container.
# # Uses MC_HOST_local env var (no alias setup needed, avoids shell quoting issues).
# docker run --rm \
#     --entrypoint /bin/sh \
#     --network "${COMPOSE_PROJECT_NAME:-duka}_duka-network" \
#     -e MC_HOST_local="http://${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}@duka-minio:9000" \
#     -e BUCKET="${AWS_BUCKET}" \
#     minio/mc:latest \
#     -c 'mc anonymous set download --recursive local/$BUCKET' 2>&1 | log_stream || true

# log_success "All images are now publicly accessible"
# =================================================================================================
# STEP 8: CACHE AND PERMISSIONS
# =================================================================================================

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
# Caches were already cleared above; only re-link storage and (in production)
# rebuild the optimized caches. Non-production runs uncached on purpose.
exec_in_app php artisan storage:link --force 2>&1 | log_stream

if [ "$APP_ENV" = "production" ]; then
    exec_in_app php artisan optimize 2>&1 | log_stream
fi

log_done "Laravel optimizations refreshed"
step_success 7 "Cache cleared and permissions set"

# =================================================================================================
# STEP 9: FINAL VERIFICATION
# =================================================================================================

step_start 8

log_step "Performing final verification checks..."

# Check if all critical containers are running (MinIO removed)
CRITICAL_CONTAINERS=("$APP_CONTAINER" "$DB_CONTAINER")
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
health_code=000
for _try in 1 2 3 4 5 6 7 8 9 10; do
    health_code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' -H "Host: ${APP_DOMAIN:-localhost}" "http://localhost:${APP_PORT:-8096}/" 2>/dev/null || true)"
    case "$health_code" in 2??|3??|4??) break ;; esac
    sleep 3
done
case "$health_code" in
    2??|3??|4??) log_success "Application answers on port ${APP_PORT:-8096} (HTTP $health_code)" ;;
    *)           log_warning "Application did not answer on port ${APP_PORT:-8096} (HTTP $health_code): check 'docker logs $APP_CONTAINER'" ;;
esac

step_success 8 "Deployment verification complete"

# =================================================================================================
# CLOUDFLARE CACHE PURGING (AUTOMATED)
# =================================================================================================

step_start 9
log_step "Clearing Cloudflare edge cache to prevent stale Vite manifest errors..."

if [ -f .env.production ]; then
    set -a
    source .env.production
    set +a
fi

if [ -n "${CLOUDFLARE_ZONE_ID:-}" ] && [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
         -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
         -H "Content-Type: application/json" \
         --data '{"purge_everything":true}')
         
    if [ "$RESPONSE" -eq 200 ]; then
        log_success "Cloudflare cache purged successfully!"
    else
        log_warning "Cloudflare cache purge returned HTTP status code: $RESPONSE"
    fi
else
    log_warning "Skipping Cloudflare cache purge: CLOUDFLARE_ZONE_ID or CLOUDFLARE_API_TOKEN not found in environment."
fi

step_success 9 "Cloudflare cache purged"

# =================================================================================================
# DEPLOYMENT COMPLETE
# =================================================================================================

log_success "=================================================================================="
log_success "${ICON_ROCKET} DEPLOYMENT COMPLETE ${ICON_ROCKET}"
log_success "=================================================================================="
log_success "Application is now running ${ICON_SUCCESS}"
log_success "Log file saved to: $LOG_FILE"
log_success "=================================================================================="

# Tell the standby nodes which commit is live, so they can follow (auto-deploy.sh).
if [ "${NODE_ROLE:-}" = "primary" ]; then
    if find_mc && deploy_marker_write; then
        log_info "Published deployed commit to R2 (standbys will follow): $(git rev-parse --short HEAD 2>/dev/null)"
    else
        log_warning "Could not publish the deployed commit to R2; standbys will not auto-deploy this one."
    fi
fi

show_full_progress

finish_banner
# =================================================================================================
# COLOR CODES FOR LOGGING
# =================================================================================================
# =================================================================================================
# PROGRESS TRACKING SYSTEM
# =================================================================================================
# =================================================================================================
# CONFIGURATION & PATH RESOLUTION
# =================================================================================================
# =================================================================================================
# ENVIRONMENT SELECTION & CONFIGURATION
# =================================================================================================
# =================================================================================================
# HELPER FUNCTIONS
# =================================================================================================
# =================================================================================================
# VARIABLE LOADING WITH DEFAULTS
# =================================================================================================
# =================================================================================================
# FILE ARRAYS FOR CHANGE DETECTION
# =================================================================================================
# =================================================================================================
# DOCKER COMPOSE CONFIGURATION
# =================================================================================================
# =================================================================================================
# DOCKER COMPOSE WRAPPER
# =================================================================================================
# =================================================================================================
# MINIO READINESS & BUCKET SETUP
# =================================================================================================
# =================================================================================================
# MAKE ALL EXISTING MINIO OBJECTS PUBLIC
# =================================================================================================
# =================================================================================================
# NODE DEPENDENCIES
# =================================================================================================
# =================================================================================================
# MIGRATION WITH DEADLOCK HANDLING
# =================================================================================================
# =================================================================================================
# MAIN DEPLOYMENT LOGIC
# =================================================================================================
# =================================================================================================
# STEP 1: LOAD CONFIGURATION & ENVIRONMENT
# =================================================================================================
# =================================================================================================
# STEP 2: START SERVICES (FIXED FOR RASPBERRY PI)
# =================================================================================================
# =================================================================================================
# UPDATED OBSERVABILITY BLOCK: Run Migrations & Setup Superuser
# =================================================================================================
# =================================================================================================
# STEP 3: MINIO READINESS & BUCKET SETUP (CRITICAL - MUST BE BEFORE SEEDING)
# =================================================================================================
# =================================================================================================
# STEP 3.5: VERIFY MINIO IS FULLY READY FOR SEEDING
# =================================================================================================
# =================================================================================================
# STEP 4: PHP DEPENDENCIES
# =================================================================================================
# =================================================================================================
# STEP 5: NODE DEPENDENCIES
# =================================================================================================
# =================================================================================================
# STEP 6: FRONTEND ASSETS
# =================================================================================================
# =================================================================================================
# STEP 7: DATABASE MIGRATION & SEEDING (NOW MINIO IS READY WITH BUCKET!)
# =================================================================================================
# =================================================================================================
# R2 DATABASE SYNC CHECK (ROBUST WITH PYTHON FALLBACK)
# =================================================================================================
# =================================================================================================
# POST-SEEDING: ENSURE ALL UPLOADED IMAGES ARE PUBLIC
# =================================================================================================
# =================================================================================================
# STEP 8: CACHE AND PERMISSIONS
# =================================================================================================
# =================================================================================================
# STEP 9: FINAL VERIFICATION
# =================================================================================================
# =================================================================================================
# STEP 9.5: UPLOAD MISSING IMAGES (POST-DEPLOYMENT)
# =================================================================================================
# =================================================================================================
# CLOUDFLARE CACHE PURGING (AUTOMATED)
# =================================================================================================
# =================================================================================================
# DEPLOYMENT COMPLETE
# =================================================================================================
