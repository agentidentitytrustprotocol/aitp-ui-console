# BFF Proxy Routes

Every browser request goes through one of these routes. Each is a 4-line
delegation to `proxyGet` / `proxyPost` / `proxyPut` / `proxyPatch` /
`proxyDelete` / `proxySse` from `src/lib/api/proxy.ts`. No business logic
lives here — the proxy exists only to keep credentials off the browser and
collapse two upstreams to one origin (see
[ARCHITECTURE.md](https://agentidentitytrustprotocol.io/console/architecture#why-a-bff-proxy)).

This table is the console's **routing contract**: console route → upstream
path. The *meaning* of each upstream endpoint is owned by its service —
follow the links to the [playground](https://agentidentitytrustprotocol.io/playground) and
[CP API](https://agentidentitytrustprotocol.io/control-plane/api) docs for request/response semantics.

Status codes and bodies pass through unchanged. On connection failure the
proxy synthesizes a 502 with shape `{ error, target, upstream_status: 502 }`;
raw error detail is logged server-side, never sent to the browser.

## Playground (`PLAYGROUND_URL`, default `http://localhost:8000`)

| Method | Console route | Upstream |
| --- | --- | --- |
| GET | `/api/playground/health` | `/healthz` |
| GET | `/api/playground/capabilities` | `/capabilities` |
| GET | `/api/playground/agents` | `/agents` |
| GET | `/api/playground/metrics` | `/metrics` |
| GET | `/api/playground/packs` | `/packs` |
| GET | `/api/playground/scenarios` | `/scenarios` |
| GET | `/api/playground/scenarios/[...ref]` | `/scenarios/<pack>/<scenario>@<version>` |
| GET | `/api/playground/scenario-templates?ref=…` | `/scenarios/<pack>/<scenario>@<version>/templates` |
| GET | `/api/playground/runs` | `/runs` |
| POST | `/api/playground/runs` | `/runs` (accepts `template`, `variant`, `fault_injection`) |
| GET | `/api/playground/runs/[id]` | `/runs/:id` |
| GET | `/api/playground/runs/[id]/status` | `/runs/:id/status` |
| POST | `/api/playground/runs/[id]/cancel` | `/runs/:id/cancel` |
| GET | `/api/playground/runs/[id]/narrate` | `/runs/:id/narrate` |
| GET | `/api/playground/runs/[id]/cp-audit` | `/runs/:id/cp-audit` |
| GET | `/api/playground/runs/[id]/cp-sessions` | `/runs/:id/cp-sessions` |
| GET | `/api/playground/runs/[id]/deliveries` | `/runs/:id/cp-deliveries` |
| **SSE** | `/api/playground/runs/[id]/events` | `/runs/:id/events` |

> **Why `scenario-templates` is a query-param route, not a child of
> `/scenarios/[...ref]`:** Next.js does not allow child segments under a
> catch-all route. The console keeps a flat
> `/api/playground/scenario-templates?ref=<pack>/<scenario>@<version>`
> route and forwards it to the nested upstream `/templates` path.

## Control Plane (`CP_URL`, default `http://localhost:4000`)

| Method | Console route | Upstream |
| --- | --- | --- |
| GET | `/api/cp/health` | `/api/health` |
| GET | `/api/cp/readyz` | `/api/readyz` |
| GET | `/api/cp/dashboard` | `/api/dashboard/overview` |
| GET | `/api/cp/dashboard/agents` | `/api/dashboard/agents` |
| GET | `/api/cp/registry/agents` | `/api/registry/agents` |
| POST | `/api/cp/registry/enroll` | `/api/registry/enroll` |
| GET | `/api/cp/registry/agents/[aid]` | `/api/registry/agents/:aid` |
| DELETE | `/api/cp/registry/agents/[aid]` | `/api/registry/agents/:aid` |
| GET | `/api/cp/registry/agents/[aid]/manifest` | `/api/registry/agents/:aid/manifest` |
| **SSE** | `/api/cp/events/stream` | `/api/events/stream` (cap-aware) |
| GET | `/api/cp/events/history` | `/api/events/history` |
| GET | `/api/cp/sessions` | `/api/sessions` |
| GET | `/api/cp/sessions/[sessionId]` | `/api/sessions/:sessionId` |
| GET | `/api/cp/sessions/[sessionId]/replay` | `/api/sessions/:sessionId/replay` |
| GET | `/api/cp/sessions/[sessionId]/export` | `/api/sessions/:sessionId/export` |
| GET | `/api/cp/audit` | `/api/audit` |
| GET | `/api/cp/metrics` | `/api/metrics` |
| GET | `/api/cp/tcts` | `/api/tcts` |
| GET | `/api/cp/delegations` | `/api/delegations` |
| POST | `/api/cp/revocation/entries` | `/api/revocation/entries` (POST-only — list comes from `.well-known/aitp-revocation-list`) |
| GET, POST | `/api/cp/trust-anchors` | `/api/trust-anchors` |
| GET, PATCH, DELETE | `/api/cp/trust-anchors/[id]` | `/api/trust-anchors/:id` |
| GET, POST, DELETE | `/api/cp/pinned-keys` | `/api/pinned-keys` (DELETE takes `?namespace=&aid=`) |
| GET, POST | `/api/cp/webhooks` | `/api/webhooks` |
| PUT, DELETE | `/api/cp/webhooks/[id]` | `/api/webhooks/:id` |
| GET, POST | `/api/cp/webhooks/[id]/circuit-breaker` | `/api/webhooks/:id/circuit-breaker` |
| POST | `/api/cp/webhooks/[id]/circuit-breaker/reset` | `/api/webhooks/:id/circuit-breaker/reset` |
| GET | `/api/cp/well-known/aitp-manifest` | `/.well-known/aitp-manifest` |
| GET | `/api/cp/well-known/aitp-revocation-list` | `/.well-known/aitp-revocation-list` |

## Adding a new proxy

1. Create the file under `src/app/api/<service>/<path>/route.ts`.
2. Pick the right helper:
   ```ts
   import { NextRequest } from 'next/server';
   import { proxyGet } from '@/lib/api/proxy';

   export const runtime = 'nodejs';
   export const dynamic = 'force-dynamic';

   export async function GET(req: NextRequest) {
     return proxyGet('cp', '/api/your/path', req);
   }
   ```
3. For routes with path params, await `params` (Next 15 returns it as a
   Promise) and `encodeURIComponent` user-controlled segments.
4. For SSE, use `proxySse` and make sure the upstream sets
   `Content-Type: text/event-stream`. The proxy auto-rewrites
   `Cache-Control` and `X-Accel-Buffering`.
5. Add a row to this table.
6. Add a hit to `src/test/proxies.integration.test.ts` so the contract
   is exercised end-to-end.

The full "add a route end-to-end" recipe (proxy → types → hook →
component → page → tests) lives in the repo's contributor docs:
[`internal_docs/DEVELOPMENT.md`](https://github.com/agentidentitytrustprotocol/aitp-ui-console/tree/main/internal_docs)
(not published here).

## Auth

`PLAYGROUND_API_KEY` and `CP_API_KEY` are added as `Authorization:
Bearer <key>` when set. The browser never sees the values — they live
only in the route-handler process.

Leave both blank for local development; both services accept
unauthenticated requests when their own `API_KEYS` are unset.

## SSE behaviour

`proxySse` streams the upstream `Response.body` straight back to the
browser with three header overrides:

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache, no-transform`
- `X-Accel-Buffering: no` (disables nginx response buffering if a proxy
  ever fronts the console)

There is no per-frame parsing in the proxy — frames are forwarded as
opaque bytes. Browser-side parsing happens in `useSse`.

### CP SSE capacity handling

The control plane caps live SSE listeners and returns 503 when at
capacity. The client `useSse` hook takes an optional `capacityProbePath`
— when supplied it issues a quick GET to that path before opening the
EventSource. A 503 surfaces as a distinct `at-capacity` state so the UI
can display a "control plane at capacity" banner rather than the generic
"reconnecting" state, with a longer backoff. The CP-side cap
(`MAX_SSE_CONNECTIONS`) and its 503 behaviour are documented in the
[CP events](https://agentidentitytrustprotocol.io/control-plane/events) docs.

## Enrollment-token flow

`POST /api/cp/registry/enroll` takes a signed AITP manifest envelope and
returns a short-lived, single-use bearer token. The console surfaces this
in **Registry → New enrollment** with an expiry countdown and a
reveal/copy control — see [FEATURES.md](https://agentidentitytrustprotocol.io/console/features#enrollment-token-flow).
The token's lifetime, JTI single-use semantics, and redemption against
`POST /api/registry/agents` are the control plane's; see the
[CP API](https://agentidentitytrustprotocol.io/control-plane/api).
