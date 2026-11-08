# Deployment

> **Contributor doc — repo only.** Files in `internal_docs/` are **not**
> published to the docs site (the website syncs `docs/` only). For the
> user-facing docs see [`docs/`](../docs) or
> <https://agentidentitytrustprotocol.io/console>.

This console is a stock Next.js 16 app and deploys cleanly to Vercel.
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

### CI cost

Measured 2026-11-07 over the previous 30 days (`gh api …/actions/runs`):
about 155 runner-minutes in all, every one on `ubuntu-latest`, and no re-run
attempts.

| Workflow / event | Runs | Minutes |
| --- | ---: | ---: |
| CI / pull_request | 50 | 69 |
| CI / push to `main` | 22 | 34 |
| Dependabot updates | 19 | 30 |
| bump aitp | 11 | 15 |
| auto-merge, notify-website | 58 | 7 |

The repo is public, so these minutes are free: the org's billing usage shows
the whole gross amount discounted, for a net cost of $0. Nothing was changed.
The workflow is already cheap:

- There is no merge queue, so a `merge_group` path filter has nothing to filter.
- The single job already runs on the smallest standard runner.
- PR runs already cancel in progress on a new push.
- Only 1 of 26 merged PRs was docs-only, so a docs path filter would save
  almost nothing. It would also need a fail-closed stub for the required
  check.
- The push run on `main` repeats the PR run's tree, because branch protection
  is strict. It is kept anyway: it saves the npm and `.next` caches at the
  `main` scope, the only scope every PR can restore from. Dropping it would
  trade about 34 minutes for a cold cache on every PR.

The **live-service** integration suites are not part of CI — they need
the sibling playground + control plane running (and LLM credentials for
the scenario run). Run them locally before merging changes to the proxy
layer or the SSE hook. See [`TESTING.md`](./TESTING.md).

## Vercel

### One-time setup

1. **Import the repo** in the Vercel dashboard. Framework auto-detects
   as Next.js; the build/install commands in `vercel.json` are already
   correct.
2. **Set environment variables.** For this deployment, they come from Doppler
   (see [Configuration lives in Doppler](#configuration-lives-in-doppler)).
   On a fresh Vercel project, set them on Production:

   | Variable | Required | Notes |
   | --- | --- | --- |
   | `CONSOLE_PASSWORD` | yes | Operator password (24+ random chars). Unset → 503 on every route. |
   | `CONSOLE_SESSION_SECRET` | yes | HMAC key for the session cookie (`openssl rand -hex 32`). Unset → 503 on every route. Rotating it signs everyone out. |
   | `PLAYGROUND_URL` | yes | Public HTTPS URL of the playground (no trailing slash). |
   | `PLAYGROUND_API_KEY` | if upstream enforces | Bearer token forwarded to the playground. |
   | `CP_URL` | yes | Public HTTPS URL of the control plane. |
   | `AITP_INSECURE_LOCALHOST_DANGEROUS` | no | Never set this on a deployed environment. It is for a local stack only, and a production build ignores it. |
   | `CP_API_KEY` | if upstream enforces | Bearer token forwarded to the CP. |
   | `TRUSTED_ORIGINS` | optional | Comma-separated extra `Origin`s the mutation Origin check should allow. Only needed if the console is reachable on multiple hostnames (e.g. behind a CDN with a custom domain that differs from the Vercel one). |

   None of these are referenced at build time. Without the two
   `CONSOLE_*` variables a deployment serves 503 on every route. That is
   the intended state for Preview: see
   [Preview has its own, smaller set](#preview-has-its-own-smaller-set).

### Configuration lives in Doppler

Doppler project **`aitp-ui-console`** is the source of truth for the
console's configuration and secrets:

| Config | Holds |
| --- | --- |
| `prd` | Production: the six keys in [`deploy/doppler-keys.txt`](../deploy/doppler-keys.txt) |
| `stg` | `prd`'s non-secret config only (`CP_URL`, `PLAYGROUND_URL`). There is no staging deployment. |
| `dev` | The local `.env`'s console keys (`CP_URL`, `PLAYGROUND_URL`, both localhost) |
| `dev_personal` | A branch of `dev`, no overrides |

Two `prd` values are copies of keys another service owns. Both were piped
from that service, never typed in:

- `CP_API_KEY` is the control plane's `console-…` `API_KEYS` entry, and is equal
  to `aitp-control-plane/prd CP_API_KEY_CONSOLE`.
- `PLAYGROUND_API_KEY` is equal to `aitp-playground/prd PLAYGROUND_API_KEY`.

When either one rotates, update the owning project first, then this one.

`deploy/doppler-sync.sh` pushes `prd` into Vercel **Production**:

```bash
deploy/doppler-sync.sh                       # dry run: key names and states only
deploy/doppler-sync.sh --apply               # write new or changed readable keys, then redeploy
deploy/doppler-sync.sh --apply --push KEY    # also overwrite a sensitive (write-only) KEY
deploy/doppler-sync.sh --apply --no-redeploy # leave the rebuild to the next merge
```

- It manages only the keys in `deploy/doppler-keys.txt`. It never removes a
  Vercel variable and never touches Preview or Development.
- Values are piped from Doppler into the Vercel REST API on curl's stdin and are never printed or
  written to disk. Vercel holds no Doppler token.
- Vercel never returns the value of a **sensitive** variable, so the script
  can't compare one. It reports the key as `sensitive-unverifiable` and leaves
  it alone unless you name it with `--push`. A key marked `sensitive` in the
  list is created as a sensitive variable. To check a sensitive value, test
  behaviour, not bytes: a sign-in with the Doppler password returns 200, the
  session cookie verifies with the Doppler `CONSOLE_SESSION_SECRET`, the
  `/api/cp/health` and `/api/playground/health` responses through the console
  match direct calls, and `/api/cp/audit` through the console returns 200 while
  a keyless direct call returns 401.
- It prints a hash of the Production entries' metadata (ids, keys, types,
  targets, `updatedAt`; never values) at the start and at the end. Equal
  hashes mean nothing changed.
- It needs `git`, `jq`, `curl`, `shasum` and the `doppler` and `vercel` CLIs,
  logged in, and it refuses a dirty working tree. No `vercel link` is needed:
  the script pins the CLI to the project by id.

#### Preview has its own, smaller set

Doppler owns Production. Preview deployments get only what a preview needs.
They never get the control-plane key, the password or the session secret:

| Preview variable | Value |
| --- | --- |
| `CP_URL`, `PLAYGROUND_URL` | Production's URLs (readable entries) |
| `PLAYGROUND_API_KEY` | The playground key, so previews keep working once the playground enforces it |

These are separate Preview-only entries, set by hand with the Vercel API or
`vercel env add … preview`. The sync never touches them. Without
`CONSOLE_PASSWORD` and `CONSOLE_SESSION_SECRET`, a preview serves 503 on every
route (fail closed), which is the intended state. Until 2026-11-07, Preview held
copies of the production password, session secret and control-plane key, and
shared the two URL entries with Production. The URL entries were split per
environment, and the three secrets were removed from Preview. Don't re-add them.

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
- The proxy in `src/proxy.ts` (renamed from `middleware.ts` in Next 16)
  runs on the Node.js runtime — Next 16's `proxy.ts` convention doesn't
  support an edge runtime option, unlike the old `middleware.ts`.

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
