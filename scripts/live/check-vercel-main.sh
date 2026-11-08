#!/usr/bin/env bash
#
# Is the production console serving the latest main? Passes when the
# deployment behind the production domain is one of the Vercel deployments
# GitHub recorded (commit status "Vercel", state success) for origin/main's
# head commit. Prints the main sha and the deployment id; nothing secret.
#
#   scripts/live/check-vercel-main.sh [domain]
set -euo pipefail
domain="${1:-${AITP_LIVE_CONSOLE_DOMAIN:-console.agentidentitytrustprotocol.io}}"
say() { printf '[vercel-main] %s\n' "$*" >&2; }
for c in git gh vercel; do command -v "$c" >/dev/null || { say "error: $c not on PATH"; exit 1; }; done

git fetch --quiet origin main
sha="$(git rev-parse origin/main)"
dpl="$(vercel inspect "$domain" 2>&1 | sed -nE 's/^[[:space:]]*id[[:space:]]+(dpl_[A-Za-z0-9]+).*/\1/p' | head -1)"
target="$(vercel inspect "$domain" 2>&1 | sed -nE 's/^[[:space:]]*target[[:space:]]+([a-z]+).*/\1/p' | head -1)"
[ -n "$dpl" ] || { say "FAIL: could not read the deployment behind $domain"; exit 1; }
ids="$(gh api "repos/{owner}/{repo}/commits/$sha/statuses" --paginate \
  --jq '.[] | select(.context == "Vercel" and .state == "success") | .target_url | split("/") | last' | sort -u)"
if [ "$target" = production ] && grep -qx "${dpl#dpl_}" <<<"$ids"; then
  say "PASS: $domain -> $dpl (production) is a successful Vercel deployment of main ${sha:0:7}"
else
  say "FAIL: $domain -> $dpl (target ${target:-?}); main ${sha:0:7} Vercel deployments: $(tr '\n' ' ' <<<"${ids:-none}")"
  exit 1
fi
