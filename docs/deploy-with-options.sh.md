# Deployment Wrapper Guide (`deploy-with-options.sh`)

`deploy-with-options.sh` is the recommended entry point for deploying the Duka application in both development and production.  
It acts as a wrapper around `deploy.sh` and controls:

- Environment selection
- Docker image rebuilding
- Database reset behavior
- Observability services
- Docker volume cleanup
- Docker layer caching
- Post-deployment log following

> **Important:** Prefer `deploy-with-options.sh` instead of running `deploy.sh` directly. The wrapper sets deployment options and passes them into the core deployment script.

---

## Quick Reference

### Development

| Purpose | Command |
|---------|---------|
| Standard development deployment | `./deploy-with-options.sh -e dev` |
| Development with observability | `./deploy-with-options.sh -e dev --observability` |
| Development with a forced Docker rebuild | `./deploy-with-options.sh -e dev --force-build` |
| Development with observability and a forced rebuild | `./deploy-with-options.sh -e dev --observability --force-build` |
| Development with live Docker logs after deployment | `./deploy-with-options.sh -e dev --logs` |

### Production

| Purpose | Command |
|---------|---------|
| Standard production deployment | `./deploy-with-options.sh -e prod` |
| Production with observability | `./deploy-with-options.sh -e prod --observability` |
| Production with a forced rebuild | `./deploy-with-options.sh -e prod --force-build` |
| Production with a forced rebuild and no Docker cache | `./deploy-with-options.sh -e prod --force-build --no-cache` |

---

## Options Overview (Table)

| Flag | Long Form | Description | Risk |
|------|-----------|-------------|------|
| `-e dev` / `-e prod` | `--env` | Select deployment environment (required) | Low |
| `-f` | `--force-build` | Force Docker image rebuild | Low |
| `-r` | `--reset-db` | Reset database (fresh migration + seed) | **HIGH** |
| `-o` | `--observability` | Enable observability stack (LGTM + GlitchTip) | Low |
| `-c` | `--clean` | Remove Docker volumes before deployment | **VERY HIGH** |
| `-l` | `--logs` | Follow application container logs after deployment | Low |
| – | `--no-cache` | Build images without Docker layer cache | Low |
| – | `--no-reset` | Prevent database reset (passthrough to `deploy.sh`) | Low |
| – | `--skip-reset` | Alias for `--no-reset` | Low |
| – | `--no-seed` | Alias for `--no-reset` | Low |
| `-p` | `--production` | Legacy – select production environment | Low |
| `-d` | `--development` | Legacy – select development environment | Low |

---

## Environment Selection

The recommended syntax is:

```bash
./deploy-with-options.sh -e <dev|prod>

## Quick Frontend/UI Updates (Without Full Redeploy)

When **only frontend assets** have changed (CSS, JavaScript, Vue components, Vite manifest, etc.) and a full Docker image rebuild is **not** required, you can update the production build directly inside the running container.

### Production Environment

```bash
# 1. Rebuild frontend assets
docker exec -it duka-prod-app npm run build

# 2. Clear Laravel caches to pick up new asset filenames
docker exec -it duka-prod-app php artisan optimize:clear

# 3. (Optional) Recompile Blade views
docker exec -it duka-prod-app php artisan view:cache
```

### Development Environment

If you need to refresh frontend assets in the development container:

```bash
# 1. Rebuild frontend assets
docker exec -it duka-dev-app npm run build

# 2. Clear Laravel caches
docker exec -it duka-dev-app php artisan optimize:clear

# 3. (Optional) Recompile Blade views
docker exec -it duka-dev-app php artisan view:cache
```

### Why These Commands?

| Command | What it does |
|---------|--------------|
| `npm run build` | Generates production Vite assets and updates the Vite manifest with new filenames. |
| `php artisan optimize:clear` | Clears Laravel’s cached configuration, routes, views, and other optimization artifacts so the new asset filenames are resolved. |
| `php artisan view:cache` | Precompiles Blade views – recommended for production to improve performance. |

> **Important Notes:**
> - A frontend‑only change does **not** automatically require rebuilding the Docker image **if** the application source is bind‑mounted into the running container (as it is in development).
> - In production, if your source is **not** bind‑mounted (i.e., copied during the image build), you would need to rebuild the image using `./deploy-with-options.sh -e prod --force-build` instead of running these commands.
> - For a fully container‑isolated production environment, prefer using the wrapper's `--force-build` flag to ensure the new assets are baked into the image.