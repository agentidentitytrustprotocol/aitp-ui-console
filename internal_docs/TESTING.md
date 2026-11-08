# Testing

> **Contributor doc — repo only.** Files in `internal_docs/` are **not**
> published to the docs site (the website syncs `docs/` only). For the
> user-facing docs see [`docs/`](../docs) or
> <https://agentidentitytrustprotocol.io/console>.

Two test commands, three tiers:

| Command | What it runs | When to use |
| --- | --- | --- |
| `npm test` | Unit tests (jsdom) — utils, colors, hooks, components, proxy with mocked `fetch` | Every push, every PR (CI runs this with coverage) |
| `npm run test:integration` | **Self-contained** route-handler tests (always run, no services needed — CI runs these too) plus **live-service** end-to-end tests (env-gated) | Route-handler tests: every PR. Live-service tests: before merging changes that touch proxy contracts or live UI flow |

The live-service suites are gated by env vars and skip silently when
those vars aren't set, so the command is safe to run anywhere.

## Unit tests (`npm test`)

Live next to the code: `src/**/*.test.ts(x)`. They run in a `jsdom`
environment and use `@testing-library/react` + `@testing-library/jest-dom`.

Stubs:

- `src/test/lucide-stub.tsx` — `lucide-react` ships ESM-only icon files
  that ts-jest can't transform under `module: commonjs`. The stub
  intercepts the package and returns tiny `<svg data-icon="Name" />`
  stand-ins. Tests can still locate icons via
  `container.querySelector('[data-icon="Shield"]')` if needed.
- `src/test/recharts-stub.tsx` — same reasoning for recharts. Charts
  render as empty `<div>`s.
- `src/test/polyfills.ts` — installs a fake `EventSource` on the global
  object before any test loads. Tests can drive it via
  `(globalThis as any).EventSource.instances[0].open() / .emit(payload) /
  .fail() / .close()`. See `src/hooks/use-sse.test.tsx` for examples.

What's covered:

- `lib/utils.ts` — `cn`, `formatAid`, `formatGrants`, `shortId`,
  `timeAgo` (with `jest.useFakeTimers`)
- `lib/colors.ts` — `eventColor`, `boundaryColor`, `statusColor`
- `lib/export.ts` — `toCsv` (RFC-4180 escaping) and `downloadText`
  (anchor lifecycle + deferred `URL.revokeObjectURL`)
- `lib/api/client.ts` — `getJSON/postJSON/putJSON/patchJSON/delJSON`:
  method/headers/body, `cache: no-store`, the `method path failed: status`
  error (with/without/truncated detail), an error-body read that throws,
  and the merged abort/timeout signal
- `lib/api/proxy.ts` — every helper (`proxyGet/Post/Put/Delete/Sse`),
  including the 204-no-body case and the "upstream is down" 502
  envelope
- `hooks/use-sse.ts` — connect / parse / ignore-garbage / close-on-unmount
  / error path
- `hooks/{use-trust, use-sessions, use-run-extras}.ts` — query hooks:
  filter→query-string building, `encodeURIComponent` of ids, the
  `enabled` gate (idle until a non-null id, replay also waits on its
  flag), and `useRunNarrate`'s plain-text read + error path
- `components/shared/{aid-cell, status-badge, boundary-badge,
  capability-badge}.tsx` — render + interaction
- `components/shared/{time-ago, tab-bar, modal}.tsx` — interval
  re-render + cleanup; active-tab styling and count-badge nullish rules;
  modal ESC / backdrop / close-button dismissal, the `dismissable=false`
  lock, and body-scroll lock + restore
- `components/scenarios/run-input-form.tsx` — JSON-schema-driven control
  rendering (string, enum, boolean, number) and submission
- `components/runs/agent-status-grid.tsx` — state machine derived from
  the event stream

Add tests for new components by colocating `<name>.test.tsx`. If the
component depends on TanStack Query, wrap it with `renderWithClient`
from `src/test/test-utils.tsx`.

## Integration tests (`npm run test:integration`)

Live in `src/test/*.integration.test.ts`. They run in `node` and hit
real HTTP.

### Self-contained: `bff-routes.integration.test.ts` (no gate, no services)

Spins up an in-process `node:http` mock upstream, points
`PLAYGROUND_URL` / `CP_URL` at it, and calls the actual Next.js route
handlers directly. Covers the routing contract end-to-end: path mapping,
query/body passthrough, auth-header injection, catch-all segment
encoding, status + content-type passthrough, 204 empty-body handling,
SSE streaming (including the 503 capacity signal), and the synthesized
502 envelope. Runs in under a second and is part of CI.

Because `serverConfig` reads env at module load, the suite requires all
`@/` modules lazily inside `beforeAll` — keep it that way when adding
cases.

### Live-service suites

The remaining suites hit a real running console + siblings. There are
two env gates:

| Gate | Default | What runs |
| --- | --- | --- |
| `RUN_INTEGRATION=1` | off | Proxy contract tests (`proxies.integration.test.ts`): each BFF route is hit and the response shape is compared against the live upstream contract. SSE connectivity is verified by opening the stream and asserting it stays alive. Plus CP write flows (`cp-mutations.integration.test.ts`): the full webhook lifecycle — create → update → circuit-breaker read → reset → delete — with self-cleanup. |
| `RUN_LLM_INTEGRATION=1` | off | Additionally runs a real scenario end-to-end: triggers `intra-org/research-and-write@1.0.0` (or `SCENARIO_REF`), follows the SSE event timeline, asserts the run reaches `success` and emits the expected lifecycle milestones. **This calls the configured LLM provider in the playground and may incur API cost.** |

### Prerequisites

You need all three services running: the console (`npm run dev` on :3001)
plus the two upstreams. Start the upstreams per their own docs —
[control plane](https://agentidentitytrustprotocol.io/control-plane) and
[playground getting-started](https://agentidentitytrustprotocol.io/playground/getting-started) — or see the
day-to-day section in [DEVELOPMENT.md](./DEVELOPMENT.md#day-to-day) for the
three-terminal layout.

Override the targets with `CONSOLE_URL`, `PLAYGROUND_URL`, `CP_URL` env
vars if your services aren't on the default ports.

### Run it

```bash
# Just proxy contracts (no LLM cost)
RUN_INTEGRATION=1 npm run test:integration

# Full pipeline including a real scenario run (~30–120s, LLM cost)
RUN_INTEGRATION=1 RUN_LLM_INTEGRATION=1 npm run test:integration

# Pick a different scenario
RUN_INTEGRATION=1 RUN_LLM_INTEGRATION=1 \
  SCENARIO_REF=intra-org/trust-gate@1.0.0 \
  npm run test:integration

# Bump the LLM timeout (default 240s)
RUN_INTEGRATION=1 RUN_LLM_INTEGRATION=1 \
  LLM_RUN_TIMEOUT_MS=600000 \
  npm run test:integration
```

### What gets verified

- `proxies.integration.test.ts`
  - Every documented BFF route returns a non-error status and the
    documented payload shape (including `events/history`, the separate
    admin `audit` log, and both `.well-known` documents).
  - SSE endpoints (`/api/cp/events/stream`, `/api/playground/runs/:id/events`)
    open with `text/event-stream` and a non-empty body.
- `cp-mutations.integration.test.ts`
  - Webhook lifecycle through the proxy: create (`POST /api/cp/webhooks`),
    update (`PUT …/[id]`), circuit-breaker read + reset, delete, and
    absence from the list afterwards. The webhook targets an RFC-reserved
    `.invalid` host so the CP can never deliver to a real endpoint.
- `scenario-run.integration.test.ts`
  - `POST /api/playground/runs` returns a `run_id`.
  - SSE stream emits `run.started → agent.spawning → agent.ready →
    trust.established → step.complete → run.complete` in order.
  - `GET /api/playground/runs/:id` shows a terminal `success` state and
    a non-empty events list.

### Skipping behavior

`describeIntegration(...)` from `src/test/integration-utils.ts` aliases
to `describe.skip` when `RUN_INTEGRATION` isn't `1`. `describeLlm(...)`
does the same for `RUN_LLM_INTEGRATION`. This means you can wire the
suite into CI unconditionally — without the gate vars, every test
skips and exits 0.

## Live public-console suite (`npm run test:live`)

A Playwright suite that drives the **production** console (public mode) end
to end: real Railway backends, real LLM, real money. It is local-only.
`playwright.live.config.ts` throws unless `AITP_LIVE=1`, and both it and
`scripts/live/*.sh` refuse when `CI` is set. CI never collects or runs it
(jest only matches `src/**` and `e2e/**/*.test.ts`, the pure helpers).

```bash
npm run test:live                              # full run (order below)
scripts/live/run-live.sh --steps security,read # a subset
scripts/live/run-live.sh --quota-after 00:05   # lower the quota only after 00:05 UTC
```

`run-live.sh` re-execs under `doppler run --project aitp-ui-console --config prd`.
It turns the backend URLs and keys into *leak needles*: the test process
gets them as one env var, and they are unset from everything else. The
operator password stays in the environment for the signed-in projects.
Nothing secret is printed. Evidence goes to
`e2e/live/.evidence/<stamp>/` (gitignored, redacted to labels):
`summary.tsv`, `evidence.jsonl`, `report.json`, `quota-badge.png`.

| Step | What it proves | Spec / script |
| --- | --- | --- |
| vercel | production deployment == latest `main` commit's Vercel deployment | `scripts/live/check-vercel-main.sh` |
| security | anonymous session is `publicMode`; every admin route (24) answers 403 `CONSOLE_OPERATOR_SESSION_REQUIRED` signed out; an operator reaches them; no needle on the wire (URL, headers, bodies) or in any `/_next/static` chunk | `e2e/live/security.live.spec.ts` |
| read | a read flood (4 concurrent) gets a console 429 `CONSOLE_RATE_LIMITED` + `Retry-After`; the bucket is per Vercel instance, so it can take more than 300 reads (seen: 716) | `e2e/live/read-limit.live.spec.ts` |
| raise | playground per-IP LLM quota → 400/1000 so the matrix runs on the real LLM | `scripts/live/quota-window.sh raise` |
| matrix | every scenario from `GET /api/playground/scenarios`, launched through the UI, signed out and signed in; terminal status, LLM checks and a complete event replay | `e2e/live/matrix.live.spec.ts` |
| low / quota | quota → 1/1000; an LLM run falls back to mock and the run page shows the quota badge | `quota-window.sh low`, `e2e/live/quota.live.spec.ts` |
| restore | quota → 30/300; the managed hash must equal the start hash (an `EXIT` trap restores on any exit) | `quota-window.sh restore` |
| launch | back-to-back launches get a console 429 + `Retry-After` within the 5/10 min budget | `e2e/live/launch-limit.live.spec.ts` |

**Cost guard.** Every paid launch goes through `launchGuard` (`e2e/live/support/budget.ts`):
it paces launches `AITP_LIVE_PACE_SECONDS` apart (default 180) and stops at
`AITP_LIVE_MAX_LAUNCHES` (default 80) per run. The state is persisted so the
cap holds across projects. Use `AITP_LIVE_REFS=a@1,b@1` to limit the matrix.

**Classification.** A 429 from the playground (`run_rate_limited`,
`max_concurrent_runs`) or from the shared egress IP is *environmental*. It
gets one retry after `Retry-After`. A failure on retry is *flaky* if the
first attempt passed elsewhere, otherwise *real*.

**Quota window.** Only this repo may change the playground quota. The source
of truth is Doppler `aitp-playground/prd`. The playground's own
`deploy/doppler-sync.sh` (run from a throwaway `git archive` of its
`origin/main`) pushes it to Railway and redeploys. `preflight` refuses unless
Railway == Doppler == the baseline hash. The quota is lowered after the UTC
daily reset (`--quota-after`), so restoring it does not leave the shared IP
over its daily count.

**By-design exposure (exempt, nothing else is).** `byDesign()` in
`e2e/live/support/leaks.ts` exempts exactly two things:

- the Google Fonts hosts that `globals.css` imports;
- the CP's public `handshake_endpoint` inside a *signed* AITP manifest body
  (`/api/cp/well-known/aitp-manifest`, `/api/cp/registry/agents/*/manifest`).
  The console relays it unchanged because rewriting it would break the
  signature (see RAILWAY-DOMAINS.md).

A key needle is never exempt.

## CI

What `.github/workflows/ci.yml` actually runs today (see
[DEPLOYMENT.md](./DEPLOYMENT.md#ci) for the full step list):

- `npm test -- --ci --coverage` — unit suite with coverage; the summary
  lands in the job summary and `lcov.info` is uploaded as an artifact.
- `npm run test:integration -- --ci` — the self-contained
  `bff-routes` suite runs for real; the live-service suites skip
  (no `RUN_INTEGRATION` in CI).

The live-service suites stay local-only for now because they need the
sibling repos running. If we later publish CP/playground container
images, the natural next step is a `workflow_dispatch` job that brings
them up via docker compose, waits on their health endpoints, and runs
`RUN_INTEGRATION=1 npm run test:integration` (keep the LLM gate manual —
it costs money).
