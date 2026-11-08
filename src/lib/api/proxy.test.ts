/**
 * @jest-environment node
 *
 * Proxy helpers are imported by Next route handlers and use NextRequest, which
 * relies on the global Request constructor. Node's built-in fetch types ship
 * Request natively, so the `node` environment is the right host here.
 */
import { NextRequest } from 'next/server';
import {
  proxyDelete,
  proxyGet,
  proxyGetVerified,
  proxyPost,
  proxyPut,
  proxySse,
} from './proxy';
import type { Verdict } from '../types/cp';
import {
  OPERATOR_BASIC,
  clearConsoleAuthEnv,
  setConsoleAuthEnv,
} from '../../test/operator';

const ORIGINAL_FETCH = global.fetch;

// Every helper authorizes its caller; these tests run as the operator
// unless they say otherwise.
beforeAll(setConsoleAuthEnv);
afterAll(clearConsoleAuthEnv);

function asNextReq(
  url: string,
  init?: { method?: string; body?: string },
): NextRequest {
  const req = new Request(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      authorization: OPERATOR_BASIC,
    },
  });
  return new NextRequest(req);
}

describe('proxyGet', () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it('forwards path and query, preserves upstream status, defaults JSON content-type', async () => {
    const upstream = jest.fn(
      async () =>
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    global.fetch = upstream as unknown as typeof fetch;

    const req = asNextReq(
      'http://localhost:3001/api/cp/registry/agents?status=active',
    );
    const res = await proxyGet('cp', '/api/registry/agents', req);

    expect(upstream).toHaveBeenCalledTimes(1);
    const callTarget = (upstream.mock.calls[0] as unknown as [string])[0];
    expect(callTarget).toBe(
      'http://localhost:4000/api/registry/agents?status=active',
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns a structured 502 with a sanitized error when upstream throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = (async () => {
      throw new TypeError('fetch failed: ECONNREFUSED 127.0.0.1:9999');
    }) as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/health');
    const res = await proxyGet('cp', '/api/health', req);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({
      error: 'Upstream unreachable',
      target: 'http://localhost:4000/api/health',
      upstream_status: 502,
    });
    // Raw error detail must stay server-side (logged) — never in the body.
    expect(String(body.error)).not.toMatch(/ECONNREFUSED/);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('adds Authorization header when a key is configured', async () => {
    process.env.CP_API_KEY = 'super-secret';
    jest.resetModules();
    const proxy = require('./proxy') as typeof import('./proxy');

    const upstream = jest.fn(async () => new Response('{}', { status: 200 }));
    global.fetch = upstream as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/registry/agents');
    await proxy.proxyGet('cp', '/api/registry/agents', req);

    const init = (
      upstream.mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer super-secret');

    delete process.env.CP_API_KEY;
  });
});

describe('proxyPost / proxyPut', () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it('forwards the request body verbatim and sets POST', async () => {
    const upstream = jest.fn(
      async () => new Response('{"run_id":"abc"}', { status: 202 }),
    );
    global.fetch = upstream as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/playground/runs', {
      method: 'POST',
      body: JSON.stringify({ scenario_ref: 'x' }),
    });

    const res = await proxyPost('playground', '/runs', req);
    expect(res.status).toBe(202);

    const init = (
      upstream.mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ scenario_ref: 'x' }));
  });

  it('PUT forwards body and method', async () => {
    const upstream = jest.fn(async () => new Response('{}', { status: 200 }));
    global.fetch = upstream as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/webhooks/abc', {
      method: 'PUT',
      body: JSON.stringify({ active: false }),
    });

    await proxyPut('cp', '/api/webhooks/abc', req);

    const init = (
      upstream.mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ active: false }));
  });
});

describe('proxyDelete', () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it('sends DELETE with no body', async () => {
    const upstream = jest.fn(async () => new Response(null, { status: 204 }));
    global.fetch = upstream as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/webhooks/abc', {
      method: 'DELETE',
    });
    const res = await proxyDelete('cp', '/api/webhooks/abc', req);

    expect(res.status).toBe(204);
    const init = (
      upstream.mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });
});

describe('timeout handling', () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    jest.useRealTimers();
  });

  /** A fetch that never resolves on its own — it only rejects once the
   *  proxy's timeout signal aborts, mimicking a hung upstream. */
  function hangingFetch(): jest.Mock {
    return jest.fn(
      (_target: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(
              new DOMException('This operation was aborted', 'AbortError'),
            ),
          );
        }),
    );
  }

  /** The access check (Web Crypto, settled through the event loop) runs
   *  before the timeout is armed, so advancing fake time first would fire
   *  nothing. Yield real event-loop turns until the fetch has started. */
  async function untilFetchStarts(fetchMock: jest.Mock): Promise<void> {
    for (let i = 0; i < 200 && fetchMock.mock.calls.length === 0; i++)
      await new Promise<void>((r) => setImmediate(r));
    expect(fetchMock).toHaveBeenCalled();
  }

  it('GET returns a 504 envelope when the upstream hangs past the default timeout', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    // Keep real microtasks so NextRequest body/stream plumbing still works.
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
    });
    const fetchMock = hangingFetch();
    global.fetch = fetchMock as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/health');
    const pending = proxyGet('cp', '/api/health', req);
    await untilFetchStarts(fetchMock);
    await jest.advanceTimersByTimeAsync(30_000);
    const res = await pending;

    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({
      error: 'Upstream timeout',
      target: 'http://localhost:4000/api/health',
      upstream_status: 504,
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('POST returns a 504 envelope when the upstream hangs past the default timeout', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
    });
    const fetchMock = hangingFetch();
    global.fetch = fetchMock as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/playground/runs', {
      method: 'POST',
      body: JSON.stringify({ scenario_ref: 'x' }),
    });
    const pending = proxyPost('playground', '/runs', req);
    await untilFetchStarts(fetchMock);
    await jest.advanceTimersByTimeAsync(30_000);
    const res = await pending;

    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({
      error: 'Upstream timeout',
      target: 'http://localhost:8000/runs',
      upstream_status: 504,
    });
    errorSpy.mockRestore();
  });

  it('does not time out a fetch that settles inside the window', async () => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
    });
    global.fetch = (async () =>
      new Response('{"ok":true}', { status: 200 })) as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/health');
    const res = await proxyGet('cp', '/api/health', req);

    expect(res.status).toBe(200);
    // The timeout timer must have been cancelled — nothing left to fire.
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('mutation error mapping', () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it('POST maps a rejected fetch to a 502 envelope', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = (async () => {
      throw new TypeError('fetch failed: ECONNREFUSED 127.0.0.1:9999');
    }) as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/playground/runs', {
      method: 'POST',
      body: JSON.stringify({ scenario_ref: 'x' }),
    });
    const res = await proxyPost('playground', '/runs', req);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({
      error: 'Upstream unreachable',
      target: 'http://localhost:8000/runs',
      upstream_status: 502,
    });
    expect(String(body.error)).not.toMatch(/ECONNREFUSED/);
    errorSpy.mockRestore();
  });

  it('DELETE maps a rejected fetch to a 502 envelope', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = (async () => {
      throw new Error('socket hang up');
    }) as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/webhooks/abc', {
      method: 'DELETE',
    });
    const res = await proxyDelete('cp', '/api/webhooks/abc', req);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: 'Upstream unreachable',
      target: 'http://localhost:4000/api/webhooks/abc',
      upstream_status: 502,
    });
    errorSpy.mockRestore();
  });
});

describe('content-type handling', () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it('GET preserves the upstream Content-Type', async () => {
    global.fetch = (async () =>
      new Response('pong', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })) as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/ping');
    const res = await proxyGet('cp', '/api/ping', req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/plain');
    expect(await res.text()).toBe('pong');
  });

  it('GET falls back to application/json when upstream omits Content-Type', async () => {
    // A null-body Response carries no Content-Type header at all.
    global.fetch = (async () =>
      new Response(null, { status: 200 })) as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/ping');
    const res = await proxyGet('cp', '/api/ping', req);

    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('POST always returns application/json even when upstream says text/plain', async () => {
    global.fetch = (async () =>
      new Response('{"ok":true}', {
        status: 201,
        headers: { 'Content-Type': 'text/plain' },
      })) as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/playground/runs', {
      method: 'POST',
      body: '{}',
    });
    const res = await proxyPost('playground', '/runs', req);

    expect(res.status).toBe(201);
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });
});

describe('emptyBodyStatus handling', () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it.each([205, 304])(
    'upstream %i yields a null-body response without throwing',
    async (status) => {
      global.fetch = (async () =>
        new Response(null, { status })) as unknown as typeof fetch;

      const req = asNextReq('http://localhost:3001/api/cp/resource');
      const res = await proxyGet('cp', '/api/resource', req);

      expect(res.status).toBe(status);
      expect(res.body).toBeNull();
      await expect(res.text()).resolves.toBe('');
    },
  );
});

describe('proxyGetVerified', () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it('splices the verdict onto the exact upstream bytes without reparsing them', async () => {
    // Deliberately odd whitespace/key order -- if the wrapper round-tripped
    // through JSON.parse/JSON.stringify this would come back normalized,
    // which is exactly what "splice, don't reparse" is guarding against.
    const upstreamBody =
      '{"manifest":{"aid":"aid:pubkey:x",   "weird_spacing":true}}';
    global.fetch = (async () =>
      new Response(upstreamBody, { status: 200 })) as unknown as typeof fetch;
    const verify = jest.fn((): Verdict => ({ checked: true, ok: true }));

    const req = asNextReq(
      'http://localhost:3001/api/cp/well-known/aitp-manifest',
    );
    const res = await proxyGetVerified(
      'cp',
      '/.well-known/aitp-manifest',
      req,
      verify,
    );
    const text = await res.text();

    expect(verify).toHaveBeenCalledWith(upstreamBody, expect.any(AbortSignal));
    expect(text).toBe(
      '{"manifest":{"aid":"aid:pubkey:x",   "weird_spacing":true},"_verification":{"checked":true,"ok":true}}',
    );
    expect(JSON.parse(text)).toEqual({
      manifest: { aid: 'aid:pubkey:x', weird_spacing: true },
      _verification: { checked: true, ok: true },
    });
  });

  it('attaches an ok:false verdict with the SDK code, still preserving the body', async () => {
    global.fetch = (async () =>
      new Response('{"manifest":{"aid":"aid:pubkey:x"}}', {
        status: 200,
      })) as unknown as typeof fetch;
    const verify = (): Verdict => ({
      checked: true,
      ok: false,
      code: 'signature_invalid',
    });

    const req = asNextReq(
      'http://localhost:3001/api/cp/well-known/aitp-manifest',
    );
    const res = await proxyGetVerified(
      'cp',
      '/.well-known/aitp-manifest',
      req,
      verify,
    );
    const body = await res.json();

    expect(body.manifest).toEqual({ aid: 'aid:pubkey:x' });
    expect(body._verification).toEqual({
      checked: true,
      ok: false,
      code: 'signature_invalid',
    });
  });

  it('attaches checked:false without calling it a verification failure', async () => {
    global.fetch = (async () =>
      new Response('{"manifest":{}}', {
        status: 200,
      })) as unknown as typeof fetch;
    const verify = (): Verdict => ({
      checked: false,
      reason: 'sdk_unavailable',
    });

    const req = asNextReq(
      'http://localhost:3001/api/cp/well-known/aitp-manifest',
    );
    const res = await proxyGetVerified(
      'cp',
      '/.well-known/aitp-manifest',
      req,
      verify,
    );

    expect((await res.json())._verification).toEqual({
      checked: false,
      reason: 'sdk_unavailable',
    });
  });

  it('wraps rather than drops the verdict when the upstream body is not a JSON object', async () => {
    global.fetch = (async () =>
      new Response('not json at all', {
        status: 200,
      })) as unknown as typeof fetch;
    const verify = (): Verdict => ({
      checked: true,
      ok: false,
      code: 'malformed',
    });

    const req = asNextReq(
      'http://localhost:3001/api/cp/well-known/aitp-manifest',
    );
    const res = await proxyGetVerified(
      'cp',
      '/.well-known/aitp-manifest',
      req,
      verify,
    );
    const body = await res.json();

    expect(body._verification).toEqual({
      checked: true,
      ok: false,
      code: 'malformed',
    });
    expect(body._raw).toBe('not json at all');
  });

  it('does not run verify at all on a non-2xx upstream -- connectivity, not a signature problem', async () => {
    global.fetch = (async () =>
      new Response('{"error":"down"}', {
        status: 503,
      })) as unknown as typeof fetch;
    const verify = jest.fn();

    const req = asNextReq(
      'http://localhost:3001/api/cp/well-known/aitp-manifest',
    );
    const res = await proxyGetVerified(
      'cp',
      '/.well-known/aitp-manifest',
      req,
      verify,
    );

    expect(res.status).toBe(503);
    expect(verify).not.toHaveBeenCalled();
    expect(await res.text()).toBe('{"error":"down"}');
  });

  it('502s with the sanitized envelope when the upstream is unreachable', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = (async () => {
      throw new Error('econnrefused');
    }) as unknown as typeof fetch;

    const req = asNextReq(
      'http://localhost:3001/api/cp/well-known/aitp-manifest',
    );
    const res = await proxyGetVerified(
      'cp',
      '/.well-known/aitp-manifest',
      req,
      jest.fn(),
    );

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: 'Upstream unreachable',
      target: 'http://localhost:4000/.well-known/aitp-manifest',
      upstream_status: 502,
    });
    errorSpy.mockRestore();
  });

  it('awaits an async verify function, sharing the same signal proxyGetVerified used', async () => {
    global.fetch = (async () =>
      new Response('{"manifest":{}}', {
        status: 200,
      })) as unknown as typeof fetch;
    const verify = jest.fn(
      async (_text: string, signal: AbortSignal): Promise<Verdict> => {
        expect(signal).toBeInstanceOf(AbortSignal);
        return { checked: true, ok: true };
      },
    );

    const req = asNextReq(
      'http://localhost:3001/api/cp/well-known/aitp-manifest',
    );
    const res = await proxyGetVerified(
      'cp',
      '/.well-known/aitp-manifest',
      req,
      verify,
    );

    expect(verify).toHaveBeenCalledTimes(1);
    expect((await res.json())._verification).toEqual({
      checked: true,
      ok: true,
    });
  });
});

describe('proxySse', () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it('relays a non-200 upstream as an ordinary response with its own content-type', async () => {
    global.fetch = (async () =>
      new Response('{"error":"down"}', {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/events/stream');
    const res = await proxySse('cp', '/api/events/stream', req);

    expect(res.status).toBe(503);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(await res.text()).toBe('{"error":"down"}');
  });

  it('returns the sanitized 502 envelope when fetch rejects', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = (async () => {
      throw new Error('econnrefused');
    }) as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/events/stream');
    const res = await proxySse('cp', '/api/events/stream', req);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: 'Upstream unreachable',
      target: 'http://localhost:4000/api/events/stream',
      upstream_status: 502,
    });
    errorSpy.mockRestore();
  });

  it('streams the upstream body and rewrites response headers for SSE', async () => {
    const upstream = jest.fn(
      async () =>
        new Response('data: {"hello":1}\n\n', {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    );
    global.fetch = upstream as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/events/stream');
    const res = await proxySse('cp', '/api/events/stream', req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toMatch(/no-cache/);
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');
  });

  it('502s when upstream is unreachable', async () => {
    global.fetch = (async () => {
      throw new Error('econnrefused');
    }) as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/events/stream');
    const res = await proxySse('cp', '/api/events/stream', req);
    expect(res.status).toBe(502);
  });
});

// ---------------------------------------------------------------------------
// Phase 2 (console lockdown): backend credentials, client IP, CP read-key
// fallback, and upstream error metadata.
// ---------------------------------------------------------------------------

type ProxyModule = typeof import('./proxy');

const KEYS = {
  PLAYGROUND_API_KEY: 'pg-key',
  CP_API_KEY: 'cp-admin',
  CP_READ_API_KEY: 'cp-read',
};
const ENV_NAMES = [
  ...Object.keys(KEYS),
  'VERCEL',
  'AITP_CONSOLE_PUBLIC_MODE',
] as const;

/** Load a fresh proxy module under `env` (serverConfig is read at import). */
function loadProxy(
  env: Partial<Record<(typeof ENV_NAMES)[number], string>>,
): ProxyModule {
  for (const n of ENV_NAMES) delete process.env[n];
  Object.assign(process.env, env);
  jest.resetModules();
  const mod = require('./proxy') as ProxyModule;
  mod.resetFallbackLogThrottle();
  return mod;
}

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
}

/** A fetch mock answering each call from `responses` in order (the last
 *  one repeats), recording what was sent. */
function mockFetch(...responses: (() => Response)[]): Seen[] {
  const seen: Seen[] = [];
  global.fetch = (async (url: string, init: RequestInit) => {
    seen.push({
      url,
      method: String(init.method),
      headers: { ...(init.headers as Record<string, string>) },
    });
    return responses[Math.min(seen.length - 1, responses.length - 1)]();
  }) as unknown as typeof fetch;
  return seen;
}

const ok = () => new Response('{}', { status: 200 });
const sse = () =>
  new Response('data: {}\n\n', {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
const status =
  (code: number, body = '{}') =>
  () =>
    new Response(body, {
      status: code,
      headers: { 'Content-Type': 'application/json' },
    });

/** A request as the browser would send it, including headers the console
 *  must never forward. */
function browserReq(
  url: string,
  method = 'GET',
  extra: Record<string, string> = {},
): NextRequest {
  return new NextRequest(
    new Request(url, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-real-ip': '203.0.113.7',
        // The operator's own credentials: valid here, never forwarded.
        authorization: OPERATOR_BASIC,
        'x-api-key': 'browser-supplied',
        'x-aitp-client-ip': '6.6.6.6',
        cookie: 'aitp_console_session=abc',
        ...extra,
      },
      body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
    }),
  );
}

const lower = (h: Record<string, string>) =>
  Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));

const allowed = (pairs: [string, string][]) => new Set(pairs.map(([k]) => k));
const UPSTREAM_HEADERS = allowed([
  ['content-type', ''],
  ['accept', ''],
  ['x-api-key', ''],
  ['authorization', ''],
  ['x-aitp-client-ip', ''],
]);

describe('upstream headers: playground', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    global.fetch = ORIGINAL_FETCH;
    for (const n of ENV_NAMES) delete process.env[n];
  });

  const calls: [
    string,
    (p: ProxyModule, r: NextRequest) => Promise<Response>,
    string,
  ][] = [
    ['proxyGet', (p, r) => p.proxyGet('playground', '/runs', r), 'GET'],
    [
      'proxyGetVerified',
      (p, r) =>
        p.proxyGetVerified(
          'playground',
          '/runs',
          r,
          () =>
            ({
              checked: false,
              reason: 'test',
            }) as unknown as Verdict,
        ),
      'GET',
    ],
    ['proxyPost', (p, r) => p.proxyPost('playground', '/runs', r), 'POST'],
    ['proxyPut', (p, r) => p.proxyPut('playground', '/runs', r), 'PUT'],
    ['proxyPatch', (p, r) => p.proxyPatch('playground', '/runs', r), 'PATCH'],
    [
      'proxyDelete',
      (p, r) => p.proxyDelete('playground', '/hosted-agents/h1', r),
      'DELETE',
    ],
    [
      'proxySse',
      (p, r) => p.proxySse('playground', '/runs/r1/events', r),
      'GET',
    ],
  ];

  it.each(calls)(
    '%s sends x-api-key and the client IP, never Bearer or browser headers',
    async (_n, call, method) => {
      const p = loadProxy({ ...KEYS, VERCEL: '1' });
      const seen = mockFetch(_n === 'proxySse' ? sse : ok);
      await call(
        p,
        browserReq('http://localhost:3001/api/playground/x', method),
      );
      expect(seen).toHaveLength(1);
      const h = lower(seen[0].headers);
      expect(h['x-api-key']).toBe('pg-key');
      expect(h.authorization).toBeUndefined();
      expect(h['x-aitp-client-ip']).toBe('203.0.113.7');
      expect(h.cookie).toBeUndefined();
      for (const k of Object.keys(h)) expect(UPSTREAM_HEADERS).toContain(k);
    },
  );

  it.each(calls)(
    '%s omits X-AITP-Client-IP when the IP is unknown',
    async (_n, call, method) => {
      // Off Vercel and no CONSOLE_CLIENT_IP_HEADER: the browser's own
      // x-aitp-client-ip / x-real-ip are not trusted, so nothing is sent.
      const p = loadProxy({ ...KEYS });
      const seen = mockFetch(_n === 'proxySse' ? sse : ok);
      await call(
        p,
        browserReq('http://localhost:3001/api/playground/x', method),
      );
      const h = lower(seen[0].headers);
      expect(h['x-aitp-client-ip']).toBeUndefined();
      expect(h['x-api-key']).toBe('pg-key');
    },
  );

  it('sends no x-api-key when PLAYGROUND_API_KEY is unset', async () => {
    const p = loadProxy({ VERCEL: '1' });
    const seen = mockFetch(ok);
    await p.proxyGet(
      'playground',
      '/runs',
      browserReq('http://localhost:3001/api/playground/runs'),
    );
    const h = lower(seen[0].headers);
    expect(h['x-api-key']).toBeUndefined();
    expect(h.authorization).toBeUndefined();
  });
});

describe('upstream headers: control plane key choice', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    global.fetch = ORIGINAL_FETCH;
    for (const n of ENV_NAMES) delete process.env[n];
  });

  const req = (path = '/x', method = 'GET') =>
    browserReq(`http://localhost:3001/api/cp${path}`, method);
  const auth = (s: Seen) => lower(s.headers).authorization;

  it('read-class routes carry the read key, with the client IP', async () => {
    const p = loadProxy({ ...KEYS, VERCEL: '1' });
    const seen = mockFetch(ok);
    await p.proxyGet('cp', '/api/registry/agents', req());
    expect(auth(seen[0])).toBe('Bearer cp-read');
    expect(lower(seen[0].headers)['x-aitp-client-ip']).toBe('203.0.113.7');
    expect(lower(seen[0].headers)['x-api-key']).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/api/audit'],
    ['GET', '/api/webhooks'],
    ['GET', '/api/metrics'],
    ['POST', '/api/registry/enroll'],
    ['DELETE', '/api/pinned-keys'],
    ['GET', '/api/not-in-the-allowlist'],
  ])('admin-class %s %s always carries the admin key', async (method, path) => {
    const p = loadProxy({ ...KEYS });
    const seen = mockFetch(ok);
    const r = req(path, method);
    if (method === 'GET') await p.proxyGet('cp', path, r);
    else if (method === 'POST') await p.proxyPost('cp', path, r);
    else await p.proxyDelete('cp', path, r);
    expect(auth(seen[0])).toBe('Bearer cp-admin');
  });

  it.each(['/api/health', '/api/readyz'])(
    'keyless %s sends no Authorization',
    async (path) => {
      const p = loadProxy({ ...KEYS });
      const seen = mockFetch(ok);
      await p.proxyGet('cp', path, req());
      expect(auth(seen[0])).toBeUndefined();
    },
  );

  it('the verified manifest route is keyless too', async () => {
    const p = loadProxy({ ...KEYS });
    const seen = mockFetch(ok);
    await p.proxyGetVerified(
      'cp',
      '/.well-known/aitp-manifest',
      req(),
      () =>
        ({
          checked: false,
          reason: 'test',
        }) as unknown as Verdict,
    );
    expect(auth(seen[0])).toBeUndefined();
  });

  it('read key unset: admin is used and the fallback is logged once per reason', async () => {
    const p = loadProxy({
      PLAYGROUND_API_KEY: 'pg-key',
      CP_API_KEY: 'cp-admin',
    });
    const seen = mockFetch(ok);
    await p.proxyGet('cp', '/api/registry/agents', req());
    await p.proxyGet('cp', '/api/sessions', req());
    expect(seen.map(auth)).toEqual(['Bearer cp-admin', 'Bearer cp-admin']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('read_key_unset');
    expect(String(warn.mock.calls[0][0])).not.toContain('cp-admin');
  });

  it('a 401 to the read key gets exactly one admin retry', async () => {
    const p = loadProxy({ ...KEYS });
    const seen = mockFetch(status(401, '{"code":"INVALID_API_KEY"}'), ok);
    const res = await p.proxyGet('cp', '/api/registry/agents', req());
    expect(res.status).toBe(200);
    expect(seen.map(auth)).toEqual(['Bearer cp-read', 'Bearer cp-admin']);
    expect(String(warn.mock.calls[0][0])).toContain('read_key_rejected_401');
  });

  it('a 401 on the admin retry is relayed, not retried again', async () => {
    const p = loadProxy({ ...KEYS });
    const seen = mockFetch(status(401));
    const res = await p.proxyGet('cp', '/api/registry/agents', req());
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(2);
  });

  it('a 403 READ_ONLY_KEY gets one admin retry for an operator', async () => {
    const p = loadProxy({ ...KEYS });
    const seen = mockFetch(
      status(403, '{"code":"READ_ONLY_KEY","error":"x"}'),
      ok,
    );
    const res = await p.proxyGet('cp', '/api/registry/agents', req());
    expect(res.status).toBe(200);
    expect(seen.map(auth)).toEqual(['Bearer cp-read', 'Bearer cp-admin']);
    expect(String(warn.mock.calls[0][0])).toContain('read_only_key_403');
  });

  it.each([
    ['another code', '{"code":"FORBIDDEN"}'],
    ['a non-JSON body', 'forbidden'],
    ['a JSON non-object', '"READ_ONLY_KEY"'],
  ])('a 403 with %s is relayed with no retry', async (_d, body) => {
    const p = loadProxy({ ...KEYS });
    const seen = mockFetch(status(403, body));
    const res = await p.proxyGet('cp', '/api/registry/agents', req());
    expect(res.status).toBe(403);
    expect(await res.text()).toBe(body);
    expect(seen).toHaveLength(1);
  });

  it('public mode on: operators use admin on read-class routes', async () => {
    const p = loadProxy({ ...KEYS, AITP_CONSOLE_PUBLIC_MODE: 'on' });
    const seen = mockFetch(ok);
    await p.proxyGet('cp', '/api/registry/agents', req());
    expect(auth(seen[0])).toBe('Bearer cp-admin');
  });

  it('SSE: a 401 to the read key retries with admin before streaming', async () => {
    const p = loadProxy({ ...KEYS });
    const seen = mockFetch(status(401), sse);
    const res = await p.proxySse(
      'cp',
      '/api/events/stream',
      req('/events/stream'),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(seen.map(auth)).toEqual(['Bearer cp-read', 'Bearer cp-admin']);
    expect(lower(seen[1].headers).accept).toBe('text/event-stream');
  });
});

describe('upstreamFetch: anonymous callers never get the admin key', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    global.fetch = ORIGINAL_FETCH;
    for (const n of ENV_NAMES) delete process.env[n];
  });

  const anon = (p: ProxyModule, path: string, method: 'GET' | 'POST' = 'GET') =>
    p.__testing.upstreamFetch(
      'cp',
      method,
      `http://localhost:4000${path}`,
      browserReq('http://localhost:3001/x'),
      {
        signal: new AbortController().signal,
        operator: false,
      },
    );
  const auths = (seen: Seen[]) =>
    seen.map((s) => lower(s.headers).authorization);

  it('read key unset → 503 cp_read_key_unavailable, nothing fetched', async () => {
    const p = loadProxy({ CP_API_KEY: 'cp-admin' });
    const seen = mockFetch(ok);
    const res = await anon(p, '/api/registry/agents');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'cp_read_key_unavailable' });
    expect(seen).toHaveLength(0);
  });

  it('a 401 to the read key → 503, and admin is never sent', async () => {
    const p = loadProxy({ ...KEYS });
    const seen = mockFetch(status(401));
    const res = await anon(p, '/api/registry/agents');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'cp_read_key_unavailable' });
    expect(auths(seen)).toEqual(['Bearer cp-read']);
  });

  it('a 403 READ_ONLY_KEY is relayed, not retried', async () => {
    const p = loadProxy({ ...KEYS });
    const seen = mockFetch(status(403, '{"code":"READ_ONLY_KEY"}'));
    const res = await anon(p, '/api/registry/agents');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: 'READ_ONLY_KEY' });
    expect(auths(seen)).toEqual(['Bearer cp-read']);
  });

  it('an admin-class route is refused before any fetch', async () => {
    const p = loadProxy({ ...KEYS });
    const seen = mockFetch(ok);
    const res = await anon(p, '/api/audit');
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      code: 'CONSOLE_OPERATOR_SESSION_REQUIRED',
    });
    expect(seen).toHaveLength(0);
  });

  it('keyless routes still work anonymously, with no key', async () => {
    const p = loadProxy({ ...KEYS });
    const seen = mockFetch(ok);
    expect((await anon(p, '/api/health')).status).toBe(200);
    expect(auths(seen)).toEqual([undefined]);
  });
});

describe('upstream error metadata is relayed', () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    for (const n of ENV_NAMES) delete process.env[n];
  });

  const limited = () =>
    new Response('{"detail":"hourly run limit reached for this service"}', {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '300' },
    });

  it.each([
    [
      'proxyGet',
      (p: ProxyModule, r: NextRequest) => p.proxyGet('playground', '/runs', r),
      'GET',
    ],
    [
      'proxyPost',
      (p: ProxyModule, r: NextRequest) => p.proxyPost('playground', '/runs', r),
      'POST',
    ],
    [
      'proxySse',
      (p: ProxyModule, r: NextRequest) =>
        p.proxySse('playground', '/runs/r1/events', r),
      'GET',
    ],
    [
      'proxyGetVerified',
      (p: ProxyModule, r: NextRequest) =>
        p.proxyGetVerified('playground', '/runs', r, () => {
          throw new Error('verify must not run on a non-2xx');
        }),
      'GET',
    ],
  ])(
    '%s relays a 429 with its Retry-After and JSON body',
    async (_n, call, method) => {
      const p = loadProxy({ ...KEYS });
      mockFetch(limited);
      const res = await call(
        p,
        browserReq('http://localhost:3001/api/playground/runs', method),
      );
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('300');
      expect(res.headers.get('Content-Type')).toBe('application/json');
      expect(await res.json()).toEqual({
        detail: 'hourly run limit reached for this service',
      });
    },
  );

  it('a 2xx response carries no Retry-After even when upstream sent one', async () => {
    const p = loadProxy({ ...KEYS });
    mockFetch(
      () =>
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '5' },
        }),
    );
    const res = await p.proxyGet(
      'playground',
      '/runs',
      browserReq('http://localhost:3001/x'),
    );
    expect(res.headers.get('Retry-After')).toBeNull();
  });
});

describe('upstream fetch hygiene', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    jest.restoreAllMocks();
    global.fetch = ORIGINAL_FETCH;
    for (const n of ENV_NAMES) delete process.env[n];
  });

  const req = () => browserReq('http://localhost:3001/api/cp/x');

  it('never follows redirects (x-api-key would survive a cross-origin hop)', async () => {
    const p = loadProxy({ ...KEYS });
    const inits: RequestInit[] = [];
    global.fetch = (async (_u: string, init: RequestInit) => {
      inits.push(init);
      return new Response(null, {
        status: 307,
        headers: { Location: 'http://elsewhere.example/runs' },
      });
    }) as unknown as typeof fetch;
    const res = await p.proxyGet('playground', '/runs', req());
    expect(inits[0].redirect).toBe('manual');
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toBeNull();
  });

  it('cancels the 401 body before the admin retry', async () => {
    const p = loadProxy({ ...KEYS });
    let cancelled = false;
    const rejected = () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        { status: 401 },
      );
    mockFetch(rejected, ok);
    const res = await p.proxyGet('cp', '/api/registry/agents', req());
    expect(res.status).toBe(200);
    expect(cancelled).toBe(true);
  });

  it('the fallback log re-arms after 10 minutes', async () => {
    const p = loadProxy({
      PLAYGROUND_API_KEY: 'pg-key',
      CP_API_KEY: 'cp-admin',
    });
    mockFetch(ok);
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await p.proxyGet('cp', '/api/registry/agents', req());
    now.mockReturnValue(1_000_000 + 10 * 60_000 - 1);
    await p.proxyGet('cp', '/api/registry/agents', req());
    expect(warn).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1_000_000 + 10 * 60_000);
    await p.proxyGet('cp', '/api/registry/agents', req());
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('a relayed 403 carries only Content-Type and Retry-After', async () => {
    const p = loadProxy({ ...KEYS });
    mockFetch(
      () =>
        new Response('{"code":"FORBIDDEN"}', {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': 'upstream=1',
            'X-Upstream-Secret': 'x',
          },
        }),
    );
    const res = await p.__testing.upstreamFetch(
      'cp',
      'GET',
      'http://localhost:4000/api/registry/agents',
      req(),
      { signal: new AbortController().signal, operator: true },
    );
    expect(res.status).toBe(403);
    expect(res.headers.get('Set-Cookie')).toBeNull();
    expect(res.headers.get('X-Upstream-Secret')).toBeNull();
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });
});

describe('public mode: the helpers enforce access before any upstream call', () => {
  type Limits = typeof import('../server/limits');
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    global.fetch = ORIGINAL_FETCH;
    for (const n of ENV_NAMES) delete process.env[n];
  });

  /** Fresh proxy + limits modules (one registry), so buckets start empty. */
  function load(env: Partial<Record<(typeof ENV_NAMES)[number], string>>) {
    const p = loadProxy({ VERCEL: '1', ...env });
    const limits = require('../server/limits') as Limits;
    return { p, limits };
  }
  const ON = { ...KEYS, AITP_CONSOLE_PUBLIC_MODE: 'on' };

  function anonReq(
    url: string,
    method = 'GET',
    init: { signal?: AbortSignal; ip?: string } = {},
  ): NextRequest {
    return new NextRequest(
      new Request(url, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-real-ip': init.ip ?? '203.0.113.7',
        },
        body: method === 'GET' ? undefined : '{"scenario_ref":"x"}',
        signal: init.signal,
      }),
    );
  }

  it('anonymous admin route → 403 CONSOLE_OPERATOR_SESSION_REQUIRED, nothing fetched', async () => {
    const { p } = load(ON);
    const seen = mockFetch(ok);
    const res = await p.proxyGet(
      'cp',
      '/api/audit',
      anonReq('http://localhost:3001/api/cp/audit'),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      code: 'CONSOLE_OPERATOR_SESSION_REQUIRED',
    });
    expect(seen).toHaveLength(0);
  });

  it('anonymous admin mutation is refused before its body is read', async () => {
    const { p } = load(ON);
    const seen = mockFetch(ok);
    const r = anonReq('http://localhost:3001/api/cp/webhooks', 'POST');
    const res = await p.proxyPost('cp', '/api/webhooks', r);
    expect(res.status).toBe(403);
    expect(r.bodyUsed).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it('the operator reaches an admin route with the admin key', async () => {
    const { p } = load(ON);
    const seen = mockFetch(ok);
    const res = await p.proxyGet(
      'cp',
      '/api/audit',
      browserReq('http://localhost:3001/api/cp/audit'),
    );
    expect(res.status).toBe(200);
    expect(lower(seen[0].headers).authorization).toBe('Bearer cp-admin');
  });

  it('anonymous public playground read passes with the backend key and client IP', async () => {
    const { p } = load(ON);
    const seen = mockFetch(ok);
    const res = await p.proxyGet(
      'playground',
      '/agents',
      anonReq('http://localhost:3001/api/playground/agents'),
    );
    expect(res.status).toBe(200);
    expect(lower(seen[0].headers)).toMatchObject({
      'x-api-key': 'pg-key',
      'x-aitp-client-ip': '203.0.113.7',
    });
  });

  it('anonymous CP read uses the read key, never the admin key', async () => {
    const { p } = load(ON);
    const seen = mockFetch(ok);
    await p.proxyGet(
      'cp',
      '/api/registry/agents',
      anonReq('http://localhost:3001/api/cp/registry/agents'),
    );
    expect(lower(seen[0].headers).authorization).toBe('Bearer cp-read');
  });

  it('anonymous CP read with CP_READ_API_KEY unset → 503 cp_read_key_unavailable; the admin key is never sent', async () => {
    const { p } = load({
      PLAYGROUND_API_KEY: 'pg-key',
      CP_API_KEY: 'cp-admin',
      AITP_CONSOLE_PUBLIC_MODE: 'on',
    });
    const seen = mockFetch(ok);
    const res = await p.proxyGet(
      'cp',
      '/api/registry/agents',
      anonReq('http://localhost:3001/api/cp/registry/agents'),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'cp_read_key_unavailable' });
    expect(seen).toHaveLength(0);
  });

  it('the 6th anonymous launch → 429 with Retry-After, unfetched and with its body unread', async () => {
    const { p } = load(ON);
    const seen = mockFetch(ok);
    for (let i = 0; i < 5; i++) {
      const res = await p.proxyPost(
        'playground',
        '/runs',
        anonReq('http://localhost:3001/api/playground/runs', 'POST'),
      );
      expect(res.status).toBe(200);
    }
    const r = anonReq('http://localhost:3001/api/playground/runs', 'POST');
    const res = await p.proxyPost('playground', '/runs', r);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await res.json()).toMatchObject({
      code: 'CONSOLE_RATE_LIMITED',
      limit: 5,
    });
    expect(r.bodyUsed).toBe(false);
    expect(seen).toHaveLength(5);
  });

  it('the 301st read in a minute → 429', async () => {
    const { p } = load(ON);
    mockFetch(ok);
    const get = () =>
      p.proxyGet(
        'playground',
        '/agents',
        anonReq('http://localhost:3001/api/playground/agents'),
      );
    for (let i = 0; i < 300; i++) expect((await get()).status).toBe(200);
    expect((await get()).status).toBe(429);
  });

  describe('stream slots', () => {
    const open = (p: ProxyModule, init?: { signal?: AbortSignal }) =>
      p.proxySse(
        'playground',
        '/runs/r1/events',
        anonReq(
          'http://localhost:3001/api/playground/runs/r1/events',
          'GET',
          init,
        ),
      );

    /** An upstream event stream that stays open until cancelled. */
    const endless = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('data: {}\n\n'));
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );

    it('the 5th concurrent stream per IP → 429 without a fetch; closing one frees its slot', async () => {
      const { p, limits } = load(ON);
      const seen = mockFetch(endless);
      const streams: Response[] = [];
      for (let i = 0; i < 4; i++) streams.push(await open(p));
      expect(streams.map((s) => s.status)).toEqual([200, 200, 200, 200]);
      expect(limits.streamGate.open('203.0.113.7')).toBe(4);

      const fifth = await open(p);
      expect(fifth.status).toBe(429);
      expect(await fifth.json()).toMatchObject({ limit: 4 });
      expect(seen).toHaveLength(4);

      await streams[0].body!.cancel();
      expect(limits.streamGate.open('203.0.113.7')).toBe(3);
      expect((await open(p)).status).toBe(200);
    });

    it('a stream that ends releases its slot', async () => {
      const { p, limits } = load(ON);
      mockFetch(sse);
      const res = await open(p);
      expect(limits.streamGate.open()).toBe(1);
      await res.text();
      expect(limits.streamGate.open()).toBe(0);
    });

    it('a request abort releases its slot', async () => {
      const { p, limits } = load(ON);
      mockFetch(endless);
      const ac = new AbortController();
      await open(p, { signal: ac.signal });
      expect(limits.streamGate.open()).toBe(1);
      ac.abort();
      expect(limits.streamGate.open()).toBe(0);
    });

    it('a non-2xx upstream (e.g. the capacity probe at cap) releases its slot', async () => {
      const { p, limits } = load(ON);
      mockFetch(status(503));
      const res = await open(p);
      expect(res.status).toBe(503);
      expect(limits.streamGate.open()).toBe(0);
    });

    it('a fetch error releases its slot', async () => {
      const { p, limits } = load(ON);
      const err = jest.spyOn(console, 'error').mockImplementation(() => {});
      global.fetch = (async () => {
        throw new Error('econnrefused');
      }) as unknown as typeof fetch;
      expect((await open(p)).status).toBe(502);
      expect(limits.streamGate.open()).toBe(0);
      err.mockRestore();
    });

    it('an upstream error partway through the stream releases its slot', async () => {
      const { p, limits } = load(ON);
      let sent = false;
      mockFetch(
        () =>
          new Response(
            new ReadableStream<Uint8Array>({
              pull(c) {
                if (!sent) {
                  sent = true;
                  c.enqueue(new TextEncoder().encode('data: {}\n\n'));
                } else c.error(new Error('upstream reset'));
              },
            }),
            { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
          ),
      );
      const res = await open(p);
      expect(limits.streamGate.open()).toBe(1);
      await expect(res.text()).rejects.toThrow();
      expect(limits.streamGate.open()).toBe(0);
    });

    it('a refused CP stream (no read key) takes no slot', async () => {
      const { p, limits } = load({
        PLAYGROUND_API_KEY: 'pg-key',
        CP_API_KEY: 'cp-admin',
        AITP_CONSOLE_PUBLIC_MODE: 'on',
      });
      const seen = mockFetch(sse);
      const res = await p.proxySse(
        'cp',
        '/api/events/stream',
        anonReq('http://localhost:3001/api/cp/events/stream'),
      );
      expect(res.status).toBe(503);
      expect(seen).toHaveLength(0);
      expect(limits.streamGate.open()).toBe(0);
    });
  });

  it('proxyGetVerified refuses an anonymous admin-class GET before fetching or verifying', async () => {
    const { p } = load(ON);
    const seen = mockFetch(ok);
    const verify = jest.fn();
    const res = await p.proxyGetVerified(
      'cp',
      '/api/audit',
      anonReq('http://localhost:3001/api/cp/audit'),
      verify,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      code: 'CONSOLE_OPERATOR_SESSION_REQUIRED',
    });
    expect(seen).toHaveLength(0);
    expect(verify).not.toHaveBeenCalled();
  });

  it.each([
    ['proxyPut', 'PUT', '/api/webhooks/w1'],
    ['proxyPatch', 'PATCH', '/api/webhooks/w1'],
    ['proxyDelete', 'DELETE', '/api/webhooks/w1'],
  ] as const)(
    '%s: an anonymous admin call → 403 with nothing fetched',
    async (helper, method, path) => {
      const { p } = load(ON);
      const seen = mockFetch(ok);
      const r = anonReq(`http://localhost:3001/api/cp${path}`, method);
      const res = await p[helper]('cp', path, r);
      expect(res.status).toBe(403);
      expect(seen).toHaveLength(0);
      expect(r.bodyUsed).toBe(false);
    },
  );

  it('flag off: the public limiter and stream gate are never touched', async () => {
    const { p, limits } = load(KEYS);
    const consume = jest.spyOn(limits.publicLimiter, 'consume');
    const acquire = jest.spyOn(limits.streamGate, 'acquire');
    mockFetch(sse);
    const op = (u: string, m = 'GET') =>
      browserReq(`http://localhost:3001${u}`, m);
    await p.proxyGet('playground', '/agents', op('/api/playground/agents'));
    await p.proxyPost(
      'playground',
      '/runs',
      op('/api/playground/runs', 'POST'),
    );
    await (await p.proxySse('playground', '/runs/r1/events', op('/x'))).text();
    expect(consume).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
    // And anonymous is a 401 there, unfetched.
    const seen = mockFetch(ok);
    const res = await p.proxyGet(
      'playground',
      '/agents',
      anonReq('http://localhost:3001/api/playground/agents'),
    );
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });
});
