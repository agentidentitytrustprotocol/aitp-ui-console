/**
 * @jest-environment node
 *
 * next/server's NextRequest relies on the global Request constructor, which
 * jsdom doesn't provide the way Next expects — run this suite under the
 * node test environment, matching src/lib/api/proxy.test.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config, proxy } from './proxy';
import { SESSION_COOKIE, signSession } from './lib/auth/session';

const ORIGIN = 'https://console.example.com';
const HOST = 'console.example.com';
const PASSWORD = 'operator-password-for-tests';
const SECRET = '0123456789abcdef'.repeat(4);

function req(
  url: string,
  method: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(
    new Request(url, { method, headers: { host: HOST, ...headers } }),
  );
}

/** NextResponse.next() — the request continues to the route. */
function passedThrough(res: Response): boolean {
  return res.headers.get('x-middleware-next') === '1';
}

const basic = (s: string) => `Basic ${Buffer.from(s).toString('base64')}`;

// ---------------------------------------------------------------------------
// Route table, derived from the filesystem so a new route is covered the
// moment it exists. Dynamic segments get a sample value; catch-alls get two.
// ---------------------------------------------------------------------------

const APP_DIR = path.join(__dirname, 'app');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

function urlPath(file: string): string {
  const rel = path.relative(APP_DIR, path.dirname(file)).split(path.sep);
  const segs = rel
    .filter((s) => s && !(s.startsWith('(') && s.endsWith(')')))
    .map((s) => {
      if (/^\[\.\.\..+\]$/.test(s) || /^\[\[\.\.\..+\]\]$/.test(s))
        return 'sample/nested';
      if (/^\[.+\]$/.test(s)) return 'sample-id';
      return s;
    });
  return `/${segs.join('/')}`;
}

function exportedMethods(file: string): string[] {
  const src = fs.readFileSync(file, 'utf8');
  return METHODS.filter((m) =>
    new RegExp(`export\\s+(async\\s+function|function|const)\\s+${m}\\b`).test(
      src,
    ),
  );
}

const apiRoutes = walk(path.join(APP_DIR, 'api'))
  .filter((f) => /[/\\]route\.ts$/.test(f))
  .flatMap((f) =>
    exportedMethods(f).map((method) => ({ path: urlPath(f), method })),
  );

const pages = walk(APP_DIR)
  .filter((f) => /[/\\]page\.tsx$/.test(f))
  .map(urlPath);

const mutations = apiRoutes.filter((r) => r.method !== 'GET');

let cookie: string;

beforeAll(async () => {
  cookie = `${SESSION_COOKIE}=${await signSession(SECRET)}`;
});

beforeEach(() => {
  process.env.CONSOLE_PASSWORD = PASSWORD;
  process.env.CONSOLE_SESSION_SECRET = SECRET;
  delete process.env.TRUSTED_ORIGINS;
});

afterAll(() => {
  delete process.env.CONSOLE_PASSWORD;
  delete process.env.CONSOLE_SESSION_SECRET;
});

describe('route table', () => {
  it('found the BFF routes on disk', () => {
    // Guards the walk itself: an empty table would make every test below
    // vacuously pass.
    expect(apiRoutes.length).toBeGreaterThan(40);
    expect(apiRoutes).toContainEqual({
      path: '/api/cp/registry/agents',
      method: 'GET',
    });
    expect(apiRoutes).toContainEqual({
      path: '/api/playground/runs',
      method: 'POST',
    });
    expect(mutations.length).toBeGreaterThan(10);
    expect(pages).toContain('/dashboard');
  });
});

describe('matcher', () => {
  it.each([...apiRoutes.map((r) => r.path), ...pages, '/login', '/logout'])(
    'runs the proxy on %s',
    (p) => {
      expect(unstable_doesMiddlewareMatch({ config, url: p })).toBe(true);
    },
  );

  it.each(['/_next/static/chunks/main.js', '/_next/image', '/favicon.ico'])(
    'skips static asset %s',
    (p) => {
      expect(unstable_doesMiddlewareMatch({ config, url: p })).toBe(false);
    },
  );
});

describe.each(apiRoutes)('$method $path', ({ path: p, method }) => {
  const url = `${ORIGIN}${p}`;
  const sameOrigin: Record<string, string> =
    method === 'GET' ? {} : { origin: ORIGIN };

  it('is 401 without credentials', async () => {
    const res = await proxy(req(url, method, sameOrigin));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: 'Authentication required',
      code: 'unauthenticated',
    });
  });

  it('is 401 with a tampered session cookie', async () => {
    const tampered =
      cookie.slice(0, -2) + (cookie.endsWith('AA') ? 'BB' : 'AA');
    const res = await proxy(
      req(url, method, { ...sameOrigin, cookie: tampered }),
    );
    expect(res.status).toBe(401);
  });

  it('is 401 with a wrong Basic password', async () => {
    const res = await proxy(
      req(url, method, { ...sameOrigin, authorization: basic('op:nope') }),
    );
    expect(res.status).toBe(401);
  });

  it('passes with a valid session', async () => {
    const res = await proxy(req(url, method, { ...sameOrigin, cookie }));
    expect(passedThrough(res)).toBe(true);
  });

  it('passes with HTTP Basic', async () => {
    const res = await proxy(
      req(url, method, {
        ...sameOrigin,
        authorization: basic(`op:${PASSWORD}`),
      }),
    );
    expect(passedThrough(res)).toBe(true);
  });

  it('is 503 when the console is not configured', async () => {
    delete process.env.CONSOLE_PASSWORD;
    const res = await proxy(req(url, method, { ...sameOrigin, cookie }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: 'console not configured',
      code: 'console_not_configured',
    });
  });
});

describe.each(mutations)(
  '$method $path (authenticated)',
  ({ path: p, method }) => {
    const url = `${ORIGIN}${p}`;

    it('is 403 with no Origin', async () => {
      const res = await proxy(req(url, method, { cookie }));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: 'Cross-site request rejected',
        code: 'csrf_blocked',
      });
    });

    it('is 403 with a foreign Origin', async () => {
      const res = await proxy(
        req(url, method, { cookie, origin: 'https://evil.example.com' }),
      );
      expect(res.status).toBe(403);
    });

    it('is 403 with Basic and no Origin', async () => {
      const res = await proxy(
        req(url, method, { authorization: basic(`op:${PASSWORD}`) }),
      );
      expect(res.status).toBe(403);
    });
  },
);

describe('pages', () => {
  it.each(pages)('%s redirects to /login without a session', async (p) => {
    const res = await proxy(req(`${ORIGIN}${p}?tab=x`, 'GET'));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('next')).toBe(`${p}?tab=x`);
  });

  it.each(pages)('%s loads with a session', async (p) => {
    expect(
      passedThrough(await proxy(req(`${ORIGIN}${p}`, 'GET', { cookie }))),
    ).toBe(true);
  });

  it('a page is 503 (plain text) when the session secret is unset', async () => {
    delete process.env.CONSOLE_SESSION_SECRET;
    const res = await proxy(req(`${ORIGIN}/dashboard`, 'GET', { cookie }));
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('console not configured');
  });
});

describe('/login', () => {
  const url = `${ORIGIN}/login`;

  it('GET needs no session', async () => {
    expect(passedThrough(await proxy(req(url, 'GET')))).toBe(true);
  });

  it('POST needs no session but does need a same-origin Origin', async () => {
    expect(
      passedThrough(await proxy(req(url, 'POST', { origin: ORIGIN }))),
    ).toBe(true);
    expect((await proxy(req(url, 'POST'))).status).toBe(403);
    expect(
      (await proxy(req(url, 'POST', { origin: 'https://evil.example.com' })))
        .status,
    ).toBe(403);
  });

  it('is 503 when the console is not configured', async () => {
    delete process.env.CONSOLE_PASSWORD;
    expect((await proxy(req(url, 'GET'))).status).toBe(503);
  });

  it('only the exact /login path is exempt', async () => {
    expect((await proxy(req(`${ORIGIN}/login-other`, 'GET'))).status).toBe(307);
    expect((await proxy(req(`${ORIGIN}/api/login`, 'GET'))).status).toBe(401);
  });
});

describe('unknown paths', () => {
  it.each(['/api/cp/agents', '/api/anything', '/no-such-page'])(
    '%s still requires auth before routing',
    async (p) => {
      const res = await proxy(req(`${ORIGIN}${p}`, 'GET'));
      expect([401, 307]).toContain(res.status);
      expect(passedThrough(res)).toBe(false);
    },
  );
});

describe('Origin check', () => {
  const url = `${ORIGIN}/api/cp/sessions`;

  it('passes GETs regardless of Origin', async () => {
    const res = await proxy(
      req(url, 'GET', { cookie, origin: 'https://evil.example.com' }),
    );
    expect(passedThrough(res)).toBe(true);
  });

  it('rejects an opaque Origin: null (e.g. a sandboxed iframe)', async () => {
    expect(
      (await proxy(req(url, 'POST', { cookie, origin: 'null' }))).status,
    ).toBe(403);
  });

  it('rejects the same host on a different scheme', async () => {
    expect(
      (await proxy(req(url, 'POST', { cookie, origin: `http://${HOST}` })))
        .status,
    ).toBe(403);
  });

  it('allows a cross-origin request whose Origin is in TRUSTED_ORIGINS', async () => {
    process.env.TRUSTED_ORIGINS = 'https://trusted.example.com';
    const res = await proxy(
      req(url, 'PUT', { cookie, origin: 'https://trusted.example.com' }),
    );
    expect(passedThrough(res)).toBe(true);
  });
});

describe('SSE', () => {
  it('passes the stream route through without producing a body', async () => {
    const res = await proxy(
      req(`${ORIGIN}/api/cp/events/stream`, 'GET', { cookie }),
    );
    expect(passedThrough(res)).toBe(true);
    expect(res.body).toBeNull();
  });
});
