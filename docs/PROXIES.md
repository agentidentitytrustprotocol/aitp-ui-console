# BFF Proxy Routes

Every browser request goes through one of these routes. Each is a 4-line
delegation to `proxyGet` / `proxyPost` / `proxyPut` / `proxyDelete` /
`proxySse` from `src/lib/api/proxy.ts`. No business logic lives here.

Status codes and bodies are passed through unchanged from the upstream;
on connection failure we synthesize a 502 with shape
`{ error, target, upstream_status: 502 }`.

> **v0.2 refresh:** the table below catches up to playground v0.2 and
> control-plane post-operator-hardening. New rows are marked **(new)**.

## Playground (`PLAYGROUND_URL`, default `http://localhost:8000`)

| Method | Console route | Upstream |
| --- | --- | --- |
| GET | `/api/playground/health` | `/healthz` |
| GET | `/api/playground/capabilities` **(new)** | `/capabilities` |
| GET | `/api/playground/agents` **(new)** | `/agents` |
| GET | `/api/playground/metrics` **(new)** | `/metrics` |
| GET | `/api/playground/packs` | `/packs` |
| GET | `/api/playground/scenarios` | `/scenarios` |
| GET | `/api/playground/scenarios/[...ref]` | `/scenarios/<pack>/<scenario>@<version>` |
| GET | `/api/playground/scenarios/[...ref]/templates` **(new)** | `/scenarios/<pack>/<scenario>@<version>/templates` |
| GET | `/api/playground/runs` | `/runs` |
| POST | `/api/playground/runs` | `/runs` (accepts `template`, `variant`, `fault_injection`) |
| GET | `/api/playground/runs/[id]` | `/runs/:id` |
| GET | `/api/playground/runs/[id]/status` | `/runs/:id/status` |
| POST | `/api/playground/runs/[id]/cancel` | `/runs/:id/cancel` |
| GET | `/api/playground/runs/[id]/narrate` **(new)** | `/runs/:id/narrate` |
| GET | `/api/playground/runs/[id]/cp-audit` **(new)** | `/runs/:id/cp-audit` |
| GET | `/api/playground/runs/[id]/cp-sessions` **(new)** | `/runs/:id/cp-sessions` |
| GET | `/api/playground/runs/[id]/deliveries` **(new)** | `/runs/:id/deliveries` |
| **SSE** | `/api/playground/runs/[id]/events` | `/runs/:id/events` |

## Control Plane (`CP_URL`, default `http://localhost:4000`)

| Method | Console route | Upstream |
| --- | --- | --- |
| GET | `/api/cp/health` | `/api/health` |
| GET | `/api/cp/readyz` **(new)** | `/api/readyz` |
| GET | `/api/cp/dashboard` | `/api/dashboard/overview` |
| GET | `/api/cp/dashboard/agents` | `/api/dashboard/agents` |
| GET | `/api/cp/registry/agents` | `/api/registry/agents` |
| POST | `/api/cp/registry/enroll` **(new)** | `/api/registry/enroll` |
| GET | `/api/cp/registry/agents/[aid]` | `/api/registry/agents/:aid` |
| DELETE | `/api/cp/registry/agents/[aid]` **(new)** | `/api/registry/agents/:aid` |
| GET | `/api/cp/registry/agents/[aid]/manifest` | `/api/registry/agents/:aid/manifest` |
| **SSE** | `/api/cp/events/stream` | `/api/events/stream` (cap-aware) |
| GET | `/api/cp/events/history` | `/api/events/history` |
| GET | `/api/cp/sessions` | `/api/sessions` |
| GET | `/api/cp/sessions/[sessionId]` | `/api/sessions/:sessionId` |
| GET | `/api/cp/audit` | `/api/audit` |
| GET | `/api/cp/metrics` | `/api/metrics` |
| GET | `/api/cp/tcts` **(new)** | `/api/tcts` |
| GET | `/api/cp/delegations` **(new)** | `/api/delegations` |
| GET, POST | `/api/cp/revocation/entries` **(new)** | `/api/revocation/entries` |
| GET, POST | `/api/cp/trust-anchors` **(new)** | `/api/trust-anchors` |
| GET, POST | `/api/cp/pinned-keys` **(new)** | `/api/pinned-keys` |
| GET, POST | `/api/cp/webhooks` | `/api/webhooks` |
| PUT, DELETE | `/api/cp/webhooks/[id]` | `/api/webhooks/:id` |
| GET, POST | `/api/cp/webhooks/[id]/circuit-breaker` **(new)** | `/api/webhooks/:id/circuit-breaker` |
| POST | `/api/cp/webhooks/[id]/circuit-breaker/reset` **(new)** | `/api/webhooks/:id/circuit-breaker/reset` |
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

## Auth

`PLAYGROUND_API_KEY` and `CP_API_KEY` are added as `Authorization:
Bearer <key>` when set. The browser never sees the values — they live
only in the route handler process.

Leave both blank for local development; both services accept unauthenticated
requests when `API_KEYS` is unset on their end.

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

The control plane caps live SSE listeners (`MAX_SSE_CONNECTIONS`, default
500). When it's at capacity it returns 503. The client `useSse` hook
takes an optional `capacityProbePath` — when supplied it issues a quick
GET to that path before opening the EventSource. A 503 surfaces as a
distinct `at-capacity` state so the UI can display a "CP at capacity"
banner rather than the generic "reconnecting" state. CP backoff starts
at 5s and caps at 30s.

## Enrollment-token flow (CP)

1. The console (or the agent) calls `POST /api/cp/registry/enroll` with a
   signed AITP manifest envelope. CP returns
   `{ token, jti, exp, agent_aid }`.
2. The token is a HMAC bearer valid for ~5 minutes and is JTI-bound — a
   single use against `POST /api/registry/agents` consumes it.
3. The console surfaces the token in `Registry → New enrollment` with a
   countdown and a hidden-by-default reveal control.
