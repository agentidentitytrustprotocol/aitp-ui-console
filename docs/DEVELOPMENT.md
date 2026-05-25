# Development

## Prerequisites

- Node 20+ (Node 24 known-working)
- Docker (for the CP's Postgres)
- `uv` (for the playground's Python deps): https://github.com/astral-sh/uv

## First-time setup

```bash
# Console
cd aitp-ui-console
npm install
cp .env.example .env.local       # both API keys can stay blank for local

# Control plane (sibling)
cd ../aitp-cp
docker compose up -d postgres    # starts on :5432
npm install
npm run db:migrate
# Generate an enrollment secret once and put it in your env file
node -e "console.log('ENROLLMENT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .env.local

# Playground (sibling)
cd ../aitp-playground
cp .env.example .env             # fill in OPENAI_API_KEY or ANTHROPIC_API_KEY
uv sync
```

## Day-to-day

You'll typically want three terminals:

```bash
# T1 — CP
cd aitp-cp && npm run dev          # → :4000

# T2 — Playground
cd aitp-playground && uv run uvicorn aitp_playground.main:app --reload --port 8000

# T3 — Console
cd aitp-ui-console && npm run dev  # → :3001
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
| Touching the proxy contract | `src/lib/api/proxy.ts` + `src/lib/api/proxy.test.ts` + `docs/PROXIES.md` |

## Quality gates

```bash
npm run typecheck        # strict tsc --noEmit
npm run lint             # next lint
npm test                 # unit + component tests (~1s)
npm run build            # production build (~30s)
```

For integration / LLM tests, see [`TESTING.md`](./TESTING.md).

## Conventions

- **Client components.** Every page renders live data, so almost every
  component is `'use client'`. Server components are limited to root
  page wrappers that read params.
- **Empty states everywhere.** Any view that depends on a backend fetch
  must render a friendly empty state when the backend is unreachable or
  returns no rows. Use `EmptyState` from `src/components/shared/`.
- **One color source.** Colors come from `src/lib/colors.ts` (mirrored
  in `tailwind.config.ts`). Don't hard-code hex elsewhere.
- **AIDs always copy-able.** When you display an AID, use `AidCell`
  from `src/components/shared/`. It truncates intelligently and
  copies the full value on click.
- **Times always live.** When you show a relative timestamp, use
  `TimeAgo` from `src/components/shared/`. It refreshes once per second.
- **No comments on the obvious.** Reserve comments for non-obvious
  invariants, references to spec rules, or pointer to why something is
  done a certain way.
