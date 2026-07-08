#!/bin/bash
# deploy-with-options.sh - Wrapper script for full deployment options

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_usage() {
    echo -e "${BLUE}Duka Deployment Script${NC}"
    echo ""
    echo "Usage: ./deploy-with-options.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help                 Show this help message"
    echo "  -f, --force-build          Force rebuild Docker images"
    echo "  -r, --reset-db             Reset database (fresh migration with seed)"
    echo "  -o, --observability        Enable observability stack (LGTM + GlitchTip)"
    echo "  -p, --production           Deploy in production mode"
    echo "  -d, --development          Deploy in development mode"
    echo "  -c, --clean                Clean all Docker volumes before deploy"
    echo "  -l, --logs                 Follow logs after deployment"
    echo "  --no-cache                 Build without Docker cache"
    echo ""
    echo "Examples:"
    echo "  # Full production deployment with observability"
    echo "  ./deploy-with-options.sh --production --observability"
    echo ""
    echo "  # Development with database reset and force build"
    echo "  ./deploy-with-options.sh --development --reset-db --force-build"
    echo ""
    echo "  # Clean deployment with all features"
    echo "  ./deploy-with-options.sh --production --observability --clean --force-build"
    echo ""
}

# Parse arguments
FORCE_BUILD=0
RESET_DB=0
OBSERVABILITY=0
APP_ENV=""
CLEAN_VOLUMES=0
FOLLOW_LOGS=0
NO_CACHE=0

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            print_usage
            exit 0
            ;;
        -f|--force-build)
            FORCE_BUILD=1
            shift
            ;;
        -r|--reset-db)
            RESET_DB=1
            shift
            ;;
        -o|--observability)
            OBSERVABILITY=1
            shift
            ;;
        -p|--production)
            APP_ENV="production"
            shift
            ;;
        -d|--development)
            APP_ENV="local"
            shift
            ;;
        -c|--clean)
            CLEAN_VOLUMES=1
            shift
            ;;
        -l|--logs)
            FOLLOW_LOGS=1
            shift
            ;;
        --no-cache)
            NO_CACHE=1
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            print_usage
            exit 1
            ;;
    esac
done

# Validate environment
if [ -z "$APP_ENV" ]; then
    echo -e "${YELLOW}Warning: APP_ENV not specified. Using from .env file.${NC}"
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    exit 1
fi

# Clean volumes if requested
if [ $CLEAN_VOLUMES -eq 1 ]; then
    echo -e "${YELLOW}Cleaning Docker volumes...${NC}"
    # ADD THESE LINES
    ENV_VAL="${APP_ENV:-$(grep APP_ENV .env | cut -d '=' -f2)}"
    COMPOSE_ARGS=(-f docker/docker-compose.yml)
    if [ "$ENV_VAL" != "production" ]; then
        COMPOSE_ARGS+=(-f docker/docker-compose.dev.yml)
    fi
    COMPOSE_ARGS+=(-f docker/docker-compose.prod.yml)
    
    # USE COMPOSE_ARGS HERE
    docker compose --env-file .env "${COMPOSE_ARGS[@]}" down -v
    echo -e "${GREEN}Volumes cleaned${NC}"
fi

# Build with no cache if requested
if [ $NO_CACHE -eq 1 ]; then
    echo -e "${YELLOW}Building without Docker cache...${NC}"
    export DOCKER_BUILDKIT=0
    COMPOSE_DOCKER_CLI_BUILD=0
fi

# Set environment variables for the deployment
export FORCE_BUILD=$FORCE_BUILD
export RESET_DB=$RESET_DB
export ENABLE_OBSERVABILITY=$OBSERVABILITY

if [ -n "$APP_ENV" ]; then
    # Temporarily override APP_ENV in .env
    sed -i.bak "s/^APP_ENV=.*/APP_ENV=$APP_ENV/" .env
    echo -e "${BLUE}Set APP_ENV=$APP_ENV${NC}"
fi

# Show deployment configuration
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Deployment Configuration${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Force Build:     ${YELLOW}$FORCE_BUILD${NC}"
echo -e "Reset Database:  ${YELLOW}$RESET_DB${NC}"
echo -e "Observability:   ${YELLOW}$OBSERVABILITY${NC}"
echo -e "Environment:     ${YELLOW}${APP_ENV:-$(grep APP_ENV .env | cut -d '=' -f2)}${NC}"
echo -e "Clean Volumes:   ${YELLOW}$CLEAN_VOLUMES${NC}"
echo -e "No Cache:        ${YELLOW}$NO_CACHE${NC}"
echo -e "${BLUE}========================================${NC}"

# Confirm with user
read -p "Continue with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Deployment cancelled${NC}"
    exit 1
fi

# Force build Docker images if requested
if [ $FORCE_BUILD -eq 1 ]; then
    echo -e "${YELLOW}Forcefully rebuilding Docker images...${NC}"
    ENV_VAL="${APP_ENV:-$(grep APP_ENV .env | cut -d '=' -f2)}"
    
    # Ensure these point to the 'docker/' subdirectory
    COMPOSE_ARGS=(-f docker/docker-compose.yml)
    if [ "$ENV_VAL" != "production" ]; then
        COMPOSE_ARGS+=(-f docker/docker-compose.dev.yml)
    fi
    COMPOSE_ARGS+=(-f docker/docker-compose.prod.yml)
    
    if [ $NO_CACHE -eq 1 ]; then
        docker compose --env-file .env "${COMPOSE_ARGS[@]}" build --no-cache
    else
        docker compose --env-file .env "${COMPOSE_ARGS[@]}" build
    fi
fi

# Run deployment
echo -e "${GREEN}Starting deployment...${NC}"

# Define the same compose arguments used in the build section
ENV_VAL="${APP_ENV:-$(grep APP_ENV .env | cut -d '=' -f2)}"
COMPOSE_ARGS=(-f docker/docker-compose.yml)
if [ "$ENV_VAL" != "production" ]; then
    COMPOSE_ARGS+=(-f docker/docker-compose.dev.yml)
fi
COMPOSE_ARGS+=(-f docker/docker-compose.prod.yml)

# Use these arguments when calling docker compose up
docker compose --env-file .env "${COMPOSE_ARGS[@]}" up -d

# Now call your main deploy.sh
./deploy.sh

# Restore original .env if modified
if [ -n "$APP_ENV" ] && [ -f ".env.bak" ]; then
    mv .env.bak .env
    echo -e "${GREEN}Restored original .env file${NC}"
fi

# Follow logs if requested
if [ $FOLLOW_LOGS -eq 1 ]; then
    echo -e "${BLUE}Following application logs...${NC}"
    docker logs -f duka-app
fi

echo -e "${GREEN}Deployment script completed!${NC}"