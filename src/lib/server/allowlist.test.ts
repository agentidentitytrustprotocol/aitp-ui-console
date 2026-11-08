/** @jest-environment node */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  ALLOWLIST,
  CP_READ_ALLOWLIST_SNAPSHOT,
  canonicalPath,
  matchRoute,
  safeSegment,
} from './allowlist';

const API = join(__dirname, '..', '..', 'app', 'api');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return routeFiles(p);
    return name === 'route.ts' ? [p] : [];
  });
}

const HELPER_METHOD: Record<string, string> = {
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
const SAMPLE_PATH: Record<string, string> = {
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

interface Handler {
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
const VARIABLE_PATH_ROUTES = new Set(['playground/scenarios/[...ref]']);

function handlers(): Handler[] {
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

const ADMIN_EXPECTED = new Set([
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

describe('ALLOWLIST shape', () => {
  it('every entry declares access, limit and cpKey', () => {
    for (const e of ALLOWLIST) {
      expect(['public', 'admin']).toContain(e.access);
      expect(['read', 'launch', 'stream']).toContain(e.limit);
      expect(['read', 'admin', 'none']).toContain(e.cpKey);
      if (e.service === 'playground') expect(e.cpKey).toBe('none');
      if (e.service === 'cp' && e.access === 'admin')
        expect(e.cpKey).toBe('admin');
    }
  });

  it('has no duplicate (service, method, template)', () => {
    const ids = ALLOWLIST.map((e) => `${e.service} ${e.method} ${e.template}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has exactly one launch entry: playground POST /runs', () => {
    const launches = ALLOWLIST.filter((e) => e.limit === 'launch');
    expect(
      launches.map((e) => `${e.service} ${e.method} ${e.template}`),
    ).toEqual(['playground POST /runs']);
  });

  it('the admin set is exactly the plan D-D admin list', () => {
    const admin = new Set(
      ALLOWLIST.filter((e) => e.access === 'admin').map(
        (e) => `${e.service} ${e.method} ${e.template}`,
      ),
    );
    expect(admin).toEqual(ADMIN_EXPECTED);
  });

  it('every public mutation is the launch; every other public entry is a GET', () => {
    for (const e of ALLOWLIST.filter((x) => x.access === 'public')) {
      if (e.method !== 'GET') expect(e.limit).toBe('launch');
    }
  });

  it('every cpKey:"read" entry is on the CP read-key allowlist snapshot', () => {
    const snap = new Set(
      CP_READ_ALLOWLIST_SNAPSHOT.map((t) => t.replace(/:\w+/g, ':p')),
    );
    for (const e of ALLOWLIST.filter((x) => x.cpKey === 'read')) {
      expect(e.method).toBe('GET');
      expect(snap.has(e.template.replace(/:\w+/g, ':p'))).toBe(true);
    }
  });

  it('the keyless CP routes are cpKey:"none"', () => {
    for (const p of [
      '/api/health',
      '/api/readyz',
      '/.well-known/aitp-manifest',
    ])
      expect(matchRoute('cp', 'GET', p)).toMatchObject({
        access: 'public',
        cpKey: 'none',
      });
  });
});

describe('route coverage', () => {
  const all = handlers();

  it('walks 62 handlers under src/app/api/{cp,playground}', () => {
    expect(all).toHaveLength(62);
  });

  it('every route file has a sample path', () => {
    const routes = new Set(all.map((h) => h.route));
    expect([...routes].sort()).toEqual(Object.keys(SAMPLE_PATH).sort());
  });

  it.each(handlers().map((h) => [h.route, h.exportName, h]))(
    '%s %s maps to an allowlist entry by the helper method',
    (_r, _e, h) => {
      const handler = h as Handler;
      const entry = matchRoute(
        handler.service,
        handler.method,
        SAMPLE_PATH[handler.route],
      );
      expect(entry).not.toBeNull();
    },
  );

  it("each route's sample path resolves to the same entry as its source path", () => {
    for (const h of all) {
      if (h.sourcePath === null) {
        expect(VARIABLE_PATH_ROUTES).toContain(h.route);
        continue;
      }
      const fromSource = matchRoute(h.service, h.method, h.sourcePath);
      expect([h.route, h.exportName, fromSource]).not.toContain(null);
      expect(fromSource).toBe(
        matchRoute(h.service, h.method, SAMPLE_PATH[h.route]),
      );
    }
  });

  it('keys on the helper method, not the export name (webhooks/[id] PUT sends PATCH)', () => {
    const h = all.find(
      (x) => x.route === 'cp/webhooks/[id]' && x.exportName === 'PUT',
    );
    expect(h?.method).toBe('PATCH');
    expect(matchRoute('cp', 'PUT', '/api/webhooks/w1')).toBeNull();
    expect(matchRoute('cp', 'PATCH', '/api/webhooks/w1')?.access).toBe('admin');
  });
});

describe('matchRoute', () => {
  it('classifies public reads, SSE, launch and admin', () => {
    expect(matchRoute('playground', 'GET', '/runs/abc')).toMatchObject({
      access: 'public',
      limit: 'read',
    });
    expect(matchRoute('playground', 'GET', '/runs/abc/events')).toMatchObject({
      limit: 'stream',
    });
    expect(matchRoute('playground', 'POST', '/runs')).toMatchObject({
      access: 'public',
      limit: 'launch',
    });
    expect(matchRoute('playground', 'POST', '/runs/abc/cancel')).toMatchObject({
      access: 'admin',
    });
    expect(matchRoute('cp', 'GET', '/api/events/stream')).toMatchObject({
      limit: 'stream',
      cpKey: 'read',
    });
    expect(matchRoute('cp', 'GET', '/api/audit')).toMatchObject({
      access: 'admin',
    });
  });

  it('returns null (= admin) for unknown paths and methods', () => {
    expect(matchRoute('cp', 'GET', '/api/secret')).toBeNull();
    expect(matchRoute('playground', 'PUT', '/runs')).toBeNull();
    expect(matchRoute('playground', 'OPTIONS', '/runs')).toBeNull();
    expect(matchRoute('playground', 'GET', '/runs/a/b')).toBeNull();
  });

  it('ignores the query string', () => {
    expect(matchRoute('playground', 'GET', '/runs?limit=5')).toMatchObject({
      access: 'public',
    });
  });

  it('matches scenario refs with one or more segments, including @version', () => {
    expect(
      matchRoute('playground', 'GET', '/scenarios/pack/scn@1.2'),
    ).toMatchObject({ access: 'public' });
    expect(matchRoute('playground', 'GET', '/scenarios/one')).toMatchObject({
      access: 'public',
    });
    expect(
      matchRoute('playground', 'GET', '/scenarios/pack/scn/templates')
        ?.template,
    ).toBe('/scenarios/:ref*/templates');
  });

  it('resolves dot segments before matching (encoded traversal cannot reach admin as public)', () => {
    // `/runs/x/../../metrics` resolves to `/metrics`, which is admin.
    expect(canonicalPath('/runs/x/../../metrics')).toBe('/metrics');
    expect(
      matchRoute('playground', 'GET', '/runs/x/../../metrics')?.access,
    ).toBe('admin');
    expect(
      matchRoute('playground', 'GET', '/runs/%2e%2e/%2e%2e/metrics')?.access,
    ).toBe('admin');
  });

  it('refuses encoded separators and control characters inside a param', () => {
    expect(matchRoute('playground', 'GET', '/runs/a%2Fb')).toBeNull();
    expect(matchRoute('playground', 'GET', '/runs/a%5Cb')).toBeNull();
    expect(matchRoute('playground', 'GET', '/runs/a%00b')).toBeNull();
    expect(matchRoute('playground', 'GET', '/runs/%E0%A4%A')).toBeNull();
  });
});

describe('safeSegment', () => {
  it.each(['abc', 'a.b', 'aid%3Aexample', 'scn@1', 'x~y', 'a+b=c'])(
    'accepts %p',
    (s) => expect(safeSegment(s)).toBe(true),
  );
  it.each([
    '',
    '.',
    '..',
    '%2e',
    '%2E%2e',
    'a%2Fb',
    'a b',
    'a?b',
    'a#b',
    '%ZZ',
  ])('rejects %p', (s) => expect(safeSegment(s)).toBe(false));
});
