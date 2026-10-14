# Duka: short commands for the scripts in deploy/.   Run `make` to list them.
# Extra flags go in ARGS, e.g.  make prod ARGS="--observability"

.DEFAULT_GOAL := help
ARGS ?=

.PHONY: help setup dev stop status test e2e artisan deploy-dev prod logs

help: ## List commands
	@grep -E '^[a-zA-Z0-9_-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-12s %s\n", $$1, $$2}'

# --- Local development (native, no Docker) ---------------------------------
setup: ## One-time native dev setup (php, MySQL, deps)
	./deploy/dev.sh setup

dev: ## Start MySQL + app + queue + Vite (Ctrl-C stops)
	./deploy/dev.sh up

stop: ## Stop the local MySQL service
	./deploy/dev.sh stop

status: ## Show what is running locally
	./deploy/dev.sh status

test: ## Run the PHP test suite natively (1G memory, no cached config)
	APP_CONFIG_CACHE=/nonexistent/config.php APP_ROUTES_CACHE=/nonexistent/routes.php \
	APP_EVENTS_CACHE=/nonexistent/events.php php -d memory_limit=1G vendor/bin/phpunit --no-coverage $(ARGS)

e2e: ## Playwright end-to-end (needs `make dev` running)
	./deploy/dev.sh e2e $(ARGS)

artisan: ## Run artisan natively:  make artisan ARGS="migrate"
	./deploy/dev.sh artisan $(ARGS)

# --- Docker deploys --------------------------------------------------------
deploy-dev: ## Deploy the Docker dev stack (testing Docker changes)
	./deploy/deploy-with-options.sh -e dev $(ARGS)

prod: ## Deploy production (after git pull)
	./deploy/deploy-with-options.sh -e prod $(ARGS)

logs: ## Follow the latest deploy log
	tail -f deploy/logs/latest.log
