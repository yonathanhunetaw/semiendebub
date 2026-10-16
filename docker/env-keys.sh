#!/bin/bash
# env-keys.sh - print the setting names in .env.production, to compare servers.
# Secrets (keys, passwords, tokens, webhooks, DSNs) show only set/empty; other
# values show an 8-character hash, so two servers can be compared line by line
# (diff the outputs) without anything readable leaving the machine.
# Usage: make env-keys  [ARGS=path/to/envfile]
set -euo pipefail
cd "$(dirname "$0")/.."
f="${1:-.env.production}"
[ -f "$f" ] || { echo "$f not found" >&2; exit 1; }
sha() { if command -v sha256sum >/dev/null; then sha256sum | cut -c1-8; else shasum -a 256 | cut -c1-8; fi; }
echo "# $(hostname -s) $f"
grep -E '^[A-Z_][A-Z0-9_]*=' "$f" | sort | while IFS= read -r line; do
    k="${line%%=*}"; v="${line#*=}"; v="${v%\"}"; v="${v#\"}"
    if [ -z "$v" ]; then echo "$k = (empty)"
    elif [[ "$k" =~ (KEY|SECRET|PASS|TOKEN|WEBHOOK|DSN|_ID$) ]]; then echo "$k = (secret, set)"
    else echo "$k = $(printf '%s' "$v" | sha)"; fi
done
