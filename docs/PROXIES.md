# BFF Proxy Routes

Every browser request goes through one of these routes. Each is a 4-line
delegation to `proxyGet` / `proxyPost` / `proxyPut` / `proxyDelete` /
`proxySse` from `src/lib/api/proxy.ts`. No business logic lives here.

Status codes and bodies are passed through unchanged from the upstream;
on connection failure we synthesize a 502 with shape
`{ error, target, upstream_status: 502 }`.

## Playground (`PLAYGROUND_URL`, default `http://localhost:8000`)

| Method | Console route | Upstream |
| --- | --- | --- |
| GET | `/api/playground/health` | `/healthz` |
| GET | `/api/playground/packs` | `/packs` |
| GET | `/api/playground/scenarios` | `/scenarios` |
| GET | `/api/playground/scenarios/[...ref]` | `/scenarios/<pack>/<scenario>@<version>` |
| GET | `/api/playground/runs` | `/runs` |
| POST | `/api/playground/runs` | `/runs` |
| GET | `/api/playground/runs/[id]` | `/runs/:id` |
| GET | `/api/playground/runs/[id]/status` | `/runs/:id/status` |
| POST | `/api/playground/runs/[id]/cancel` | `/runs/:id/cancel` |
| **SSE** | `/api/playground/runs/[id]/events` | `/runs/:id/events` |

## Control Plane (`CP_URL`, default `http://localhost:4000`)

| Method | Console route | Upstream |
| --- | --- | --- |
| GET | `/api/cp/health` | `/api/health` |
| GET | `/api/cp/dashboard` | `/api/dashboard/overview` |
| GET | `/api/cp/dashboard/agents` | `/api/dashboard/agents` |
| GET | `/api/cp/registry/agents` | `/api/registry/agents` |
| GET | `/api/cp/registry/agents/[aid]` | `/api/registry/agents/:aid` |
| GET | `/api/cp/registry/agents/[aid]/manifest` | `/api/registry/agents/:aid/manifest` |
| **SSE** | `/api/cp/events/stream` | `/api/events/stream` |
| GET | `/api/cp/events/history` | `/api/events/history` |
| GET | `/api/cp/sessions` | `/api/sessions` |
| GET | `/api/cp/sessions/[sessionId]` | `/api/sessions/:sessionId` |
| GET | `/api/cp/audit` | `/api/audit` |
| GET | `/api/cp/metrics` | `/api/metrics` |
| GET | `/api/cp/webhooks` | `/api/webhooks` |
| POST | `/api/cp/webhooks` | `/api/webhooks` |
| PUT | `/api/cp/webhooks/[id]` | `/api/webhooks/:id` |
| DELETE | `/api/cp/webhooks/[id]` | `/api/webhooks/:id` |
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
