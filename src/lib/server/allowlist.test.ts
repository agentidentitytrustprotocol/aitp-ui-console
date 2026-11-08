/** @jest-environment node */
import {
  ALLOWLIST,
  CP_READ_ALLOWLIST_SNAPSHOT,
  canonicalPath,
  matchRoute,
  safeSegment,
} from './allowlist';
import {
  ADMIN_EXPECTED,
  SAMPLE_PATH,
  VARIABLE_PATH_ROUTES,
  handlers,
  type Handler,
} from '../../test/route-inventory';

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
