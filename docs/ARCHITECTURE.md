# Architecture

The console is a thin client on top of two backend services. It owns no
state of its own — the playground holds scenario definitions and run
history, the control plane holds the agent registry, sessions, audit log,
and webhook subscriptions. The console's job is to render that state and
let humans drive workflows against it.

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
│                     │         │ webhooks                 │
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
- **`/api/cp/events/stream`** — global audit event stream, emitted by
  the control plane for every registry/handshake/audit event.

Both are read in the browser via `useSse` (`src/hooks/use-sse.ts`), which
wraps the native `EventSource`. We deliberately do *not* pull in a
WebSocket library:

- Re-connection with exponential backoff is ~20 lines (already done).
- Page-visibility pausing — when the tab is hidden we close the
  connection and reopen it on focus — keeps idle-tab cost at zero.
- SSE is HTTP, so the same BFF proxy approach works (`proxySse` simply
  forwards `Response.body` with `Content-Type: text/event-stream`).

## Data fetching

Every read goes through TanStack Query (`@tanstack/react-query`). Each
resource has a small hook in `src/hooks/use-<resource>.ts`:

- `useDashboard(range)` — 30s refetch
- `useRegistry()` — 30s refetch + refetch on window focus
- `useSessions({ status, aid, limit })` — 5s refetch
- `useScenarios()`, `useScenario(ref)` — default cache
- `useRuns()` — adaptive: 3s when any run is `pending`/`running`,
  otherwise 15s
- `useRun(id)`, `useWebhooks()`, `useAgentMetrics()`, etc.

Writes use `useMutation` and invalidate the relevant query key on
success. Mutations currently exist for: creating a run, cancelling a
run, creating/updating/deleting webhooks.

## Type flow

Backend response types live in `src/lib/types/playground.ts` and
`src/lib/types/cp.ts`. They mirror the JSON shapes that the upstream
services serialize. Hooks return these types directly — there is no
mapping layer between fetched data and rendered components.

If an upstream changes shape, fix the type file and the compiler will
walk every consumer.

## State that lives in the console

Almost none. Some local component state (selected event in the monitor
drawer, search filters in the registry, scroll-lock in the run timeline)
but no global store. `zustand` is in `package.json` because the original
plan called for it; it's currently unused. We can either delete it or
let it ride for the first feature that needs cross-route state.

## Things that intentionally aren't here

- **shadcn/ui** — the mock used pure inline styles for tight visual
  control. To preserve that fidelity we built our own primitives in
  `src/components/shared/`. If we later need a full component library,
  it's an opt-in install.
- **A WebSocket lib** — `EventSource` handles everything we need.
- **Server components / Server actions** — every page is client-side
  because they all subscribe to live data. The only server-side code is
  the BFF route handlers.
- **A monorepo build tool** — the console builds independently. The
  sibling services have their own build pipelines.
