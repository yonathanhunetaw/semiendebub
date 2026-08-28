# Deployment Wrapper Guide (`deploy-with-options.sh`)

`deploy-with-options.sh` is the recommended entry point for deploying the Duka application in both development and production.  
It acts as a wrapper around `deploy.sh` and provides:

- Environment selection (`dev` / `prod`)
- Docker image rebuild options
- Database reset control
- Observability stack (LGTM + GlitchTip)
- Docker volume cleanup
- Docker layer cache control
- Post‑deployment log following
- Confirmation prompt before any action
- Elapsed‑time banner (`✨ Done in Xm Xs`)

> **Important:** Always use `deploy-with-options.sh` instead of calling `deploy.sh` directly – the wrapper ensures options are correctly passed through.

---

## Options Overview

| Short Flag | Long Form | Description | Destructive? |
|:-----------|:----------|:------------|:------------:|
| `-e dev` / `-e prod` | `--env` | Select environment (**required**) | 🟢 No |
| `-f` | `--force-build` | Force Docker image rebuild | 🟢 No |
| `-r` | `--reset-db` | Reset database (migration + seed) | ⚠️ Yes – loses DB data |
| `-o` | `--observability` | Enable LGTM + GlitchTip | 🟢 No |
| `-c` | `--clean` | Remove all Docker volumes | 🔥 Yes – wipes everything |
| `-l` | `--logs` | Follow container logs after deploy | 🟢 No |
| – | `--no-cache` | Build without Docker cache (use with `-f`) | 🟢 No |
| – | `--no-reset` | Prevent DB reset (passthrough) | 🟢 No |
| – | `--skip-reset` | Alias for `--no-reset` | 🟢 No |
| – | `--no-seed` | Prevent seeding (passthrough) | 🟢 No |
| `-p` | `--production` | Legacy – same as `-e prod` | 🟢 No |
| `-d` | `--development` | Legacy – same as `-e dev` | 🟢 No |
| `-h` | `--help` | Show help and exit | 🟢 No |

---

## Destructive Operations – Legend

| Emoji | Meaning |
|:-----:|:--------|
| 🟢 | **Safe** – no data loss |
| ⚠️  | **Database reset** – loses current DB data (migration + seed) |
| 🔥 | **Volume clean** – deletes all persistent volumes (DB, caches, uploads) |
| ☢️ | **Both** – full wipe (database reset + volume clean) |

---

# All Command Combinations

## Development Environment (`-e dev` / `--env dev`)

### Standard Deploy (no extra flags)

Short:  
`./deploy-with-options.sh -e dev`  
Long:  
`./deploy-with-options.sh --env dev`  
🟢

---

### With Observability

Short:  
`./deploy-with-options.sh -e dev -o`  
Long:  
`./deploy-with-options.sh --env dev --observability`  
🟢

---

### With Logs After Deploy

Short:  
`./deploy-with-options.sh -e dev -l`  
Long:  
`./deploy-with-options.sh --env dev --logs`  
🟢

---

### Observability + Logs

Short:  
`./deploy-with-options.sh -e dev -o -l`  
Long:  
`./deploy-with-options.sh --env dev --observability --logs`  
🟢

---

### Force Rebuild Images

Short:  
`./deploy-with-options.sh -e dev -f`  
Long:  
`./deploy-with-options.sh --env dev --force-build`  
🟢

---

### Force Rebuild + No Cache

Short:  
`./deploy-with-options.sh -e dev -f --no-cache`  
Long:  
`./deploy-with-options.sh --env dev --force-build --no-cache`  
🟢

---

### Observability + Logs + Force Rebuild

Short:  
`./deploy-with-options.sh -e dev -o -l -f`  
Long:  
`./deploy-with-options.sh --env dev --observability --logs --force-build`  
🟢

---

### Observability + Logs + Force Rebuild + No Cache

Short:  
`./deploy-with-options.sh -e dev -o -l -f --no-cache`  
Long:  
`./deploy-with-options.sh --env dev --observability --logs --force-build --no-cache`  
🟢

---

### Reset Database

Short:  
`./deploy-with-options.sh -e dev -r`  
Long:  
`./deploy-with-options.sh --env dev --reset-db`  
⚠️

---

### Reset DB + Observability + Logs

Short:  
`./deploy-with-options.sh -e dev -r -o -l`  
Long:  
`./deploy-with-options.sh --env dev --reset-db --observability --logs`  
⚠️

---

### Reset DB + Force Rebuild

Short:  
`./deploy-with-options.sh -e dev -r -f`  
Long:  
`./deploy-with-options.sh --env dev --reset-db --force-build`  
⚠️

---

### Clean Volumes

Short:  
`./deploy-with-options.sh -e dev -c`  
Long:  
`./deploy-with-options.sh --env dev --clean`  
🔥

---

### Clean Volumes + Observability + Logs

Short:  
`./deploy-with-options.sh -e dev -c -o -l`  
Long:  
`./deploy-with-options.sh --env dev --clean --observability --logs`  
🔥

---

### Clean Volumes + Force Rebuild

Short:  
`./deploy-with-options.sh -e dev -c -f`  
Long:  
`./deploy-with-options.sh --env dev --clean --force-build`  
🔥

---

### Clean Volumes + Force Rebuild + No Cache

Short:  
`./deploy-with-options.sh -e dev -c -f --no-cache`  
Long:  
`./deploy-with-options.sh --env dev --clean --force-build --no-cache`  
🔥

---

### Reset DB + Clean Volumes

Short:  
`./deploy-with-options.sh -e dev -r -c`  
Long:  
`./deploy-with-options.sh --env dev --reset-db --clean`  
☢️

---

### Reset DB + Clean Volumes + Observability

Short:  
`./deploy-with-options.sh -e dev -r -c -o`  
Long:  
`./deploy-with-options.sh --env dev --reset-db --clean --observability`  
☢️

---

### Reset DB + Clean Volumes + Logs

Short:  
`./deploy-with-options.sh -e dev -r -c -l`  
Long:  
`./deploy-with-options.sh --env dev --reset-db --clean --logs`  
☢️

---

### Reset DB + Clean Volumes + Force Rebuild

Short:  
`./deploy-with-options.sh -e dev -r -c -f`  
Long:  
`./deploy-with-options.sh --env dev --reset-db --clean --force-build`  
☢️

---

### All Flags (Nuclear – Full Wipe + Rebuild + Observability + Logs)

Short:  
`./deploy-with-options.sh -e dev -r -c -f -o -l --no-cache`  
Long:  
`./deploy-with-options.sh --env dev --reset-db --clean --force-build --observability --logs --no-cache`  
☢️

---

## Production Environment (`-e prod` / `--env prod`)

### Standard Deploy (no extra flags)

Short:  
`./deploy-with-options.sh -e prod`  
Long:  
`./deploy-with-options.sh --env prod`  
🟢

---

### With Observability

Short:  
`./deploy-with-options.sh -e prod -o`  
Long:  
`./deploy-with-options.sh --env prod --observability`  
🟢

---

### With Logs After Deploy

Short:  
`./deploy-with-options.sh -e prod -l`  
Long:  
`./deploy-with-options.sh --env prod --logs`  
🟢

---

### Observability + Logs

Short:  
`./deploy-with-options.sh -e prod -o -l`  
Long:  
`./deploy-with-options.sh --env prod --observability --logs`  
🟢

---

### Force Rebuild Images

Short:  
`./deploy-with-options.sh -e prod -f`  
Long:  
`./deploy-with-options.sh --env prod --force-build`  
🟢

---

### Force Rebuild + No Cache

Short:  
`./deploy-with-options.sh -e prod -f --no-cache`  
Long:  
`./deploy-with-options.sh --env prod --force-build --no-cache`  
🟢

---

### Observability + Logs + Force Rebuild

Short:  
`./deploy-with-options.sh -e prod -o -l -f`  
Long:  
`./deploy-with-options.sh --env prod --observability --logs --force-build`  
🟢

---

### Observability + Logs + Force Rebuild + No Cache

Short:  
`./deploy-with-options.sh -e prod -o -l -f --no-cache`  
Long:  
`./deploy-with-options.sh --env prod --observability --logs --force-build --no-cache`  
🟢

---

### Prevent Database Reset (passthrough)

Short:  
`./deploy-with-options.sh -e prod --no-reset`  
Long:  
`./deploy-with-options.sh --env prod --no-reset`  
🟢 (keeps data)

---

### Reset Database (⚠️ Production data loss)

Short:  
`./deploy-with-options.sh -e prod -r`  
Long:  
`./deploy-with-options.sh --env prod --reset-db`  
⚠️

---

### Reset DB + Observability + Logs

Short:  
`./deploy-with-options.sh -e prod -r -o -l`  
Long:  
`./deploy-with-options.sh --env prod --reset-db --observability --logs`  
⚠️

---

### Reset DB + Force Rebuild

Short:  
`./deploy-with-options.sh -e prod -r -f`  
Long:  
`./deploy-with-options.sh --env prod --reset-db --force-build`  
⚠️

---

### Clean Volumes (🔥 Production volume delete)

Short:  
`./deploy-with-options.sh -e prod -c`  
Long:  
`./deploy-with-options.sh --env prod --clean`  
🔥

---

### Clean Volumes + Observability + Logs

Short:  
`./deploy-with-options.sh -e prod -c -o -l`  
Long:  
`./deploy-with-options.sh --env prod --clean --observability --logs`  
🔥

---

### Clean Volumes + Force Rebuild

Short:  
`./deploy-with-options.sh -e prod -c -f`  
Long:  
`./deploy-with-options.sh --env prod --clean --force-build`  
🔥

---

### Clean Volumes + Force Rebuild + No Cache

Short:  
`./deploy-with-options.sh -e prod -c -f --no-cache`  
Long:  
`./deploy-with-options.sh --env prod --clean --force-build --no-cache`  
🔥

---

### Reset DB + Clean Volumes (☢️ Complete production data loss)

Short:  
`./deploy-with-options.sh -e prod -r -c`  
Long:  
`./deploy-with-options.sh --env prod --reset-db --clean`  
☢️

---

### Reset DB + Clean Volumes + Observability

Short:  
`./deploy-with-options.sh -e prod -r -c -o`  
Long:  
`./deploy-with-options.sh --env prod --reset-db --clean --observability`  
☢️

---

### Reset DB + Clean Volumes + Logs

Short:  
`./deploy-with-options.sh -e prod -r -c -l`  
Long:  
`./deploy-with-options.sh --env prod --reset-db --clean --logs`  
☢️

---

### Reset DB + Clean Volumes + Force Rebuild

Short:  
`./deploy-with-options.sh -e prod -r -c -f`  
Long:  
`./deploy-with-options.sh --env prod --reset-db --clean --force-build`  
☢️

---

### All Flags (Nuclear – Full Production Wipe + Rebuild + Observability + Logs)

Short:  
`./deploy-with-options.sh -e prod -r -c -f -o -l --no-cache`  
Long:  
`./deploy-with-options.sh --env prod --reset-db --clean --force-build --observability --logs --no-cache`  
☢️

---

## Legacy Aliases

You can replace `-e dev` with `--development` and `-e prod` with `--production`.  
Example:

- `./deploy-with-options.sh --production --observability --logs`  
  is the same as  
  `./deploy-with-options.sh -e prod -o -l`

- `./deploy-with-options.sh --development --reset-db --clean`  
  is the same as  
  `./deploy-with-options.sh -e dev -r -c`

---

## Passthrough Flags

The wrapper passes the following flags directly to `deploy.sh` without interpreting them:
- `--no-reset`
- `--skip-reset`
- `--no-seed`

Use them to override the default behaviour of `deploy.sh` (e.g., to prevent database seeding after a reset).