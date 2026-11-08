/**
 * @jest-environment node
 *
 * Route-level sweep with public mode ON: every real BFF route handler under
 * `src/app/api/{cp,playground}` is driven end to end (edge gate, handler,
 * proxy helper, access decision, upstream credentials) with only `fetch`
 * mocked. The helper-level tests in `src/lib/api/proxy.test.ts` prove the
 * pieces; this proves the shipped handlers wire them together, for every
 * handler, before the flag is turned on in production.
 *
 * Oracle: `ADMIN_EXPECTED` in `./route-inventory`, kept by hand and
 * independent of `ALLOWLIST`, so a wrong allowlist entry fails here.
 */
import { NextRequest } from 'next/server';
import { join } from 'node:path';
import { API, ADMIN_EXPECTED, handlers, type Handler } from './route-inventory';
import {
  OPERATOR_BASIC,
  TEST_CONSOLE_PASSWORD,
  TEST_SESSION_SECRET,
} from './operator';
import type { AllowEntry } from '../lib/server/allowlist';

const ORIGIN = 'http://localhost:3001';
const VISITOR_IP = '203.0.113.7';
const ENV = {
  AITP_CONSOLE_PUBLIC_MODE: 'on',
  VERCEL: '1',
  PLAYGROUND_API_KEY: 'pg-key',
  CP_API_KEY: 'cp-admin',
  CP_READ_API_KEY: 'cp-read',
  CONSOLE_PASSWORD: TEST_CONSOLE_PASSWORD,
  CONSOLE_SESSION_SECRET: TEST_SESSION_SECRET,
};
const ORIGINAL_FETCH = global.fetch;

/** Sample values for dynamic segments; `[...ref]` takes two segments. */
const PARAM_SAMPLE: Record<string, string | string[]> = {
  aid: 'aid:example',
  id: 'x1',
  sessionId: 's1',
  ref: ['pack', 'scenario@v1'],
};
/** Required query strings (the handler answers 400 without them). */
const QUERY: Record<string, string> = {
  'playground/scenario-templates': '?ref=pack/scenario@v1',
};

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function mockFetch(): Seen[] {
  const seen: Seen[] = [];
  global.fetch = (async (url: string, init: RequestInit) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(init.headers as Record<string, string>))
      headers[k.toLowerCase()] = v;
    seen.push({ url, method: String(init.method), headers });
    const sse = headers.accept === 'text/event-stream';
    return new Response(sse ? 'data: {}\n\n' : '{}', {
      status: 200,
      headers: {
        'Content-Type': sse ? 'text/event-stream' : 'application/json',
      },
    });
  }) as unknown as typeof fetch;
  return seen;
}

/** Fresh module registry under ENV: config is captured at import and the
 *  limiters are module state, so every test starts with empty buckets. */
function loadModules() {
  jest.resetModules();
  Object.assign(process.env, ENV);
  const allowlist =
    require('../lib/server/allowlist') as typeof import('../lib/server/allowlist');
  const edge = require('../proxy') as typeof import('../proxy');
  return { allowlist, edge };
}

function browserPath(route: string): {
  path: string;
  params: Record<string, string | string[]>;
} {
  const params: Record<string, string | string[]> = {};
  const segs = route.split('/').map((seg) => {
    const m = /^\[(\.\.\.)?(\w+)\]$/.exec(seg);
    if (!m) return seg;
    const v = PARAM_SAMPLE[m[2]];
    if (v === undefined) throw new Error(`no sample for [${m[2]}] in ${route}`);
    params[m[2]] = v;
    return Array.isArray(v)
      ? v.map(encodeURIComponent).join('/')
      : encodeURIComponent(v);
  });
  return { path: `/api/${segs.join('/')}${QUERY[route] ?? ''}`, params };
}

function request(
  path: string,
  method: string,
  operator: boolean,
  extra: Record<string, string> = {},
): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: ORIGIN,
    'x-real-ip': VISITOR_IP,
    // Browser-supplied credentials and IP: never forwarded upstream.
    'x-api-key': 'browser-supplied',
    'x-aitp-client-ip': '6.6.6.6',
    ...extra,
  };
  if (operator) headers.authorization = OPERATOR_BASIC;
  return new NextRequest(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers,
      body: method === 'GET' ? undefined : '{"scenario_ref":"pack/scenario"}',
    }),
  );
}

type RouteFn = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string | string[]>> },
) => Promise<Response>;

/** Edge gate first (as Next runs it), then the handler if the gate passes. */
async function drive(
  h: Handler,
  operator: boolean,
  extra: Record<string, string> = {},
): Promise<{
  res: Response;
  body: string;
  seen: Seen[];
  edgePassed: boolean;
}> {
  const { edge } = loadModules();
  const seen = mockFetch();
  const { path, params } = browserPath(h.route);
  const gate = await edge.proxy(request(path, h.exportName, operator, extra));
  const edgePassed = gate.headers.get('x-middleware-next') === '1';
  if (!edgePassed)
    return { res: gate, body: await gate.text(), seen, edgePassed };
  const mod = require(join(API, h.route, 'route.ts')) as Record<
    string,
    RouteFn
  >;
  const res = await mod[h.exportName](
    request(path, h.exportName, operator, extra),
    { params: Promise.resolve(params) },
  );
  // Drain (SSE included) so stream slots are released.
  const body = await res.text();
  return { res, body, seen, edgePassed };
}

const ALL = handlers();
const key = (e: AllowEntry) => `${e.service} ${e.method} ${e.template}`;

/** The upstream route each handler reaches, observed from an operator call. */
function upstreamPath(s: Seen): string {
  const u = new URL(s.url);
  return u.pathname;
}

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  for (const n of Object.keys(ENV)) delete process.env[n];
});

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('public mode on: every real route handler', () => {
  it('covers the full inventory (62 handlers)', () => {
    expect(ALL).toHaveLength(62);
  });

  describe.each(ALL.map((h) => [`${h.exportName} /api/${h.route}`, h]))(
    '%s',
    (_name, hRaw) => {
      const h = hRaw as Handler;

      it('operator: reaches upstream once with server-held credentials and the visitor IP', async () => {
        const { res, seen, edgePassed } = await drive(h, true);
        expect(edgePassed).toBe(true);
        expect(res.status).toBe(200);
        expect(seen).toHaveLength(1);
        const [s] = seen;
        expect(s.method).toBe(h.method);
        expect(s.headers['x-aitp-client-ip']).toBe(VISITOR_IP);
        const entry = loadModules().allowlist.matchRoute(
          h.service,
          h.method as never,
          upstreamPath(s),
        );
        expect(entry).not.toBeNull();
        if (h.service === 'playground') {
          expect(s.headers['x-api-key']).toBe('pg-key');
          expect(s.headers.authorization).toBeUndefined();
        } else {
          expect(s.headers['x-api-key']).toBeUndefined();
          expect(s.headers.authorization).toBe(
            entry!.cpKey === 'none' ? undefined : 'Bearer cp-admin',
          );
        }
      });

      it('anonymous: admin routes are 403 with nothing fetched; public routes use the visitor credential set', async () => {
        const op = await drive(h, true);
        const entry = loadModules().allowlist.matchRoute(
          h.service,
          h.method as never,
          upstreamPath(op.seen[0]),
        )!;
        const adminExpected = ADMIN_EXPECTED.has(key(entry));

        const { res, body, seen, edgePassed } = await drive(h, false);
        expect(edgePassed).toBe(true); // the edge never classifies routes
        if (adminExpected) {
          expect(res.status).toBe(403);
          expect(JSON.parse(body)).toMatchObject({
            code: 'CONSOLE_OPERATOR_SESSION_REQUIRED',
          });
          expect(seen).toHaveLength(0);
          return;
        }
        expect(entry.access).toBe('public');
        expect(res.status).toBe(200);
        expect(seen).toHaveLength(1);
        const [s] = seen;
        expect(s.url).toBe(op.seen[0].url);
        expect(s.headers['x-aitp-client-ip']).toBe(VISITOR_IP);
        if (h.service === 'playground') {
          expect(s.headers['x-api-key']).toBe('pg-key');
          expect(s.headers.authorization).toBeUndefined();
        } else {
          expect(s.headers['x-api-key']).toBeUndefined();
          expect(s.headers.authorization).toBe(
            entry.cpKey === 'read' ? 'Bearer cp-read' : undefined,
          );
        }
      });
    },
  );
});

describe('public mode on: targeted route behaviour', () => {
  const find = (route: string, exportName: string) =>
    ALL.find((h) => h.route === route && h.exportName === exportName)!;

  it('admin refusals carry CONSOLE_OPERATOR_SESSION_REQUIRED', async () => {
    for (const [route, m] of [
      ['cp/audit', 'GET'],
      ['cp/metrics', 'GET'],
      ['playground/metrics', 'GET'],
      ['cp/registry/enroll', 'POST'],
      ['cp/webhooks', 'POST'],
      ['cp/revocations', 'GET'],
      ['cp/revocation/entries', 'POST'],
    ]) {
      const { res, body, seen } = await drive(find(route, m), false);
      expect([route, res.status]).toEqual([route, 403]);
      expect(JSON.parse(body)).toMatchObject({
        code: 'CONSOLE_OPERATOR_SESSION_REQUIRED',
      });
      expect(seen).toHaveLength(0);
    }
  });

  it('anonymous launch: 5 per window, then 429 with Retry-After and no upstream call', async () => {
    const { edge } = loadModules();
    const seen = mockFetch();
    const mod = require(join(API, 'playground/runs', 'route.ts')) as Record<
      string,
      RouteFn
    >;
    const launch = async () => {
      const r = () => request('/api/playground/runs', 'POST', false);
      const gate = await edge.proxy(r());
      expect(gate.headers.get('x-middleware-next')).toBe('1');
      return mod.POST(r(), { params: Promise.resolve({}) });
    };
    for (let i = 0; i < 5; i++) expect((await launch()).status).toBe(200);
    const sixth = await launch();
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(seen).toHaveLength(5);
  });

  it('anonymous mutation from a foreign Origin is refused at the edge', async () => {
    const { res, seen, edgePassed } = await drive(
      find('playground/runs', 'POST'),
      false,
      { origin: 'https://evil.example' },
    );
    expect(edgePassed).toBe(false);
    expect(res.status).toBe(403);
    expect(seen).toHaveLength(0);
  });

  it('anonymous SSE streams with the backend key', async () => {
    const { res, seen } = await drive(
      find('playground/runs/[id]/events', 'GET'),
      false,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(seen[0].headers['x-api-key']).toBe('pg-key');
  });

  it('the forwarded IP is x-real-ip, never a browser-spoofed X-AITP-Client-IP or leftmost X-Forwarded-For', async () => {
    const { seen } = await drive(find('playground/runs', 'POST'), false, {
      'x-aitp-client-ip': '6.6.6.6',
      'x-forwarded-for': '7.7.7.7, 198.51.100.9',
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].headers['x-aitp-client-ip']).toBe(VISITOR_IP);
  });

  it('anonymous CP read whose read key is rejected: 503 cp_read_key_unavailable, no admin retry', async () => {
    const { edge } = loadModules();
    const seen: Seen[] = [];
    global.fetch = (async (url: string, init: RequestInit) => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(
        init.headers as Record<string, string>,
      ))
        headers[k.toLowerCase()] = v;
      seen.push({ url, method: String(init.method), headers });
      return new Response('{"code":"INVALID_API_KEY"}', { status: 401 });
    }) as unknown as typeof fetch;
    const r = () => request('/api/cp/registry/agents', 'GET', false);
    expect((await edge.proxy(r())).headers.get('x-middleware-next')).toBe('1');
    const mod = require(join(API, 'cp/registry/agents', 'route.ts')) as Record<
      string,
      RouteFn
    >;
    const res = await mod.GET(r(), { params: Promise.resolve({}) });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'cp_read_key_unavailable' });
    expect(seen).toHaveLength(1);
    expect(seen[0].headers.authorization).toBe('Bearer cp-read');
  });

  it('no anonymous call anywhere carries the CP admin key', async () => {
    for (const h of ALL) {
      const { seen } = await drive(h, false);
      for (const s of seen)
        expect([h.route, s.headers.authorization]).not.toEqual([
          h.route,
          'Bearer cp-admin',
        ]);
    }
  });
});
