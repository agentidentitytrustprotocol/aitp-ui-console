#!/usr/bin/env bash
#
# Live public-console suite: drives the PRODUCTION console (real Railway runs,
# real LLM, real money). Local only; refuses under CI. See
# internal_docs/TESTING.md § "Live public-console suite".
#
#   scripts/live/run-live.sh                 # full run, in this order:
#       vercel   production console == latest main
#       security admin refusal, network + bundle leak checks
#       read     read-limit flood (once, first among the paid steps)
#       raise    playground per-IP LLM quota -> 400/1000 (trap restores)
#       matrix   every scenario, anonymous then operator (paced launches)
#       low      quota -> 1/1000 (after --quota-after, if given)
#       quota    quota-badge test
#       restore  quota -> 30/300, managed hash must equal the start hash
#       launch   launch-limit burst
#   scripts/live/run-live.sh --steps security,read     # a subset (no quota change unless raise/low listed)
#   scripts/live/run-live.sh --quota-after 00:05       # wait until that UTC time before "low"
#
# Secrets: the operator password and the leak needles (backend URLs and keys
# the console must never expose) come from Doppler aitp-ui-console/prd as
# environment of the test process only; nothing is printed or written. The
# evidence written under e2e/live/.evidence/<stamp>/ is redacted.
#
# Env knobs: AITP_LIVE_MAX_LAUNCHES (80), AITP_LIVE_PACE_SECONDS (180),
# AITP_LIVE_REFS (comma list to limit the matrix), AITP_LIVE_CONSOLE_URL.
set -uo pipefail

say() { printf '[run-live] %s\n' "$*" >&2; }
[ -z "${CI:-}" ] || { say "refusing: CI is set; the live suite never runs in CI"; exit 2; }

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
cd "$root" || exit 1

steps="vercel,security,read,raise,matrix,low,quota,restore,launch"
quota_after=""
while [ $# -gt 0 ]; do
  case "$1" in
    --steps) steps="$2"; shift ;;
    --quota-after) quota_after="$2"; shift ;;
    -h | --help) sed -n '2,30p' "$0"; exit 0 ;;
    *) say "unknown argument: $1"; exit 2 ;;
  esac
  shift
done
has() { [[ ",$steps," == *",$1,"* ]]; }

# Re-exec under Doppler once, mapping the secrets into what the suite reads.
if [ -z "${AITP_LIVE_SECRETS_LOADED:-}" ]; then
  exec doppler run --project aitp-ui-console --config prd -- env AITP_LIVE_SECRETS_LOADED=1 "$0" --steps "$steps" ${quota_after:+--quota-after "$quota_after"}
fi
needles=""
for k in PLAYGROUND_URL CP_URL PLAYGROUND_API_KEY CP_API_KEY CP_READ_API_KEY CONSOLE_SESSION_SECRET; do
  v="${!k:-}"
  [ -n "$v" ] && needles+="$k=$v"$'\n'
done
export AITP_LIVE_LEAK_NEEDLES="$needles"
unset needles PLAYGROUND_URL CP_URL PLAYGROUND_API_KEY CP_API_KEY CP_READ_API_KEY CONSOLE_SESSION_SECRET v
export AITP_LIVE=1 # CONSOLE_PASSWORD stays in the environment for the operator projects

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
export AITP_LIVE_RUN_DIR="${AITP_LIVE_RUN_DIR:-$root/e2e/live/.evidence/$stamp}"
mkdir -p "$AITP_LIVE_RUN_DIR"
export QUOTA_STATE_FILE="$AITP_LIVE_RUN_DIR/quota-state.json"
export QUOTA_WORKDIR="${QUOTA_WORKDIR:-$AITP_LIVE_RUN_DIR/quota-workdir}"
summary="$AITP_LIVE_RUN_DIR/summary.tsv"
printf 'step\tresult\tat\n' >"$summary"
mark() { printf '%s\t%s\t%s\n' "$1" "$2" "$(date -u +%FT%TZ)" >>"$summary"; say "$1: $2"; }

npx playwright install chromium >/dev/null 2>&1 || { say "playwright browser install failed"; exit 1; }
pw() { npx playwright test -c playwright.live.config.ts "$@"; }
# run_step NAME CMD...: run CMD and record PASS/FAIL under NAME.
run_step() {
  local name="$1"; shift
  if "$@"; then mark "$name" PASS; else mark "$name" FAIL; fi
}

quota_touched=0
restore_quota() {
  [ "$quota_touched" = 1 ] || return 0
  say "restoring the playground quota (trap)"
  if "$here/quota-window.sh" restore; then mark restore PASS; quota_touched=0; else mark restore FAIL; fi
}
trap 'restore_quota' EXIT
trap 'exit 130' INT TERM

if has vercel; then run_step vercel "$here/check-vercel-main.sh"; fi
if has security; then run_step security pw --project security; fi
if has read; then run_step read-limit pw --project read-limit; fi

if has raise || has low; then
  if ! "$here/quota-window.sh" preflight; then
    mark quota-preflight FAIL
    say "quota preflight refused; skipping every quota step"
    steps="$(tr ',' '\n' <<<"$steps" | grep -vE '^(raise|low|quota|restore)$' | paste -sd, -)"
  else
    mark quota-preflight PASS
  fi
fi
if has raise; then
  quota_touched=1
  run_step raise "$here/quota-window.sh" raise
fi
if has matrix; then
  run_step matrix-anon pw --project matrix-anon
  run_step matrix-operator pw --project matrix-operator
fi
if has low; then
  if [ -n "$quota_after" ]; then
    now=$(date -u +%s)
    target=$(date -u -j -f '%Y-%m-%d %H:%M' "$(date -u +%F) $quota_after" +%s 2>/dev/null || date -u -d "$(date -u +%F) $quota_after" +%s)
    [ "$target" -gt "$now" ] || target=$((target + 86400))
    say "waiting until $quota_after UTC before lowering the quota ($(( (target - now) / 60 )) min)"
    sleep $((target - now))
  fi
  quota_touched=1
  if "$here/quota-window.sh" low; then
    mark low PASS
    if has quota; then AITP_LIVE_QUOTA_WINDOW=low run_step quota-badge pw --project quota; fi
  else
    mark low FAIL
  fi
fi
if has restore; then restore_quota; fi
if has launch; then run_step launch-limit pw --project launch-limit; fi

say "evidence: $AITP_LIVE_RUN_DIR"
column -t -s $'\t' "$summary" >&2
! grep -q $'\tFAIL\t' "$summary"
