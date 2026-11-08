# Progress: console-lockdown-wave3

Plan: `plans/console-lockdown-wave3.md` (aitp-hardening wave 3, console). Branch
`feature/console-lockdown-wave3`. The previous plan's map (absorb-cp-playground-changes,
archived) is in git history; this repo keeps one active plan's map at a time.

## Repo map
- `src/proxy.ts`: Next 16 edge/Node gate. Password session or Basic, fail-closed 503, Origin check on mutations.
- `src/lib/api/proxy.ts`: every upstream call (`runProxy`, `proxySse`, `proxyGetVerified`, `fetchUpstreamText`). Headers are built in `serviceHeaders` (L16-21).
- `src/lib/config.ts`: `serverConfig` (URLs and keys, captured at import), `consoleAuthConfig` (per request).
- `src/lib/auth/rate-limit.ts`: sliding-window limiter, `clientIp` (leftmost XFF, to be replaced), `loginLimiter`.
- `src/lib/auth/session.ts`: HMAC session cookie, `verifySession`, `basicAuthMatches` (Web Crypto).
- `src/app/login/route.ts`, `src/app/logout/route.ts`: login form/JSON, cookie issue.
- `src/app/api/{cp,playground}/**/route.ts`: 62 handlers in 50 files. Route → upstream table in `docs/PROXIES.md`.
- `src/lib/types/playground.ts`: RunSummary (L115), RunEvent (L146), RunResponse (L226), RunStatus (L237).
- `src/components/runs/run-summary.tsx`, `event-cards.tsx` (switch on evt.type L34), `run-list.tsx`: quota badge targets.
- `src/components/scenarios/run-input-form.tsx`: the launch form (429 copy).
- Admin UI callers: `hooks/use-trust.ts` (anchor/pinned writes, revocations, revocation/entries), `hooks/use-playground-meta.ts:32,43` (metrics), `components/config/webhook-list.tsx:48,171`, `components/runs/run-detail.tsx:76` (cancel), `hooks/use-webhooks.ts`, `hooks/use-enrollment.ts` + `components/registry/enrollment-modal.tsx`, `hooks/use-hosted-agents.ts`, `hooks/use-circuit-breaker.ts`. Not admin: `use-audit.ts` (events/history). 429 surfaces: `lib/api/client.ts:51-66` (ApiError), `components/scenarios/scenario-detail.tsx:23,137-149`, `hooks/use-sse.ts:125-146`.
- `deploy/doppler-sync.sh` + `deploy/doppler-keys.txt`: Doppler aitp-ui-console/prd → Vercel Production. `--apply` redeploys; a sensitive key needs `--push`.
- `internal_docs/DEPLOYMENT.md` L145-161: the Preview set (holds PLAYGROUND_API_KEY today; to be removed).
- Tests: jest unit (`npm test`), integration `jest.integration.config.js` (`RUN_INTEGRATION=1`, live stack).
- Gates: `npm run lint && npm run typecheck && npm test && npm run build`. `format:check` fails on main itself (151 files under prettier 3.9.10) and CI does not run it, so this PR formats only the files it touches; a repo-wide reformat is out of scope.

## Sibling contracts (read 2026-11-08)
- playground: `x-api-key`; `X-AITP-Client-IP` only with a valid key. 429 shapes: `{code,limit,retry_after,detail}` and `{detail}`. Event `llm.quota_exceeded`; run fields `llm_quota_exceeded`, `llm_quota{reason,quota,limit,resets_at}` and `llm_calls_on_mock`.
- control-plane: Bearer only; read allowlist at `aitp-control-plane/src/proxy.ts:70-92` (cd8079c); 403 `{code:READ_ONLY_KEY}`, 401 `INVALID_API_KEY`; strips caller x-aitp-client-ip.

PR strategy: one PR. It is a single feature behind a flag, and the phases are sequential.
Risk tiers: P1, P2 and P3 complex (foundation, upstream boundary, trust boundary); P4 and P5 simple (batched gate); P6 runs post-merge on prod.

## Phase log
- 2026-11-07 P1 server primitives: PASS after 2 rounds (Opus; complex, a foundation that P2 and P3 build on).
  - Round 1 found GAPS: G1, an unflagged repo-wide prettier reformat, reverted; G2, the login limiter did not bucket IPv6 by /64, fixed with `rateLimitKey`; G3, the coverage test could not see route-path drift, fixed by deriving each path from the route source and requiring it to match the same entry. Nits fixed: limiter dedupes repeated checks; eviction comment; the login test restores `VERCEL`.
  - Files: `src/lib/server/{public-mode,client-ip,limits,allowlist}.ts` + tests, `src/lib/auth/rate-limit.ts` (+test), `src/app/login/route.ts` (+test). Next: P2.
- 2026-11-07 P2 backend credentials + client IP: PASS after 2 rounds (Opus; complex, the upstream boundary and key custody).
  - Round 1 found GAPS: G1, fetch followed redirects, so `x-api-key` could reach another host; fixed with `redirect: 'manual'`. G2, no tests for the 401 body cancel or the log-throttle re-arm; added. G3, no test for the scenario-ref encoding; added a route test. G4, `upstreamFetch` was exported and the 403 relay copied every upstream header; it is now module-private (`__testing`), and the relay uses `errorHeaders`.
  - Formatting: three touched files (`bff-routes.integration.test.ts`, `docs/PROXIES.md`, `internal_docs/DEPLOYMENT.md`) were already not prettier-clean at HEAD and stay in their existing style. Rule: format files that are new or were clean at HEAD.
  - Files: `src/lib/api/proxy.ts` (+test), `src/lib/config.ts`, `src/app/api/playground/scenario-templates/route.ts` (+new test), `src/test/bff-routes.integration.test.ts`, `docs/PROXIES.md`, `internal_docs/DEPLOYMENT.md`.
  - Carry into P3: the no-direct-fetch test must also forbid importing `__testing` (or anything other than the `proxy*` helpers) from `@/lib/api/proxy` outside tests. Next: P3.

