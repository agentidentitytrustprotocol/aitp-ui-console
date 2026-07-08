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
