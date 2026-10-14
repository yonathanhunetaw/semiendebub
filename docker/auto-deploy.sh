#!/bin/bash
# auto-deploy.sh - make a standby follow the primary's deployments.
# Run it from cron every 2 minutes on the standby (see docs/reference/backups.md).
#
# When the primary finishes a successful deploy it publishes the git commit to
# R2 (deployed.json). This script, on a standby, notices a commit it has not
# deployed yet, fast-forwards its checkout to exactly that commit and runs a
# normal deploy (never --restore-db: the data comes from sync-db.sh).
#
# It does nothing when:
#   - NODE_ROLE is not standby, or AUTO_DEPLOY=false in the env file
#   - this node holds the primary lease (it is serving; do not restart it)
#   - the checkout cannot fast-forward to that commit (logged; fix by hand)
# A failed deploy of a commit is retried at most every 30 minutes.
set -euo pipefail

# Everything lives in main() so the file is fully parsed before it runs: the
# git fast-forward below may rewrite this very script while it is executing.
main() {

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
[ -d "/opt/homebrew/bin" ] && export PATH="/opt/homebrew/bin:$PATH"
export HOME="${HOME:-$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f6 || true)}"

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../deploy/db-lib.sh
. "$APP_ROOT/deploy/db-lib.sh"

case "${1:-}" in -h|--help) sed -n '2,14p' "$0"; exit 0 ;; esac

db_init
log()  { echo "[$(date '+%F %T')] [${NODE_NAME}/${NODE_ROLE:-?}] auto-deploy: $*"; }
fail() { echo "[$(date '+%F %T')] [${NODE_NAME}/${NODE_ROLE:-?}] auto-deploy ERROR: $*" >&2; exit "${2:-1}"; }

[ "$NODE_ROLE" = standby ] || exit 0
[ "$(db_env AUTO_DEPLOY true)" = false ] && exit 0
find_mc || fail "mc (MinIO client) not found in PATH ($PATH)"

info="$(deploy_marker_read)"
target="$(json_get "$info" commit)"
[ -n "$target" ] || exit 0                                   # primary has not published one yet
[ "$target" = "$(state_get deployed_commit)" ] && exit 0     # already deployed (the common case)

# Do not restart a node that is currently serving as the primary.
lease_load
if [ "$LEASE_HOLDER" = "$NODE_NAME" ] && [ "$LEASE_FRESH" = 1 ]; then
    exit 0
fi

# Do not hammer a commit that just failed.
if [ "$(state_get failed_commit)" = "$target" ]; then
    last="$(state_get failed_at)"
    [ $(( $(now_epoch) - ${last:-0} )) -ge 1800 ] || exit 0
fi

lock_acquire db || exit 0                                    # a sync/backup is running: try next time
trap 'lock_release db' EXIT

record_failure() { state_set failed_commit "$target"; state_set failed_at "$(now_epoch)"; }

log "primary '$(json_get "$info" node)' deployed ${target:0:10} at $(json_get "$info" time); following"
cd "$APP_ROOT"
git fetch --quiet origin || { record_failure; fail "git fetch failed"; }
git cat-file -e "${target}^{commit}" 2>/dev/null \
    || { record_failure; fail "commit ${target:0:10} is not in the repository after fetch (not pushed?)"; }
if [ "$(git rev-parse HEAD)" != "$target" ]; then
    git merge --ff-only "$target" >/dev/null 2>&1 \
        || { record_failure; fail "cannot fast-forward to ${target:0:10} (local changes or diverged history). Fix by hand: git status"; }
fi

DEPLOY_CMD="${DUKA_DEPLOY_CMD:-./deploy/deploy-with-options.sh -e prod -y}"
log "deploying: $DEPLOY_CMD"
event_emit auto_deploy_started info "$NODE_NAME is deploying ${target:0:10}, which $(json_get "$info" node) deployed" "{\"commit\":\"${target:0:10}\"}"
if $DEPLOY_CMD; then
    state_set deployed_commit "$target"
    log "deployed ${target:0:10}"
    event_emit auto_deploy_done info "$NODE_NAME finished deploying ${target:0:10}" "{\"commit\":\"${target:0:10}\"}"
else
    event_emit auto_deploy_failed error "$NODE_NAME failed to deploy ${target:0:10}" "{\"commit\":\"${target:0:10}\"}"
    record_failure
    fail "deploy of ${target:0:10} failed; will retry in 30 min (see deploy/logs/latest.log)"
fi
}
main "$@"
exit $?
