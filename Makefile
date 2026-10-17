# Duka: every day-to-day command in one place.   Run `make` (or `make help`) for the menu.
#
# How this file works
#   - A line  `target: ## text`   is a command; `text` is what `make help` shows.
#   - A line  `##@ TITLE`         starts a group in the menu.
#   - A line  `#@ NAME | text`    documents a deploy option (a VARIABLE you add to the command).
#   - A line  `#> text`           is an example in the menu.
#   - Options are plain variables:  make prod FORCE_BUILD=1 YES=1
#     Unset (or empty) means off. Anything else you need goes in ARGS="...".
#   - The real work is done by the scripts in deploy/ and docker/; this file only
#     turns the options below into their flags.

.DEFAULT_GOAL := help
ARGS ?=

.PHONY: help setup dev stop status test e2e e2e-ui artisan dev-from-prod compare-prod walkthrough walkthrough-ui walkthrough-report deploy-dev prod restore prod-stop prod-status logs backup sync tunnel env-keys

# --- Deploy options -> flags of deploy/deploy-with-options.sh ---------------------------------
DEPLOY_FLAGS = $(if $(FORCE_BUILD),-f) $(if $(NO_CACHE),--no-cache) $(if $(OBSERVABILITY),-o) \
               $(if $(RESET_DB),-r) $(if $(CLEAN),-c) $(if $(RESTORE_DB),--restore-db) \
               $(if $(FOLLOW_LOGS),-l) $(if $(YES),-y)

# A typo here must not be able to wipe production: these two need CONFIRM_WIPE=yes on prod.
define GUARD_PROD_WIPE
	@if { [ -n "$(RESET_DB)" ] || [ -n "$(CLEAN)" ]; } && [ "$(CONFIRM_WIPE)" != "yes" ]; then \
	  echo "Refusing: RESET_DB / CLEAN would WIPE the production database."; \
	  echo "If you really mean it, add CONFIRM_WIPE=yes (and take a backup first: make backup)."; exit 1; fi
endef

##@ HELP
help: ## Show this menu
	@C=""; B=""; D=""; R=""; if [ -t 1 ]; then C="$$(printf '\033[36m')"; B="$$(printf '\033[1m')"; D="$$(printf '\033[2m')"; R="$$(printf '\033[0m')"; fi; \
	printf '%sDuka: make commands%s   %s(make <command>; options as VARIABLE=1; anything else via ARGS="...")%s\n\n' "$$B" "$$R" "$$D" "$$R"; \
	awk -v c="$$C" -v b="$$B" -v r="$$R" ' \
	  /^##@ / { t = substr($$0, 5); if (t != "HELP") printf "\n%s%s%s\n", b, t, r; next } \
	  /^[a-zA-Z0-9_-]+:.*## / { split($$0, a, ":.*## "); printf "  %smake %-14s%s %s\n", c, a[1], r, a[2]; next } \
	  /^#@ / { split(substr($$0, 4), a, " \\| "); printf "  %s%-18s%s %s\n", c, a[1], r, a[2]; next } \
	  /^#> / { printf "  %s\n", substr($$0, 4) }' $(MAKEFILE_LIST)
	@echo

##@ LOCAL DEVELOPMENT  (native on this Mac, no Docker)
setup: ## One-time setup: PHP, MySQL, a dev database and the dependencies
	./deploy/dev.sh setup

dev: ## Start MySQL, the app (:8095), the queue and Vite (:5177). Ctrl-C stops them
	./deploy/dev.sh up

stop: ## Stop the local MySQL service (frees RAM)
	./deploy/dev.sh stop

status: ## Is local MySQL / the app / the queue / Vite running?
	./deploy/dev.sh status

test: ## Run the PHP tests natively. Narrow it with ARGS="--filter SomeTest"
	APP_CONFIG_CACHE=/nonexistent/config.php APP_ROUTES_CACHE=/nonexistent/routes.php \
	APP_EVENTS_CACHE=/nonexistent/events.php php -d memory_limit=1G vendor/bin/phpunit --no-coverage $(ARGS)

dev-from-prod: ## Replace the dev database with prod's newest backup (a safety dump of dev first). Read-only on prod
	./deploy/dev.sh pull-prod

compare-prod: ## How dev differs from prod: code, migrations, settings (names only), PHP/Node/MySQL versions
	./deploy/dev.sh compare

walkthrough: ## Watch every business journey on the DEV database (kept, not a copy). One: ARGS=shipment. Needs `make dev`
	./deploy/dev.sh artisan dev:demo-staff
	npx playwright test -c playwright.walkthrough.config.ts $(ARGS)

walkthrough-ui: ## The walkthroughs in Playwright's window: numbered steps on the left, each person's screen at every step
	./deploy/dev.sh artisan dev:demo-staff
	npx playwright test -c playwright.walkthrough.config.ts --ui $(ARGS)

walkthrough-report: ## Replay the last walkthrough run: every step, screenshot and trace (kept on this Mac only)
	npx playwright show-report playwright-report/walkthrough

e2e: ## Browser tests (Playwright) on a throwaway copy of the database. Needs `make dev` running
	./deploy/dev.sh e2e $(if $(T),e2e/$(T)) $(ARGS)

e2e-ui: ## Same, in Playwright's interactive window
	./deploy/dev.sh e2e --ui $(if $(T),e2e/$(T)) $(ARGS)

artisan: ## Run artisan on the native database:  make artisan ARGS="migrate"
	./deploy/dev.sh artisan $(ARGS)

##@ DEPLOY  (Docker; the options below apply to all three)
prod: ## Deploy production here: build, migrate, restart. Keeps the database. On the Mac it TAKES OVER from the live server
	$(GUARD_PROD_WIPE)
	DUKA_NO_BAR=$(NO_BAR) ./deploy/deploy-with-options.sh -e prod $(DEPLOY_FLAGS) $(ARGS)

restore: ## Deploy production AND replace the database with the newest R2 backup (takes a safety dump first)
	$(GUARD_PROD_WIPE)
	DUKA_NO_BAR=$(NO_BAR) ./deploy/deploy-with-options.sh -e prod --restore-db $(DEPLOY_FLAGS) $(ARGS)

deploy-dev: ## Deploy the Docker DEV stack (only to test Docker changes; everyday work is `make dev`)
	DUKA_NO_BAR=$(NO_BAR) ./deploy/deploy-with-options.sh -e dev $(DEPLOY_FLAGS) $(ARGS)

prod-stop: ## Stop production on THIS node cleanly: tunnel off, last backup, hand the lease back, stop the containers
	./docker/tunnel-guard.sh --stop
	./docker/backup-db.sh --release
	docker compose --env-file .env.production -f docker/docker-compose.yml -f docker/docker-compose.prod.yml down

##@ DEPLOY OPTIONS  (add to prod / restore / deploy-dev, e.g.  make prod FORCE_BUILD=1 YES=1)
#@ FORCE_BUILD=1 | Rebuild the Docker images first (after changing a Dockerfile or system packages)
#@ NO_CACHE=1 | Rebuild images ignoring Docker's layer cache (slow; fixes a stale layer)
#@ OBSERVABILITY=1 | Also start the monitoring stack (Grafana LGTM + GlitchTip)
#@ RESTORE_DB=1 | Replace the database with the newest R2 backup first (what `make restore` does)
#@ FOLLOW_LOGS=1 | Keep following the app container's logs after the deploy
#@ YES=1 | Do not ask "Continue with deployment?" (for scripts)
#@ NO_BAR=1 | Plain output, no progress bar pinned to the bottom of the terminal
#@ RESET_DB=1 | WIPE the database: fresh migrate + seed. On prod also needs CONFIRM_WIPE=yes
#@ CLEAN=1 | Remove containers AND volumes first (deletes the DB data). On prod also needs CONFIRM_WIPE=yes
#@ ARGS="..." | Any other flag, passed straight through to the script
#@ T=seller/checkout | e2e / e2e-ui: only the browser tests in that folder of e2e/ (see e2e/README.md)

##@ WHAT IS HAPPENING
prod-status: ## Who is live, each server's health, possible data loss, latest events. ARGS="-n 50" (more) or "--loss"
	./docker/status.sh $(ARGS)

logs: ## Follow the latest deploy log (deploy/logs/latest.log)
	tail -f deploy/logs/latest.log

##@ BACKUPS  (cron runs these for you; run by hand to check or to repair)
backup: ## Back up the database to R2 now. ARGS="--adopt" (this DB is the truth), "--force" (take the lease), "--release"
	./docker/backup-db.sh $(ARGS)

sync: ## Run the standby sync now: follow the newest backup, or catch up after a takeover
	./docker/sync-db.sh $(ARGS)

env-keys: ## Print this server's .env.production setting names (+ a short hash of non-secret values) to compare servers
	@./docker/env-keys.sh $(ARGS)

tunnel: ## Only the live server keeps its Cloudflare tunnel up: run the guard now. ARGS="--dry-run" (just say), "--status"
	./docker/tunnel-guard.sh $(ARGS)

##@ EXAMPLES
#> make prod                                  deploy after git pull; the database is kept
#> make prod FORCE_BUILD=1 YES=1              rebuild the images, no question asked
#> make restore                               deploy and load the newest backup (a new or stale server)
#> make prod OBSERVABILITY=1                  deploy with the monitoring stack
#> make deploy-dev RESET_DB=1                 wipe and reseed the Docker DEV database
#> make test ARGS="--filter SystemStatus"     run just the tests that match
#> make e2e T=seller                          only the seller browser tests
#> make e2e-ui T=seller/payments              one module, in Playwright's window
#> make prod-status ARGS="--loss"             only the possible-data-loss list
