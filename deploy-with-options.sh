#!/bin/bash
# deploy-with-options.sh - Interactive wrapper around deploy.sh
# Usage: ./deploy-with-options.sh -e <dev|prod> [OPTIONS]

# Track how long the deployment takes (like npm run build)
DEPLOY_START_TIME=$(date +%s)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD_GREEN='\033[1;32m'
BOLD_CYAN='\033[1;36m'
NC='\033[0m'

# Print the final "Done in Xm Xs" banner like npm run build
finish_banner() {
    local elapsed=$(( $(date +%s) - DEPLOY_START_TIME ))
    local mins=$(( elapsed / 60 ))
    local secs=$(( elapsed % 60 ))
    echo ""
    echo -e "${BOLD_GREEN}✨ Done in ${mins}m ${secs}s${NC}"
    echo ""
}

print_usage() {
    echo -e "${BLUE}Duka Deployment Wrapper${NC}"
    echo ""
    echo "Usage: ./deploy-with-options.sh -e <dev|prod> [OPTIONS]"
    echo ""
    echo "Required:"
    echo "  -e, --env <dev|prod>       Target environment"
    echo ""
    echo "Options:"
    echo "  -h, --help                 Show this help message"
    echo "  -f, --force-build          Force rebuild Docker images before deploying"
    echo "  -r, --reset-db             Reset database (fresh migration + seed)"
    echo "  -o, --observability        Enable observability stack (LGTM + GlitchTip)"
    echo "  -c, --clean                Tear down volumes before deploying"
    echo "  -l, --logs                 Follow container logs after deployment"
    echo "  --no-cache                 Build images without Docker layer cache"
    echo "  --no-reset                 Pass --no-reset flag through to deploy.sh"
    echo ""
    echo "Examples:"
    echo "  ./deploy-with-options.sh -e prod --observability"
    echo "  ./deploy-with-options.sh -e dev --reset-db --force-build"
    echo "  ./deploy-with-options.sh -e prod --clean --force-build --no-cache"
    echo ""
    echo "  # Legacy flags still work:"
    echo "  ./deploy-with-options.sh --production --observability"
    echo "  ./deploy-with-options.sh --development --reset-db"
}

# ── Defaults ──────────────────────────────────────────────────────────────────
FORCE_BUILD=0
RESET_DB=0
OBSERVABILITY=0
ENVIRONMENT=""
CLEAN_VOLUMES=0
FOLLOW_LOGS=0
NO_CACHE=0
PASSTHROUGH_FLAGS=()

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            print_usage; exit 0 ;;
        -e|--env)
            ENVIRONMENT="$2"; shift 2 ;;
        -f|--force-build)
            FORCE_BUILD=1; shift ;;
        -r|--reset-db)
            RESET_DB=1;
            PASSTHROUGH_FLAGS+=("$1")
            shift ;;
        -o|--observability)
            OBSERVABILITY=1; shift ;;
        -c|--clean)
            CLEAN_VOLUMES=1; shift ;;
        -l|--logs)
            FOLLOW_LOGS=1; shift ;;
        --no-cache)
            NO_CACHE=1; shift ;;
        --no-reset|--skip-reset|--no-seed)
            PASSTHROUGH_FLAGS+=("$1"); shift ;;
        # Legacy long flags for backwards compatibility
        -p|--production)
            ENVIRONMENT="prod"; shift ;;
        -d|--development)
            ENVIRONMENT="dev"; shift ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            print_usage; exit 1 ;;
    esac
done

# ── Validate ──────────────────────────────────────────────────────────────────
if [ -z "$ENVIRONMENT" ]; then
    echo -e "${RED}Error: environment (-e dev|prod) is required.${NC}"
    echo ""
    print_usage; exit 1
fi

if [ "$ENVIRONMENT" != "dev" ] && [ "$ENVIRONMENT" != "prod" ]; then
    echo -e "${RED}Error: environment must be 'dev' or 'prod', got: '${ENVIRONMENT}'${NC}"
    exit 1
fi

# ── Resolve env file and container names ──────────────────────────────────────
if [ "$ENVIRONMENT" = "prod" ]; then
    ENV_FILE=".env.production"
    COMPOSE_OVERLAY="docker/docker-compose.prod.yml"
else
    ENV_FILE=".env"
    COMPOSE_OVERLAY="docker/docker-compose.dev.yml"
fi

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: $ENV_FILE not found!${NC}"
    exit 1
fi

# ── Source main environment ──────────────────────────────────────────────────
set -a; source "$ENV_FILE"; set +a

# ── Optional observability env file ──────────────────────────────────────────
OBSERVABILITY_ENV_FILE=".env.observability"
if [ -f "$OBSERVABILITY_ENV_FILE" ]; then
    echo -e "${BLUE}📁 Loading observability variables from $OBSERVABILITY_ENV_FILE${NC}"
    set -a; source "$OBSERVABILITY_ENV_FILE"; set +a
else
    echo -e "${YELLOW}ℹ️  No $OBSERVABILITY_ENV_FILE found – skipping${NC}"
fi

APP_CONTAINER="${COMPOSE_PROJECT_NAME:-duka}-app"

# ── Helper: build --env-file arguments for docker compose ────────────────────
get_env_file_args() {
    local args="--env-file ../$ENV_FILE"
    if [ -f "$OBSERVABILITY_ENV_FILE" ]; then
        args="$args --env-file ../$OBSERVABILITY_ENV_FILE"
    fi
    echo "$args"
}

# ── Optional: clean volumes ───────────────────────────────────────────────────
if [ $CLEAN_VOLUMES -eq 1 ]; then
    echo -e "${YELLOW}⚠️  Tearing down volumes for ${COMPOSE_PROJECT_NAME:-duka}...${NC}"
    (cd docker && docker compose \
        $(get_env_file_args) \
        -f docker-compose.yml \
        -f "$(basename "$COMPOSE_OVERLAY")" \
        down -v)
    echo -e "${GREEN}✓ Volumes cleaned${NC}"
fi

# ── Optional: force image rebuild ─────────────────────────────────────────────
if [ $FORCE_BUILD -eq 1 ]; then
    echo -e "${YELLOW}🔨 Rebuilding Docker images for ${COMPOSE_PROJECT_NAME:-duka}...${NC}"
    NO_CACHE_FLAG=""
    [ $NO_CACHE -eq 1 ] && NO_CACHE_FLAG="--no-cache"
    (cd docker && docker compose \
        $(get_env_file_args) \
        -f docker-compose.yml \
        -f "$(basename "$COMPOSE_OVERLAY")" \
        build $NO_CACHE_FLAG)
    echo -e "${GREEN}✓ Images built${NC}"
fi

# ── Export flags so deploy.sh picks them up ───────────────────────────────────
export FORCE_BUILD=$FORCE_BUILD
export RESET_DB=$RESET_DB
export ENABLE_OBSERVABILITY=$OBSERVABILITY

# ── Show configuration ────────────────────────────────────────────────────────
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}         Deployment Configuration       ${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "Environment:      ${YELLOW}$ENVIRONMENT${NC}"
echo -e "Project Name:     ${YELLOW}${COMPOSE_PROJECT_NAME:-duka}${NC}"
echo -e "Env File:         ${YELLOW}${ENV_FILE}${NC}"
echo -e "App Container:    ${YELLOW}${APP_CONTAINER}${NC}"
echo -e "Force Build:      ${YELLOW}$FORCE_BUILD${NC}"
echo -e "Reset Database:   ${YELLOW}$RESET_DB${NC}"
echo -e "Observability:    ${YELLOW}$OBSERVABILITY${NC}"
echo -e "Clean Volumes:    ${YELLOW}$CLEAN_VOLUMES${NC}"
echo -e "No Cache:         ${YELLOW}$NO_CACHE${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"

read -p "Continue with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Deployment cancelled${NC}"
    exit 1
fi

# ── Run core deployment ───────────────────────────────────────────────────────
echo -e "${BOLD_CYAN}⏱  Elapsed: 0m 0s${NC}"
echo -e "${GREEN}🚀 Starting deployment...${NC}"
./deploy.sh "$ENVIRONMENT" "${PASSTHROUGH_FLAGS[@]}"

# ── Optional: follow logs ─────────────────────────────────────────────────────
if [ $FOLLOW_LOGS -eq 1 ]; then
    echo -e "${BLUE}📋 Following logs for ${APP_CONTAINER}...${NC}"
    docker logs -f "$APP_CONTAINER"
fi

finish_banner