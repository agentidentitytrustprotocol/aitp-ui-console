/** Test-only inventory of the BFF route handlers under
 *  `src/app/api/{cp,playground}`: each handler's upstream service, the HTTP
 *  method its proxy helper sends, its upstream path as written in source,
 *  a hand-kept sample path per route file, and the hand-kept set of routes
 *  that must be admin-only. Shared by `src/lib/server/allowlist.test.ts`
 *  (classification) and `src/test/public-mode-routes.test.ts` (the real
 *  handlers driven with public mode on). Kept by hand on purpose: it is an
 *  oracle independent of `ALLOWLIST`, so a wrong entry there fails a test
 *  instead of agreeing with itself. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const API = join(__dirname, '..', 'app', 'api');

export function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return routeFiles(p);
    return name === 'route.ts' ? [p] : [];
  });
}

export const HELPER_METHOD: Record<string, string> = {
  proxyGet: 'GET',
  proxyGetVerified: 'GET',
  proxySse: 'GET',
  proxyPost: 'POST',
  proxyPut: 'PUT',
  proxyPatch: 'PATCH',
  proxyDelete: 'DELETE',
};

/** A concrete upstream path per route file (params filled with a sample
 *  value), kept by hand: the test below fails if a route file appears
 *  without an entry here, so a new handler can't skip classification. */
export const SAMPLE_PATH: Record<string, string> = {
  'cp/audit': '/api/audit',
  'cp/dashboard/agents': '/api/dashboard/agents',
  'cp/dashboard': '/api/dashboard/overview',
  'cp/delegations': '/api/delegations',
  'cp/events/history': '/api/events/history',
  'cp/events/stream': '/api/events/stream',
  'cp/health': '/api/health',
  'cp/metrics': '/api/metrics',
  'cp/pinned-keys': '/api/pinned-keys',
  'cp/readyz': '/api/readyz',
  'cp/registry/agents/[aid]/manifest':
    '/api/registry/agents/aid%3Aexample/manifest',
  'cp/registry/agents/[aid]': '/api/registry/agents/aid%3Aexample',
  'cp/registry/agents': '/api/registry/agents',
  'cp/registry/enroll': '/api/registry/enroll',
  'cp/revocation/entries': '/api/revocation/entries',
  'cp/revocation/issuers': '/api/revocation/issuers',
  'cp/revocations': '/api/revocations',
  'cp/sessions/[sessionId]/export': '/api/sessions/s1/export',
  'cp/sessions/[sessionId]/replay': '/api/sessions/s1/replay',
  'cp/sessions/[sessionId]': '/api/sessions/s1',
  'cp/sessions': '/api/sessions',
  'cp/tcts': '/api/tcts',
  'cp/trust-anchors/[id]': '/api/trust-anchors/t1',
  'cp/trust-anchors': '/api/trust-anchors',
  'cp/webhooks/[id]/circuit-breaker/reset':
    '/api/webhooks/w1/circuit-breaker/reset',
  'cp/webhooks/[id]/circuit-breaker': '/api/webhooks/w1/circuit-breaker',
  'cp/webhooks/[id]': '/api/webhooks/w1',
  'cp/webhooks': '/api/webhooks',
  'cp/well-known/aitp-manifest': '/.well-known/aitp-manifest',
  'playground/agents': '/agents',
  'playground/capabilities': '/capabilities',
  'playground/health': '/healthz',
  'playground/hosted-agents/[id]/invoke': '/hosted-agents/h1/invoke',
  'playground/hosted-agents/[id]/resolve-and-handshake':
    '/hosted-agents/h1/resolve-and-handshake',
  'playground/hosted-agents/[id]': '/hosted-agents/h1',
  'playground/hosted-agents': '/hosted-agents',
  'playground/metrics': '/metrics',
  'playground/packs': '/packs',
  'playground/runs/[id]/cancel': '/runs/r1/cancel',
  'playground/runs/[id]/cp-audit': '/runs/r1/cp-audit',
  'playground/runs/[id]/cp-sessions': '/runs/r1/cp-sessions',
  'playground/runs/[id]/deliveries': '/runs/r1/cp-deliveries',
  'playground/runs/[id]/events': '/runs/r1/events',
  'playground/runs/[id]/narrate': '/runs/r1/narrate',
  'playground/runs/[id]': '/runs/r1',
  'playground/runs/[id]/status': '/runs/r1/status',
  'playground/runs': '/runs',
  'playground/scenario-templates': '/scenarios/pack/scenario%40v1/templates',
  'playground/scenarios/[...ref]': '/scenarios/pack/scenario%40v1',
  'playground/scenarios': '/scenarios',
};

export interface Handler {
  route: string;
  exportName: string;
  service: 'cp' | 'playground';
  method: string;
  /** The upstream path as written in the route's source, each `${…}`
   *  replaced by a sample segment; null when the route passes a variable. */
  sourcePath: string | null;
}

/** Route files that build the upstream path in a variable rather than
 *  inline (checked by hand: `scenarios/[...ref]` joins encoded segments). */
export const VARIABLE_PATH_ROUTES = new Set(['playground/scenarios/[...ref]']);

export function handlers(): Handler[] {
  const out: Handler[] = [];
  for (const dir of ['cp', 'playground']) {
    for (const file of routeFiles(join(API, dir))) {
      const route = relative(API, file).replace(/\/route\.ts$/, '');
      const src = readFileSync(file, 'utf8');
      const chunks = src.split(/export async function /).slice(1);
      for (const chunk of chunks) {
        const exportName = /^(\w+)/.exec(chunk)![1];
        const call =
          /(proxy[A-Za-z]+)\(\s*'(cp|playground)',\s*(?:'([^']*)'|`([^`]*)`|\w+)/.exec(
            chunk,
          );
        if (!call)
          throw new Error(`${route} ${exportName}: no proxy helper call`);
        const method = HELPER_METHOD[call[1]];
        if (!method)
          throw new Error(`${route} ${exportName}: unknown helper ${call[1]}`);
        out.push({
          route,
          exportName,
          service: call[2] as Handler['service'],
          method,
          sourcePath: call[3] ?? call[4]?.replace(/\$\{[^}]*\}/g, 'x1') ?? null,
        });
      }
    }
  }
  return out;
}

export const ADMIN_EXPECTED = new Set([
  'cp GET /api/audit',
  'cp GET /api/metrics',
  'cp GET /api/revocations',
  'cp POST /api/revocation/entries',
  'cp POST /api/registry/enroll',
  'cp DELETE /api/registry/agents/:id',
  'cp POST /api/pinned-keys',
  'cp DELETE /api/pinned-keys',
  'cp POST /api/trust-anchors',
  'cp PATCH /api/trust-anchors/:id',
  'cp DELETE /api/trust-anchors/:id',
  'cp GET /api/webhooks',
  'cp POST /api/webhooks',
  'cp PATCH /api/webhooks/:id',
  'cp DELETE /api/webhooks/:id',
  'cp GET /api/webhooks/:id/circuit-breaker',
  'cp POST /api/webhooks/:id/circuit-breaker',
  'cp POST /api/webhooks/:id/circuit-breaker/reset',
  'playground GET /metrics',
  'playground POST /runs/:id/cancel',
  'playground POST /hosted-agents',
  'playground DELETE /hosted-agents/:id',
  'playground POST /hosted-agents/:id/invoke',
  'playground POST /hosted-agents/:id/resolve-and-handshake',
]);
