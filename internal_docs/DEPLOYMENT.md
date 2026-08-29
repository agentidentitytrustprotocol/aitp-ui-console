# Deployment

> **Contributor doc — repo only.** Files in `internal_docs/` are **not**
> published to the docs site (the website syncs `docs/` only). For the
> user-facing docs see [`docs/`](../docs) or
> <https://agentidentitytrustprotocol.io/console>.

This console is a stock Next.js 15 app and deploys cleanly to Vercel.
The only deploy-time decisions are environment variables and which
Vercel plan to pick (because of SSE).

The two upstreams deploy on their own — this doc only covers the console.
For their hosting see the [control plane deploy](https://agentidentitytrustprotocol.io/control-plane/deploy)
and [playground docker](https://agentidentitytrustprotocol.io/playground/docker) docs. The console just needs
their public URLs.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every PR:

| Step | Command / action |
| --- | --- |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit tests + coverage | `npm test -- --ci --coverage` (summary in the job summary; `lcov.info` uploaded as an artifact) |
| Integration tests | `npm run test:integration -- --ci` — the self-contained route-handler suite; live-service suites skip without `RUN_INTEGRATION` |
| Build | `npm run build` (with a cached `.next/cache`) |

The workflow runs with `permissions: contents: read`, and
`.github/dependabot.yml` keeps npm packages and GitHub Actions bumped
weekly (minor/patch npm bumps are grouped; `next`/`react` majors stay
individual).

The **live-service** integration suites are not part of CI — they need
the sibling playground + control plane running (and LLM credentials for
the scenario run). Run them locally before merging changes to the proxy
layer or the SSE hook. See [`TESTING.md`](./TESTING.md).

## Vercel

### One-time setup

1. **Import the repo** in the Vercel dashboard. Framework auto-detects
   as Next.js; the build/install commands in `vercel.json` are already
   correct.
2. **Set environment variables** (Production + Preview, optionally
   Development):

   | Variable | Required | Notes |
   | --- | --- | --- |
   | `PLAYGROUND_URL` | yes | Public HTTPS URL of the playground (no trailing slash). |
   | `PLAYGROUND_API_KEY` | if upstream enforces | Bearer token forwarded to the playground. |
   | `CP_URL` | yes | Public HTTPS URL of the control plane. |
   | `CP_API_KEY` | if upstream enforces | Bearer token forwarded to the CP. |
   | `TRUSTED_ORIGINS` | optional | Comma-separated extra `Origin`s the CSRF guard should allow. Only needed if the console is reachable on multiple hostnames (e.g. behind a CDN with a custom domain that differs from the Vercel one). |

   None of these are referenced at build time, so previews can deploy
   without any of them set — the BFF will return 502 on every request,
   but the static shell still loads.

3. **Pick a plan that supports the SSE function duration you need.**
   Vercel kills serverless functions at the plan timeout:
   - Hobby: 10s. SSE will reconnect every ~10s. Functional but noisy.
   - Pro: 300s with the `maxDuration = 300` already configured on
     `/api/playground/runs/[id]/events` and `/api/cp/events/stream`.
   - Enterprise: up to 900s if needed.

   The `useSse` hook auto-reconnects, so a shorter timeout degrades the
   live-feel of the monitor + run timeline but does not break correctness.

### Routing & runtime

- All API routes declare `runtime = 'nodejs'` because the BFF proxy uses
  `Request#signal` merging via `AbortSignal.any` (edge runtime
  compatibility varies). Don't switch them to edge without re-testing
  the timeout + abort behaviour.
- All pages that consume `useSearchParams` (via `useUrlState`) declare
  `dynamic = 'force-dynamic'`, and the layout wraps `{children}` in a
  `<Suspense>` so static generation succeeds without bailing.
- The middleware in `src/middleware.ts` runs on Vercel's edge runtime
  automatically.

### Native dependencies

`aitp` (`@agentidentitytrustprotocol/aitp`, aliased) is a native NAPI
addon — the console's only one. Two things make it deployable here, both
already applied in `next.config.ts` and confirmed live before this
dependency was added for real (a throwaway branch proved the addon loads
and runs inside an actual Vercel serverless function, `nodejs24.x`,
`iad1` — see the (local, gitignored) `plans/cp-signed-artifact-verification.md`,
Phase 2, for the full record):

- `serverExternalPackages: ['aitp']` — required unconditionally, or
  webpack tries to bundle the `.node` binary and fails the build.
- `outputFileTracingIncludes` for the two Linux prebuild packages —
  `@vercel/nft` only resolves the *build host's* platform, so without this
  a Vercel deploy would ship only the darwin binary the build ran with
  locally, absent on the deployed function's actual OS. **Unconditional**
  here — unlike `aitp-control-plane`'s equivalent config, there is no
  `output: 'standalone'` build in this repo to gate it behind.

If `aitp` starts throwing `Failed to load native binding` in production:
confirm both settings are still present and unconditional, and check
whether `@vercel/nft` is tracing the addon to a hashed path
(`vercel/next.js#88844`) instead of the expected unhashed
`node_modules/aitp/...`.

### Networking

The console makes server-to-server fetches to `PLAYGROUND_URL` and
`CP_URL` from every region the function lands in. If those services are
on a private VPC, deploy them behind a public ingress, use Vercel's
[Private Connect](https://vercel.com/docs/security/private-connect)
on an Enterprise plan, or front them with Cloudflare Access /
Tailscale Funnel.

### Health check

After deploy, the easiest smoke test is the topbar — it shows red dots
when either upstream is unreachable, and the relevant section falls
back to an empty state. Or hit `/api/cp/health` and `/api/playground/health`
directly.

## Manual deploy

If you ever need to deploy outside Vercel:

```bash
npm ci
npm run build
PLAYGROUND_URL=… CP_URL=… npm start   # default port 3001
```

`npm start` runs `next start`, which serves the production build from
`.next/`. Put it behind a reverse proxy that terminates TLS.
