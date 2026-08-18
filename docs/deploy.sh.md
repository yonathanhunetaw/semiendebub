# Deployment Options Reference (`deploy.sh` and `deploy-with-options.sh`)

This document is the **complete reference** for all deployment options.  
It covers both the core script (`deploy.sh`) and the recommended wrapper (`deploy-with-options.sh`).

- For day‑to‑day usage, see the [Wrapper Guide](./deploy-with-options.sh.md).
- For a quick summary, jump to the [Options Table](#options-table).

---

## Which Script to Use?

- **Always prefer `./deploy-with-options.sh`** – it adds safety prompts, extra flags, and passthrough handling.
- Use `./deploy.sh` directly only if you need a minimal invocation (e.g., in CI) or are debugging the wrapper.

---

## Options Table

All flags are passed **after** the environment argument.  
Flags marked **Passthrough** are recognised directly by `deploy.sh`; others are handled by the wrapper.

| Flag / Short | Long Form          | Description                                                                 | Risk Level | Handled By |
|--------------|--------------------|-----------------------------------------------------------------------------|------------|------------|
| `-e`         | `--env`            | Select deployment environment (`dev` or `prod`) – **required**              | Low        | Wrapper    |
| `-f`         | `--force-build`    | Force rebuild of Docker images (use after Dockerfile changes)              | Low        | Wrapper    |
| `-r`         | `--reset-db`       | Reset database (wipe + fresh migrations + seed data)                      | **HIGH**   | Wrapper    |
| `-o`         | `--observability`  | Enable observability stack (LGTM + GlitchTip) for this run                 | Low        | Wrapper    |
| `-c`         | `--clean`          | Remove all Docker volumes before deployment (nuke)                         | **VERY HIGH** | Wrapper |
| `-l`         | `--logs`           | Follow application container logs after deployment                         | Low        | Wrapper    |
| –            | `--no-cache`       | Build images without Docker layer cache (slower but cleaner)              | Low        | Wrapper    |
| –            | `--no-reset`       | Prevent database reset (passthrough to `deploy.sh`)                        | Low        | Passthrough|
| –            | `--skip-reset`     | Alias for `--no-reset`                                                     | Low        | Passthrough|
| –            | `--no-seed`        | Alias for `--no-reset`                                                     | Low        | Passthrough|
| `-p`         | `--production`     | Legacy – select production environment                                     | Low        | Wrapper    |
| `-d`         | `--development`    | Legacy – select development environment                                    | Low        | Wrapper    |
| `-h`         | `--help`           | Show help message                                                          | Low        | Wrapper    |

> **Important:**  
> - `--reset-db` and `--clean` are destructive – never use them on production data without a backup.  
> - The passthrough flags (`--no-reset`, `--skip-reset`, `--no-seed`) are the **only** flags understood directly by `deploy.sh`; all others are processed by the wrapper and translated into environment variables.

---

## Environment Variables

These variables are read from `.env` (development) or `.env.production` (production). They set the **default** behaviour and can be overridden by the corresponding flags.

| Variable | Default | Description |
|----------|---------|-------------|
| `RESET_DB` | `0` | If `1`, the database is reset unless `--no-reset` is given. |
| `FORCE_BUILD` | `0` | If `1`, Docker images are rebuilt on every deploy unless `--force-build` is omitted. |
| `ENABLE_OBSERVABILITY` | `0` | If `1`, the observability stack is always included. Use `--observability` to override. |
| `APP_ENV` | `local` / `production` | Laravel environment (set automatically by the environment argument). |
| `COMPOSE_PROJECT_NAME` | `duka` | Base name for containers, networks, and volumes. |
| `APP_PORT` | `8095` (dev) / `8096` (prod) | Host port for the web application. |
| `VITE_PORT` | `5177` | Port for the Vite development server (development only). |
| `AWS_ACCESS_KEY_ID` | – | MinIO / S3 access key. |
| `AWS_SECRET_ACCESS_KEY` | – | MinIO / S3 secret key. |
| `AWS_BUCKET` | `duka-images` | Default bucket name. |
| `GLITCHTIP_DB_USER` | `glitchtip` | Database user for GlitchTip (observability). |
| `GLITCHTIP_DB_NAME` | `glitchtip` | Database name for GlitchTip. |
| `GLITCHTIP_DB_PASSWORD` | `glitchtip` | Password for GlitchTip database (change in production). |
| `GLITCHTIP_SECRET_KEY` | `change-this-secret` | Secret key for GlitchTip (change in production). |
| `GLITCHTIP_DOMAIN` | `http://localhost:8080` | Domain where GlitchTip is served (adjust for your setup). |

---

## Environment Selection

| Environment | Wrapper Command                  | Core Script Command | Environment File | Compose Overlay                     |
|-------------|----------------------------------|---------------------|------------------|-------------------------------------|
| Development | `./deploy-with-options.sh -e dev`| `./deploy.sh dev`   | `.env`           | `docker/docker-compose.dev.yml`    |
| Production  | `./deploy-with-options.sh -e prod`| `./deploy.sh prod` | `.env.production`| `docker/docker-compose.prod.yml`   |

---

## Quick Command Reference (Most Common)

| Use Case | Command |
|----------|---------|
| Normal development | `./deploy-with-options.sh -e dev` |
| Development with monitoring | `./deploy-with-options.sh -e dev --observability` |
| After Dockerfile changes | `./deploy-with-options.sh -e dev --force-build` |
| Suspect Docker cache | `./deploy-with-options.sh -e dev --force-build --no-cache` |
| Fresh DB (destructive) | `./deploy-with-options.sh -e dev --reset-db` |
| Nuclear clean (destructive) | `./deploy-with-options.sh -e dev --clean` |
| Production deploy | `./deploy-with-options.sh -e prod` |
| Production with monitoring | `./deploy-with-options.sh -e prod --observability` |
| Production rebuild | `./deploy-with-options.sh -e prod --force-build` |
| Skip reset (passthrough) | `./deploy-with-options.sh -e dev --no-reset` |

---

## Core Script (`deploy.sh`) Direct Usage

If you run `deploy.sh` directly, the only flags it understands are `--no-reset`, `--skip-reset`, and `--no-seed`.  
All other behaviour is controlled by environment variables. Example:

```bash
./deploy.sh dev --no-reset