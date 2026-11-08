# PROGRESS — console-rollout-wave4

Plan: `plans/console-rollout-wave4.md` (local, gitignored). Wave 4 of aitp-hardening: rollout steps 3–6.
Previous run's log: `plans/archive/console-lockdown-wave3-PROGRESS.md` (local).

## Repo map (for this plan)
- `src/lib/api/proxy.ts`: upstream helpers; `makeError` L278 (502/504 envelope), callers L333/336/419/422/511; `upstreamFetch` L169; `__testing` L558.
- `src/lib/server/access.ts`: per-request access decision (flag, session, allowlist class, limits).
- `src/lib/server/allowlist.ts`: ALLOWLIST, `matchRoute`; `allowlist.test.ts` L14-160 holds the route walk + `ADMIN_EXPECTED` oracle.
- `src/proxy.ts`: edge gate (public mode opens pages, /api/cp, /api/playground, /api/auth/session).
- `src/lib/api/proxy.test.ts`: `loadProxy`, `KEYS`, `ENV_NAMES`, `mockFetch`, `browserReq` helpers; flag-on helper tests L1248+.
- `src/app/api/{cp,playground}/**/route.ts`: 62 handlers.
- `deploy/doppler-sync.sh` + `deploy/doppler-keys.txt`: Doppler aitp-ui-console/prd → Vercel Production (`--apply` redeploys).
- Sibling: `aitp-playground/deploy/doppler-sync.sh playground [--apply]`, allowlist `deploy/doppler-keys/playground.txt` (no CP_READ_API_KEY).
- Gates: `npm run lint && npm run typecheck && npm test && npm run build`; integration `RUN_INTEGRATION=1` (jest.integration.config.js).

## Phase log
- 2026-11-08 P1 DONE (1 verify round, inline): `makeError` emits `target: clientTarget(url)` (path+query; configured base
  stripped first so a base path prefix doesn't leak); log keeps full URL. proxy.test 97 pass.
- 2026-11-08 P2 DONE: `src/test/route-inventory.ts` (shared walk) + `src/test/public-mode-routes.test.ts` (132 tests: 62
  handlers × operator/anonymous through edge gate + handler; launch 429; foreign Origin 403; IP spoof; read-key 401→503;
  no anonymous cp-admin). Mutation check: flipping /api/audit to public fails 2 tests.
- 2026-11-08 Gates: lint, typecheck, 2123 unit tests, build — all green.
- 2026-11-08 P3 DONE (ops): Doppler aitp-playground/prd AITP_PLAYGROUND_REQUIRE_API_KEY false→true (was `false\n`),
  `doppler-sync.sh playground --apply`, Doppler = Railway hash after apply, redeploy. Keyless /agents /runs /scenarios
  /metrics 401; /healthz 200; keyed 200; console Basic reads 200; LLM run research-and-write@1.1.0 success
  (internal llm-quota 3×200, telemetry 36×200 via loopback); webhook-subscription success, CP→playground webhooks 2×200.
  Pre-flip caller check: only console (sends key) + owner scripts. Vercel prod has PLAYGROUND_API_KEY; it hash-matches
  the playground's.
- 2026-11-08 P4 DONE (ops, read-only): CP_API_KEY_CONSOLE_RO = console CP_READ_API_KEY (hash match; prefixes in the board report). At CP: read
  key 200 on /api/registry/agents, /api/dashboard/overview; 403 READ_ONLY_KEY on /api/audit, /api/metrics.
- 2026-11-08 Verify round 1: GAPS (hostnames in public doc; CP https wording; clientTarget base-prefix collision;
  key hash prefixes in PROGRESS) — all closed.
- 2026-11-08 P5 DONE: `internal_docs/RAILWAY-DOMAINS.md` (public repo → hostnames/ports only; Railway IDs and source IPs
  go to the board report). Recommendation: keep both domains. No domain changed.
