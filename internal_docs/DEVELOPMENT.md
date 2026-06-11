# Development

> **Contributor doc — repo only.** Files in `internal_docs/` are **not**
> published to the docs site (the website syncs `docs/` only). For the
> user-facing docs see [`docs/`](../docs) or
> <https://agentidentitytrustprotocol.io/console>.

First-time setup and the day-to-day loop for working on the **console**.
The console is useful on its own (it degrades gracefully when a backend is
down), but most flows need the two sibling services running. Their setup is
their own — this doc links out rather than duplicating it.

## Prerequisites

- Node 20+ (Node 24 known-working)
- For the sibling services: Docker (CP's Postgres) and `uv` (playground's
  Python deps). See their getting-started docs:
  [control plane](https://agentidentitytrustprotocol.io/control-plane) · [playground](https://agentidentitytrustprotocol.io/playground/getting-started).

## First-time setup (console)

```bash
cd aitp-ui-console
npm install
cp .env.example .env.local       # both API keys can stay blank for local
```

The console reads `PLAYGROUND_URL`, `CP_URL`, optional `*_API_KEY`s, and
`TRUSTED_ORIGINS` from the environment — all documented in `.env.example`.
For local development the defaults (`localhost:8000` / `localhost:4000`)
and blank keys are correct.

To exercise live data, bring up the siblings per their own docs:
[control plane setup](https://agentidentitytrustprotocol.io/control-plane) and
[playground getting-started](https://agentidentitytrustprotocol.io/playground/getting-started).

## Day-to-day

You'll typically want three terminals — the console plus the two
upstreams:

```bash
# T1 — Control plane (see /control-plane for full setup)
cd ../aitp-cp && npm run dev          # → :4000

# T2 — Playground (see /playground/getting-started)
cd ../aitp-playground && uv run uvicorn aitp_playground.main:app --reload --port 8000

# T3 — Console (this repo)
cd aitp-ui-console && npm run dev      # → :3001
```

Open http://localhost:3001 — the topbar dots should both be green.

If a service is down the topbar shows a red dot, the affected sections
fall back to empty states (no crashes), and `npm test` keeps working
because it doesn't touch the network.

## Hot paths during development

| Doing... | Look at |
| --- | --- |
| Adding a new page | `src/app/<section>/page.tsx` + a sibling component |
| Adding a new component | `src/components/<section>/<name>.tsx` + colocated `.test.tsx` |
| Adding a new backend call | a new hook in `src/hooks/use-<resource>.ts` + a proxy route under `src/app/api/...` |
| Changing the palette | `tailwind.config.ts` AND `src/lib/colors.ts` — keep them in sync |
| Touching the SSE behavior | `src/hooks/use-sse.ts` + `src/hooks/use-sse.test.tsx` |
| Touching the proxy contract | `src/lib/api/proxy.ts` + `src/lib/api/proxy.test.ts` + [PROXIES.md](../docs/PROXIES.md) |

## Quality gates

```bash
npm run typecheck        # strict tsc --noEmit
npm run lint             # next lint (next/core-web-vitals ruleset)
npm test                 # unit + component tests (~1s)
npm run build            # production build (~30s)
npm run analyze          # ANALYZE=true next build — opens bundle report
npm run format           # prettier --write
npm run format:check     # prettier --check (CI-friendly)
```

`typecheck`, `lint`, `test`, and `build` are exactly what CI runs on every
push and PR — see [DEPLOYMENT.md](./DEPLOYMENT.md#ci). For
integration / LLM tests, see [TESTING.md](./TESTING.md).

## Adding a new top-level route

Walk through `/scenarios` if you want to read a worked example. The
minimum recipe is six steps:

1. **Backend proxy.** Drop a 4-line route handler under
   `src/app/api/<service>/<path>/route.ts`. It just delegates to one of
   the helpers in `src/lib/api/proxy.ts`. Add a row to
   [PROXIES.md](../docs/PROXIES.md) at the same time.
2. **Types.** If the upstream returns a new shape, model it in
   `src/lib/types/{playground,cp}.ts`. Hooks return those types
   directly — no mapping layer.
3. **Hook.** Create `src/hooks/use-<resource>.ts`. Use TanStack Query
   for REST, `useSse` for SSE. Pick a refetch cadence from
   `REFETCH` in `src/lib/query-options.ts` (do not introduce a raw
   millisecond literal — extend `REFETCH` if no existing bucket fits).
4. **Component.** Compose with the shared primitives in
   `src/components/shared/` (`Card`, `EmptyState`, `LoadingSkeleton`,
   `AidCell`, `TimeAgo`, badges). Render explicit empty / error /
   loading states.
5. **Page.** Thin wrapper in `src/app/<section>/page.tsx` that imports
   the component. If filters or selection are operator-visible, sync
   them to the URL with `useUrlState` / `useUrlEnum` from
   `src/hooks/use-url-state.ts`.
6. **Tests + nav + docs.** Colocate `<name>.test.tsx`. Add the route to
   `src/components/layout/sidebar.tsx` if it's a top-level nav target.
   Hit it from `src/test/proxies.integration.test.ts` so the contract
   is exercised end-to-end. Update [PROXIES.md](../docs/PROXIES.md), and the
   Sections table in [`../README.md`](../README.md) and
   [FEATURES.md](../docs/FEATURES.md) if the route is user-facing.

## Conventions

Code layout, hook/component/proxy patterns, accessibility, and the
"things we don't do" list all live in one place:
**[CONVENTIONS.md](../docs/CONVENTIONS.md)**. Read it before adding a page, hook,
or backend call.
