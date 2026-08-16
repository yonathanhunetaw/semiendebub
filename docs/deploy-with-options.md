# Deployment Wrapper Guide (`deploy-with-options.sh`)

To keep things perfectly clear, you should always use `./deploy-with-options.sh` for both development and production [cite: 3]. Running raw `deploy.sh` directly bypasses the setup logic that pieces together your `docker/` folder overrides, which can lead to unpredictable configuration state mismatches [cite: 3].

## Production Deployment (Remote Server)
When deploying to production, run [cite: 3]:
```bash
sudo bash deploy-with-options.sh --production
```
*(Note: Tested and confirmed working on production environments as of July 10, 2026).*

### What Production Mode Does
* Locks `$APP_ENV` to production [cite: 3].
* Ignores development compose layers [cite: 3].
* Builds optimized frontend assets [cite: 3].
* Triggers production-safe Laravel optimization commands (`config:cache`, `route:cache`) [cite: 3].

---

## Development Flags Explained
When developing locally or on a development environment (like your folder on the Pi), you append flags depending on what state you want to toggle [cite: 3]:

* **`-f` or `--force-build`** [cite: 3]
  * **When to use:** Use this if you just changed something inside your `docker/Dockerfile.dev` or updated system packages [cite: 3]. It forces Docker to rebuild the structural container images instead of reusing cached image layers [cite: 3].
  * *Example:* `./deploy-with-options.sh --development --force-build` [cite: 3]
* **`-r` or `--reset-db`** [cite: 3]
  * **When to use:** Use this when you want a completely pristine database state [cite: 3]. It will wipe all your tables, run all migrations fresh, and populate the system with your development seed data (mock records, default assets, user entries) [cite: 3].
  * *Example:* `./deploy-with-options.sh --development --reset-db` [cite: 3]
* **`-o` or `--observability`** [cite: 3]
  * **When to use:** Use this to turn on your performance monitoring, metrics telemetry, and error-catching services (LGTM stack + GlitchTip) to inspect logs or trace API performance locally [cite: 3].
  * *Example:* `./deploy-with-options.sh --development --observability` [cite: 3]
* **`-c` or `--clean`** [cite: 3]
  * **When to use:** The "nuke" switch [cite: 3]. Use this if you are encountering stubborn volume caching errors, corrupted storage sessions, or database lockouts [cite: 3]. It wipes all persistent Docker volumes bound to the project before bringing up clean instances [cite: 3].
  * *Example:* `./deploy-with-options.sh --development --clean` [cite: 3]
* **`-l` or `--logs`** [cite: 3]
  * **When to use:** Use this to automatically tail the real-time runtime log files for all your running services right after the deployment script finishes executing [cite: 3].
  * *Example:* `./deploy-with-options.sh --development --logs` [cite: 3]

---

## Summary Recommendations
* **Standard Daily Run:** `./deploy-with-options.sh --development` [cite: 3]
* **When you pull heavy database changes:** `./deploy-with-options.sh --development --reset-db` [cite: 3]
* **When Docker files or underlying dependencies alter:** Append `--force-build` or `--clean`.

## For quick frontend/UI updates (without a full redeploy): 
`docker exec -it duka-prod-app npm run build`
`docker exec -it duka-prod-app php artisan optimize:clear`
`docker exec -it duka-prod-app php artisan view:cache`
Why: npm run build generates the new frontend files, but Laravel in production caches the old filenames. The two artisan commands force Laravel to dump its memory and link the newly built files from the updated Vite manifest.