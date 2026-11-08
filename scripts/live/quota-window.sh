#!/usr/bin/env bash
#
# Temporarily change the playground's per-IP LLM quota for the live suite,
# and put it back. Only aitp-ui-console runs this (wave-7 charter): the matrix
# needs headroom (raise), the quota-badge test needs a tiny quota (low), and
# the quota must end at its managed baseline (restore), confirmed by hash.
#
#   scripts/live/quota-window.sh preflight      # refuse unless Railway == Doppler == baseline
#   scripts/live/quota-window.sh raise          # day/month = 400/1000 (matrix headroom)
#   scripts/live/quota-window.sh low            # day/month = 1/1000   (badge test)
#   scripts/live/quota-window.sh restore        # day/month = 30/300, then hash must equal the start hash
#   scripts/live/quota-window.sh hash           # print the managed-hash line (dry run)
#
# Mechanism: Doppler aitp-playground/prd is the source of truth; the
# playground's own deploy/doppler-sync.sh pushes it to Railway and redeploys.
# That script is run from a throwaway export of the playground's origin/main
# (the sibling checkout may be busy with its own unit, and --apply needs a
# clean tree), so nothing in the playground checkout is touched.
#
# Secrets: the quota values are plain numbers. The sync script and this one
# print key names, statuses and 16-hex hash prefixes only. The Railway token
# is read the same way the sync script reads it and never reaches argv.
#
# Env: AITP_PLAYGROUND_DIR (default ../aitp-playground), QUOTA_WORKDIR
# (default a mktemp dir), QUOTA_BASELINE_HASH (default 2bee7fda6781ed36),
# QUOTA_STATE_FILE (records the start hash for restore), QUOTA_DEPLOY_TIMEOUT
# (seconds, default 420).
#
# shellcheck disable=SC2016
set -euo pipefail

DAY_KEY=LLM_QUOTA_PER_IP_PER_DAY
MONTH_KEY=LLM_QUOTA_PER_IP_PER_MONTH
BASE_DAY=30
BASE_MONTH=300
BASELINE_HASH="${QUOTA_BASELINE_HASH:-2bee7fda6781ed36}"
DOPPLER_PROJECT=aitp-playground
DOPPLER_CONFIG=prd

say() { printf '[quota-window] %s\n' "$*" >&2; }
die() { say "error: $*"; exit 1; }
[ -z "${CI:-}" ] || die "refusing under CI: this changes production quota"
for c in git jq curl doppler tar shasum; do command -v "$c" >/dev/null || die "$c is not on PATH"; done

here="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$here/../.." && pwd)"
pg_dir="$(cd "${AITP_PLAYGROUND_DIR:-$repo_root/../aitp-playground}" && pwd)" || die "playground checkout not found"
state_file="${QUOTA_STATE_FILE:-$repo_root/e2e/live/.evidence/quota-state.json}"
mkdir -p "$(dirname "$state_file")"

# --- throwaway export of the playground's committed sync script ------------
workdir() {
  if [ -n "${QUOTA_WORKDIR:-}" ] && [ -x "$QUOTA_WORKDIR/deploy/doppler-sync.sh" ]; then
    printf '%s' "$QUOTA_WORKDIR"
    return
  fi
  local w="${QUOTA_WORKDIR:-$(mktemp -d "${TMPDIR:-/tmp}/aitp-quota-XXXXXX")}"
  mkdir -p "$w"
  git -C "$pg_dir" fetch --quiet origin main
  git -C "$pg_dir" archive origin/main deploy | tar -x -C "$w"
  git -C "$w" init --quiet
  git -C "$w" add -A
  git -C "$w" -c user.email=live-suite@localhost -c user.name=live-suite commit --quiet -m export
  printf '%s' "$w"
}
W="$(workdir)"
export QUOTA_WORKDIR="$W"
SYNC="$W/deploy/doppler-sync.sh"
[ -x "$SYNC" ] || die "sync script missing in export"

# Dry run, stderr folded in (the sync script logs through stderr).
dry_run() { "$SYNC" playground 2>&1; }

# From a dry-run transcript: "railway doppler verdict" of the hash line.
hash_of() { sed -nE 's/^hash: railway ([0-9a-f]{16}), doppler ([0-9a-f]{16}) \((match|differ)\)$/\1 \2 \3/p' <<<"$1"; }
# Key lines "  KEY<TAB>status" -> "KEY status".
statuses() { sed -nE 's/^  ([A-Z_][A-Z0-9_]*)\t([a-z-]+)$/\1 \2/p' <<<"$1"; }

# Every key must have a status in $1 (regex), except keys listed in $2 which must be "changed".
check_statuses() {
  local out="$1" ok_re="$2" changed="${3:-}" k s n=0
  while read -r k s; do
    [ -n "$k" ] || continue
    n=$((n + 1))
    if [[ " $changed " == *" $k "* ]]; then
      [ "$s" = changed ] || die "$k is '$s', expected 'changed'"
    else
      [[ "$s" =~ ^($ok_re)$ ]] || die "unexpected status: $k is '$s' (another change is pending in Doppler/Railway; refusing)"
    fi
  done <<<"$(statuses "$out")"
  [ "$n" -gt 0 ] || die "dry run printed no key statuses"
}

# --- Railway deployment tracking (query shape from aitp-playground scripts/release/check-latest.sh) ---
railway_token="${RAILWAY_API_TOKEN:-$(jq -r '.user.accessToken // .user.token // empty' ~/.railway/config.json 2>/dev/null || true)}"
[ -n "$railway_token" ] || die "no Railway token (railway CLI login or RAILWAY_API_TOKEN)"
gql() {
  jq -nc --arg q "$1" --argjson v "$2" '{query: $q, variables: $v}' |
    curl -fsS --max-time 30 https://backboard.railway.com/graphql/v2 \
      -H @<(printf 'Authorization: Bearer %s\n' "$railway_token") -H 'content-type: application/json' --data-binary @- |
    jq -e 'if .errors then error("railway: \(.errors | map(.message) | join("; "))") else .data end'
}
# IDs come from the exported sync script, so none is committed here.
project_id="$(sed -nE 's/^RAILWAY_PROJECT_ID=([0-9a-f-]+).*/\1/p' "$SYNC")"
env_name="$(sed -nE 's/^RAILWAY_ENVIRONMENT=([A-Za-z0-9_-]+).*/\1/p' "$SYNC")"
[ -n "$project_id" ] && [ -n "$env_name" ] || die "could not read the Railway project from the sync script"
ids="$(gql 'query($p: String!){project(id: $p){environments{edges{node{id name}}} services{edges{node{id name}}}}}' \
  "$(jq -nc --arg p "$project_id" '{p: $p}')")" || die "Railway project lookup failed"
env_id="$(jq -r --arg n "$env_name" '.project.environments.edges[].node | select(.name == $n) | .id' <<<"$ids")"
svc_id="$(jq -r '.project.services.edges[].node | select(.name == "aitp-playground") | .id' <<<"$ids")"
[ -n "$env_id" ] && [ -n "$svc_id" ] || die "Railway environment/service not found"
latest_deploy() {
  gql 'query($p:String!,$e:String!,$s:String!){deployments(input:{projectId:$p,environmentId:$e,serviceId:$s},first:1){edges{node{id status createdAt}}}}' \
    "$(jq -nc --arg p "$project_id" --arg e "$env_id" --arg s "$svc_id" '{p: $p, e: $e, s: $s}')" |
    jq -c '.deployments.edges[0].node // {}'
}
wait_new_deploy() {
  local before="$1" deadline=$(($(date +%s) + ${QUOTA_DEPLOY_TIMEOUT:-420})) node id st
  while :; do
    node="$(latest_deploy || echo '{}')"
    id="$(jq -r '.id // empty' <<<"$node")"
    st="$(jq -r '.status // empty' <<<"$node")"
    if [ -n "$id" ] && [ "$id" != "$before" ]; then
      case "$st" in
        SUCCESS) say "redeploy ${id:0:8} SUCCESS"; return 0 ;;
        FAILED | CRASHED | REMOVED) die "redeploy ${id:0:8} ended $st" ;;
      esac
    fi
    [ "$(date +%s)" -lt "$deadline" ] || die "redeploy did not reach SUCCESS in time (last: ${id:0:8} ${st:-?})"
    sleep 10
  done
}

# --- operations ----------------------------------------------------------
preflight() {
  local out h
  out="$(dry_run)" || die "dry run failed"
  check_statuses "$out" 'unchanged|absent'
  read -r -a h <<<"$(hash_of "$out")"
  [ "${#h[@]}" -eq 3 ] || die "no hash line in dry run"
  [ "${h[2]}" = match ] || die "Railway and Doppler differ before start (${h[0]} vs ${h[1]})"
  [ "${h[0]}" = "$BASELINE_HASH" ] || die "start hash ${h[0]} is not the baseline $BASELINE_HASH; refusing"
  jq -nc --arg h "${h[0]}" --arg at "$(date -u +%FT%TZ)" '{start_hash: $h, at: $at}' >"$state_file"
  say "preflight ok: all keys unchanged/absent, hash ${h[0]} (match, baseline)"
}

set_quota() {
  local day="$1" month="$2" out cur_day cur_month changed="" h before
  cur_day="$(doppler secrets get "$DAY_KEY" --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" --plain)"
  cur_month="$(doppler secrets get "$MONTH_KEY" --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" --plain)"
  [ "$cur_day" = "$day" ] || changed="$DAY_KEY"
  [ "$cur_month" = "$month" ] || changed="${changed:+$changed }$MONTH_KEY"
  if [ -z "$changed" ]; then
    out="$(dry_run)" || die "dry run failed"
    check_statuses "$out" 'unchanged|absent'
    say "quota already $day/$month in Doppler and Railway"
    return 0
  fi
  doppler secrets set "$DAY_KEY=$day" "$MONTH_KEY=$month" --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" >/dev/null ||
    die "doppler secrets set failed"
  out="$(dry_run)" || die "dry run failed"
  check_statuses "$out" 'unchanged|absent' "$changed"
  before="$(latest_deploy | jq -r '.id // empty')"
  "$SYNC" playground --apply 2>&1 | grep -E '^(  set |hash after apply|redeploy|apply:|error)' >&2 || die "sync --apply failed"
  wait_new_deploy "$before"
  out="$(dry_run)" || die "dry run failed"
  read -r -a h <<<"$(hash_of "$out")"
  [ "${h[2]:-}" = match ] || die "post-apply hash differs"
  say "quota now $day/$month per IP (day/month); managed hash ${h[0]}"
}

case "${1:-}" in
  preflight) preflight ;;
  raise) set_quota 400 1000 ;;
  low) set_quota 1 1000 ;;
  restore)
    set_quota "$BASE_DAY" "$BASE_MONTH"
    want="$( [ -f "$state_file" ] && jq -r '.start_hash // empty' "$state_file" || true)"
    want="${want:-$BASELINE_HASH}"
    read -r -a h <<<"$(hash_of "$(dry_run)")"
    [ "${h[0]:-}" = "$want" ] && [ "${h[2]:-}" = match ] || die "restore hash ${h[0]:-?} != start hash $want"
    say "RESTORED: $BASE_DAY/$BASE_MONTH, managed hash ${h[0]} == start hash (match)"
    ;;
  hash) hash_of "$(dry_run)" ;;
  *) sed -n '2,28p' "$0"; exit 2 ;;
esac
