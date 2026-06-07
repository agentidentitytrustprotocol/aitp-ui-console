# Conventions

How code is laid out and why. Read this before adding a new page,
hook, or backend call.

## Layering

```
src/lib/   — pure TS, no React. Types, fetch wrappers, utils, config.
src/hooks/ — React hooks. Depend on lib + React.
src/components/ — UI. Depend on hooks + lib.
src/app/   — Pages. Compose components.
src/app/api/ — BFF route handlers. Only server-side code.
```

Each layer depends only on layers below it. A `lib/` module that
imports from `hooks/` is wrong.

## Hooks

- One file per resource: `src/hooks/use-<resource>.ts`.
- REST: `useQuery` / `useMutation` wrapping the typed helpers in
  `src/lib/api/client.ts`.
- SSE: build on `useSse` (`src/hooks/use-sse.ts`). Don't construct
  `EventSource` directly — `useSse` handles reconnect, visibility,
  and CP backpressure.
- Refetch cadence comes from `REFETCH` in
  `src/lib/query-options.ts`. Don't write raw millisecond literals.
  Extend `REFETCH` if no bucket fits.
- Mutations invalidate every query key they affect on success.

## Components

- Everything is `'use client'` except the thin page wrappers that
  destructure `params`. We render live data; server components would
  just hand off to client components anyway.
- Render explicit **empty**, **error**, and **loading** states for
  every backend-dependent view. Use `EmptyState` and `LoadingSkeleton`
  from `src/components/shared/`.
- Show AIDs through `AidCell` — never raw. It truncates intelligently
  and copies the full value on click.
- Show relative times through `TimeAgo`. It re-renders once a second.
- Don't hard-code colors. Source them from `src/lib/colors.ts` (which
  mirrors `tailwind.config.ts`).

## BFF proxies

- Every browser fetch goes through `/api/playground/**` or `/api/cp/**`.
  Never call sibling services directly.
- Route handlers are 4-line delegations to `proxyGet/Post/Put/Patch/
  Delete/Sse` in `src/lib/api/proxy.ts`. No business logic in the
  route file.
- `URLSearchParams` and path segments under user control must be
  `encodeURIComponent`-ed. The proxy helpers don't double-encode.
- Status codes and bodies pass through unchanged. Connection failures
  synthesize a sanitized `{ error: 'Upstream unreachable', target,
  upstream_status: 502 }`; raw error detail is logged server-side
  via `console.error`, never sent to the browser.

## Filter / tab state

If it's operator-visible — search inputs, status pickers, active tab —
sync it to the URL with `useUrlState` / `useUrlEnum` / `useUrlInt` from
`src/hooks/use-url-state.ts`. Local `useState` for filters is for
ephemeral UI state only (e.g. an inline confirm dialog).

## Accessibility

- Every icon-only `<button>` needs an `aria-label`.
- Tables: `<th scope="col">` on every header cell.
- Form inputs: associate the label by wrapping the control or by
  `htmlFor` + matching `id`. The `Field` helpers in trust-anchors,
  pinned-keys, revocation, and audit are all wrapper-style.
- `:focus-visible` styles live in `src/app/globals.css`. Don't
  re-style focus inline.

## Tests

- Unit + component tests live next to the source: `<name>.test.ts(x)`.
- Hook tests mock `@/lib/api/client` directly instead of stubbing the
  global `fetch` — keeps the test independent of jsdom's missing
  `Response` constructor and focused on hook behaviour.
- SSE tests drive the polyfilled `EventSource` from
  `src/test/polyfills.ts`. See `src/hooks/use-sse.test.tsx` for the
  pattern.
- Integration tests live in `src/test/*.integration.test.ts` and are
  gated by `RUN_INTEGRATION=1`. They hit a real running console + CP +
  playground.

## Things we don't do

- **shadcn/ui** — we hand-rolled `src/components/shared/` so the
  mock's visual fidelity stayed intact. Opt in later if we ever need
  a full library.
- **Global state stores** — no zustand, no Redux. URL state and
  TanStack Query cover what we need today.
- **Server actions** — every page is client-side because it streams
  or polls; server actions add no value.
- **Inline color hex literals** — go through `C` from `src/lib/colors.ts`.

When in doubt, grep for an existing example and follow that pattern.
