# Architecture

The console is a thin client on top of two backend services. It owns no
state of its own — the [playground](https://agentidentitytrustprotocol.io/playground) holds scenario
definitions and run history, the [control plane](https://agentidentitytrustprotocol.io/control-plane) holds the
agent registry, sessions, audit log, trust config, and webhook
subscriptions. The console's job is to render that state and let humans
drive workflows against it.

This doc is about the console's *shape*: topology, the BFF proxy, layering,
SSE, and data flow. For what each screen does, see
[FEATURES.md](https://agentidentitytrustprotocol.io/console/features); for the code conventions that follow from
this structure, see [CONVENTIONS.md](https://agentidentitytrustprotocol.io/console/conventions).

## Topology

```
┌──────────────────────────────────────────────────────────────┐
│ Browser (single-page, client components)                     │
│                                                              │
│   TanStack Query ──┐                                         │
│                    │ fetch()                                 │
│   useSse ──────────┤   (only /api/* — never the upstreams)  │
│                    │                                         │
└────────────────────┼─────────────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────────┐
│ Console — Next.js 15 app on :3001                            │
│                                                              │
│   src/app/api/playground/**   src/app/api/cp/**              │
│            │                              │                  │
│            ▼                              ▼                  │
│   proxyGet/Post/Sse(...)        proxyGet/Post/Sse(...)       │
│     adds Auth header              adds Auth header           │
│     forwards body                 forwards body              │
│     streams SSE                   streams SSE                │
└────────┬────────────────────────────────┬───────────────────┘
         │                                │
         ▼                                ▼
┌─────────────────────┐         ┌──────────────────────────┐
│ aitp-playground     │         │ aitp-cp                  │
│ FastAPI on :8000    │         │ Next.js on :4000         │
│ Scenarios, runs,    │         │ Registry, sessions,      │
│ live SSE timeline   │         │ audit, dashboard,        │
│                     │         │ trust, webhooks          │
└─────────────────────┘         └──────────────────────────┘
```

## Why a BFF proxy

Two reasons:

1. **Credentials never reach the browser.** `PLAYGROUND_API_KEY` and
   `CP_API_KEY` (if set) are read inside the route handlers under
   `src/app/api/{playground,cp}/**` — both runtime values stay on the
   server, only the request payload crosses to the browser.

2. **The browser only sees one origin.** No CORS dance, no preflight
   storms. Everything is same-origin `fetch('/api/...')` and the proxy
   re-issues the request to the appropriate upstream.

The cost is one extra hop and a `text → string → Response` re-pack on
every request. That tradeoff is documented in `src/lib/api/proxy.ts`.
Every console route's upstream mapping lives in [PROXIES.md](https://agentidentitytrustprotocol.io/console/proxies).

### CSRF guard

`src/middleware.ts` runs on every `/api/**` mutation (POST/PUT/PATCH/
DELETE) and rejects requests whose `Origin` doesn't match the request
`Host` (or an entry in `TRUSTED_ORIGINS`). GETs and SSE are unguarded —
they're not state-changing and `EventSource` can't attach headers. Absent
`Origin` (curl, server-to-server, integration tests) is allowed because
CSRF requires a victim's *browser*.

## Layering

```
src/
├── app/
│   ├── api/**                ← Edge of the system (BFF proxies)
│   ├── <section>/page.tsx    ← Pages: thin compositions of components
│   └── layout.tsx, providers.tsx
│
├── components/
│   ├── layout/               ← Sidebar, topbar, connection-status
│   ├── shared/               ← Cross-cutting primitives (badges, cards…)
│   └── <section>/            ← Section-specific (dashboard/, runs/, …)
│
├── hooks/
│   ├── use-sse.ts            ← Single source of SSE behavior
│   ├── use-<sse-stream>.ts   ← Domain-specific wrappers
│   └── use-<resource>.ts     ← TanStack Query wrappers
│
├── lib/
│   ├── api/
│   │   ├── proxy.ts          ← Generic proxy helpers (Get/Post/Put/Delete/Sse)
│   │   └── client.ts         ← Typed fetch wrappers used by hooks
│   ├── types/
│   │   ├── playground.ts     ← Playground response types
│   │   └── cp.ts             ← Control plane response types
│   ├── colors.ts             ← Design tokens (mirrors tailwind.config.ts)
│   ├── config.ts             ← serverConfig (env), clientConfig
│   ├── query-options.ts      ← Named refetch cadences (REFETCH.*)
│   ├── export.ts             ← CSV / NDJSON download helpers
│   └── utils.ts              ← cn(), formatAid(), timeAgo(), shortId()
│
└── test/                     ← Shared test utilities, polyfills, stubs
```

Each layer depends only on the layers below it. `lib/` knows nothing
about React. `hooks/` depends on `lib/` and React. `components/` depends
on hooks + lib. `app/` composes everything.

## SSE: why native EventSource

Two streams matter:

- **`/api/playground/runs/[id]/events`** — per-run event timeline,
  emitted by the playground as the scenario executes.
- **`/api/cp/events/stream`** — global event stream, emitted by the
  control plane for every registry/handshake/audit event.

Both are read in the browser via `useSse` (`src/hooks/use-sse.ts`), which
wraps the native `EventSource`. We deliberately do *not* pull in a
WebSocket library:

- Re-connection with exponential backoff is ~20 lines (already done).
- Page-visibility pausing — when the tab is hidden we close the
  connection and reopen it on focus — keeps idle-tab cost at zero.
- SSE is HTTP, so the same BFF proxy approach works (`proxySse` simply
  forwards `Response.body` with `Content-Type: text/event-stream`).

The control plane caps concurrent SSE listeners and returns a 503 at the
limit. Because browsers don't expose the EventSource handshake status,
`useSse` takes an optional `capacityProbePath` that does a one-shot
`fetch()` first; a 503 surfaces as a distinct `at-capacity` state with a
longer backoff. The CP ticker opts into this; the per-run playground
stream does not need it. The probe contract and the CP-side cap are
covered in [PROXIES.md](https://agentidentitytrustprotocol.io/console/proxies#cp-sse-capacity-handling).

## Data fetching

Every read goes through TanStack Query (`@tanstack/react-query`). Each
resource has a small hook in `src/hooks/use-<resource>.ts` that returns
the upstream type directly — there is no mapping layer between fetched
data and rendered components.

Refetch cadences are **not** per-hook millisecond literals; hooks
reference named buckets in `src/lib/query-options.ts`
(`REFETCH.health / slow / list / realtime / runActive / veryslow`). One
file controls how aggressively the console hits each upstream. The runs
list, for example, uses `runActive` while a run is in flight and `list`
otherwise.

Writes use `useMutation` and invalidate the relevant query key on success.
Mutations exist for: triggering and cancelling runs; enrollment-token
minting; trust-anchor / pinned-key / revocation edits; and webhook CRUD
(including circuit-breaker reset).

## Type flow

Backend response types live in `src/lib/types/playground.ts` and
`src/lib/types/cp.ts`. They mirror the JSON shapes the upstream services
serialize — the source of truth for those shapes is the
[playground](https://agentidentitytrustprotocol.io/playground) and [CP API](https://agentidentitytrustprotocol.io/control-plane/api) docs. Hooks
return these types directly. If an upstream changes shape, fix the type
file and the compiler walks every consumer.

## State that lives in the console

Almost none. Some local component state (selected event, timeline
scroll-lock) but no global store. Operator-visible filter / tab state on
`/dashboard`, `/audit`, `/registry`, `/monitor`, and the run-detail tabs
is synced to the URL with `useUrlState` (`src/hooks/use-url-state.ts`) so
views are shareable and survive reload. No `zustand` — if cross-route
state ever needs persistence we'll add it back deliberately for the
specific feature that needs it.

## Things that intentionally aren't here

- **shadcn/ui** — the mock used pure inline styles for tight visual
  control. To preserve that fidelity we built our own primitives in
  `src/components/shared/`. If we later need a full component library,
  it's an opt-in install.
- **A WebSocket lib** — `EventSource` handles everything we need.
- **Server components / Server actions** — every page is client-side
  because they all subscribe to live data. The only server-side code is
  the BFF route handlers and the middleware.
- **A monorepo build tool** — the console builds independently. The
  sibling services have their own build pipelines.
