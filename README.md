# aitp-console

A Next.js 15 monitoring and control console for the AITP ecosystem.

It talks to two backend services — the **playground** (Python FastAPI,
runs scenarios on `:8000`) and the **control plane** (Next.js, registry
+ audit on `:4000`) — through server-side BFF proxy routes that keep
API keys off the browser.

## Sections

| Section | Path | Backend(s) |
| --- | --- | --- |
| Dashboard | `/dashboard` | CP — KPIs, time-series, top capabilities |
| Scenarios | `/scenarios` | Playground — pack tree, scenario detail, run trigger |
| Runs | `/runs`, `/runs/[id]` | Playground — run history + live SSE timeline |
| Monitor | `/monitor`, `/monitor/sessions/[id]` | CP — live event ticker, session trace |
| Registry | `/registry`, `/registry/[aid]` | CP — agent table + manifest viewer |
| Config | `/config` | Both — health, CP identity, webhooks |

## Commands

```bash
npm install
npm run dev                 # port 3001
npm run build
npm run typecheck
npm run lint
npm test                    # unit + component tests
npm run test:integration    # gated end-to-end tests (see docs/TESTING.md)
```

## Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — topology, BFF
  proxy rationale, layering, SSE design, type flow
- [`docs/PROXIES.md`](./docs/PROXIES.md) — every BFF route mapped to
  its upstream, plus the "adding a new proxy" recipe
- [`docs/TESTING.md`](./docs/TESTING.md) — unit + integration test
  suites, env gates, CI strategy
- [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) — first-time setup,
  day-to-day workflow, conventions

## Quick start

```bash
# 1) Console
cd aitp-ui-console
npm install
npm run dev               # → :3001

# 2) Control plane
cd ../aitp-cp
docker compose up -d postgres
npm install && npm run db:migrate
ENROLLMENT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  npm run dev             # → :4000

# 3) Playground
cd ../aitp-playground
uv run uvicorn aitp_playground.main:app --reload --port 8000
```

If a service is down the topbar shows a red dot and the relevant
section falls back to an empty state — no crashes.

## Architecture at a glance

```
Browser → fetch('/api/cp/registry/agents')
       → Next.js Route Handler (src/app/api/cp/registry/agents/route.ts)
          → proxyGet('cp', '/api/registry/agents', req)
            adds Authorization: Bearer ${CP_API_KEY}
          → http://localhost:4000/api/registry/agents
       ← JSON response, forwarded to browser
```

All 20 proxy routes follow the same 4-line pattern. SSE streams
(`/runs/:id/events`, `/api/events/stream`) use `proxySse`, which keeps
the upstream response body open and re-emits it with
`Content-Type: text/event-stream`.

Real-time is handled with native `EventSource` via `useSse`
(auto-reconnect with exponential backoff, page-visibility pausing). No
WebSocket library.

REST is `fetch` + TanStack Query. Component-level state only — no
global store yet.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full
breakdown.
