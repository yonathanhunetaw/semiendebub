#!/usr/bin/env bash
# Thin entry point so `./deploy-with-options.sh -e prod` keeps working.
# The real script lives in deploy/ along with deploy.sh, dev.sh and logs/.
exec "$(dirname "$0")/deploy/deploy-with-options.sh" "$@"
