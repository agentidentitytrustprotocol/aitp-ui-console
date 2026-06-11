# aitp-console

A Next.js 15 monitoring and control console for the AITP ecosystem.

It talks to two backend services — the **playground** (Python FastAPI,
runs scenarios on `:8000`) and the **control plane** (Next.js, registry
+ audit on `:4000`) — through server-side BFF proxy routes that keep
API keys off the browser.

### Upstream services

The console owns no data of its own; it renders state from two sibling
repos. For what that state *means*, read their docs — this console's docs
deliberately don't duplicate them:

| Service | Repo | Docs |
| --- | --- | --- |
| Playground (scenarios, runs, live timeline) | [`aitp-playground`](https://github.com/agentidentitytrustprotocol/aitp-playground) | [agentidentitytrustprotocol.io/playground](https://agentidentitytrustprotocol.io/playground) |
| Control plane (registry, sessions, audit, trust, webhooks) | [`aitp-control-plane`](https://github.com/agentidentitytrustprotocol/aitp-control-plane) | [agentidentitytrustprotocol.io/control-plane](https://agentidentitytrustprotocol.io/control-plane) |
| Protocol spec | [`agentidentitytrustprotocol`](https://github.com/agentidentitytrustprotocol/agentidentitytrustprotocol) | [agentidentitytrustprotocol.io/spec](https://agentidentitytrustprotocol.io/spec) |

## Sections

| Section | Path | Backend(s) |
| --- | --- | --- |
| Dashboard | `/dashboard` | CP — KPIs, time-series, top capabilities |
| Scenarios | `/scenarios` | Playground — pack tree, scenario detail, run trigger (templates + variants + fault injection) |
| Runs | `/runs`, `/runs/[id]` | Playground — timeline + narration + per-run CP audit/sessions/deliveries |
| Monitor | `/monitor`, `/monitor/sessions/[id]` | CP — live event ticker, delegation tree, observed TCTs |
| Registry | `/registry`, `/registry/[aid]` | CP — agent table, manifest viewer, enrollment-token modal, deregister |
| Trust | `/trust` | CP — trust anchors, pinned SPKI keys, revocation entries |
| Audit | `/audit` | CP — filterable admin audit trail |
| Config | `/config` | Both — health/readiness, SDK capabilities, playground processes, metrics, CP identity, webhooks (with circuit breaker) |

## Commands

```bash
npm install
npm run dev                 # port 3001
npm run build
npm run typecheck
npm run lint
npm test                    # unit + component tests
npm run test:integration    # gated end-to-end tests (see internal_docs/TESTING.md)
```

## Documentation

Published docs (`docs/`, synced to the docs site under `/console`):

- [`FEATURES.md`](https://agentidentitytrustprotocol.io/console/features) —
  what each section does and the key operator flows (run trigger,
  enrollment, revocation, live feeds)
- [`ARCHITECTURE.md`](https://agentidentitytrustprotocol.io/console/architecture) —
  topology, BFF proxy rationale, layering, SSE design, type flow
- [`PROXIES.md`](https://agentidentitytrustprotocol.io/console/proxies) —
  every BFF route mapped to its upstream, plus the "adding a new proxy"
  recipe
- [`CONVENTIONS.md`](https://agentidentitytrustprotocol.io/console/conventions) —
  code layout, hook / component / proxy patterns, accessibility

Contributor docs live in
[`internal_docs/`](https://github.com/agentidentitytrustprotocol/aitp-ui-console/tree/main/internal_docs)
(repo only — **not** published to the docs site): `DEVELOPMENT.md`
(first-time setup, day-to-day, adding a route), `TESTING.md` (unit +
integration suites, env gates), `DEPLOYMENT.md` (Vercel, env vars, SSE
plan sizing, CI).

For the upstream services this console renders, see the
[playground](https://agentidentitytrustprotocol.io/playground) and [control plane](https://agentidentitytrustprotocol.io/control-plane) docs.

## Quick start

```bash
cd aitp-ui-console
npm install
cp .env.example .env.local   # API keys can stay blank for local
npm run dev                  # → :3001
```

The console runs on its own — if an upstream is down the topbar shows a
red dot and the relevant section falls back to an empty state (no
crashes). To drive live data, bring up the two siblings per their own
docs ([control plane](https://agentidentitytrustprotocol.io/control-plane),
[playground](https://agentidentitytrustprotocol.io/playground/getting-started)). The full three-terminal loop
is in [`internal_docs/DEVELOPMENT.md`](https://github.com/agentidentitytrustprotocol/aitp-ui-console/tree/main/internal_docs).

## Architecture at a glance

```
Browser → fetch('/api/cp/registry/agents')
       → Next.js Route Handler (src/app/api/cp/registry/agents/route.ts)
          → proxyGet('cp', '/api/registry/agents', req)
            adds Authorization: Bearer ${CP_API_KEY}
          → http://localhost:4000/api/registry/agents
       ← JSON response, forwarded to browser
```

Every BFF route follows the same 4-line pattern; the full route → upstream
map is in [`PROXIES.md`](https://agentidentitytrustprotocol.io/console/proxies). SSE streams
(`/runs/:id/events`, `/api/events/stream`) use `proxySse`, which keeps
the upstream response body open and re-emits it with
`Content-Type: text/event-stream`.

Real-time is handled with native `EventSource` via `useSse`
(auto-reconnect with exponential backoff, page-visibility pausing). No
WebSocket library.

REST is `fetch` + TanStack Query. Component-level state only — no
global store yet.

See [`ARCHITECTURE.md`](https://agentidentitytrustprotocol.io/console/architecture) for the full
breakdown.
