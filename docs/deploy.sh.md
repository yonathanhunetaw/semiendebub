# Deployment Options

This document outlines the available options for the deployment script based on the provided configuration logic.

## Environment Selection
The deployment script requires an environment argument to be specified as the first positional parameter.

| Environment | Usage | Description |
| :--- | :--- | :--- |
| **Development** | `./deploy.sh dev` | Deploys using `.env` and `docker-compose.dev.yml`. Enables development-specific features. |
| **Production** | `./deploy.sh prod` | Deploys using `.env.production` and `docker-compose.prod.yml`. Optimizes for production use. |

## Command-Line Flags
The following flags can be passed after the environment argument (e.g., `./deploy.sh dev --no-reset`) to modify the deployment behavior:

* `--no-reset` / `--skip-reset` / `--no-seed`: Skips the database reset (wiping and seeding) process. Useful for incremental updates.

## Configuration (.env Variables)
The script loads configuration from `.env` or `.env.production` depending on the selected environment. The following variables impact deployment logic:

* `RESET_DB`: If set to `1` (or if not specifically skipped via flag), the database will be wiped and seeded.
* `FORCE_BUILD`: If set to `1`, forces a rebuild of containers.
* `ENABLE_OBSERVABILITY`: If set to `1`, includes the `docker-compose.observability.yml` stack in the deployment.
* `APP_ENV`: Defines the application environment (e.g., `production` vs `development`).
* `GLITCHTIP_DB_USER` / `GLITCHTIP_DB_NAME`: Database credentials used if observability features are enabled.