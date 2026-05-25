/**
 * @jest-environment node
 *
 * Proxy helpers are imported by Next route handlers and use NextRequest, which
 * relies on the global Request constructor. Node's built-in fetch types ship
 * Request natively, so the `node` environment is the right host here.
 */
import { NextRequest } from 'next/server';
import { proxyDelete, proxyGet, proxyPost, proxyPut, proxySse } from './proxy';

const ORIGINAL_FETCH = global.fetch;

function asNextReq(url: string, init?: { method?: string; body?: string }): NextRequest {
  const req = new Request(url, { ...init, headers: { 'Content-Type': 'application/json' } });
  return new NextRequest(req);
}

describe('proxyGet', () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it('forwards path and query, preserves upstream status, defaults JSON content-type', async () => {
    const upstream = jest.fn(async () =>
      new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    global.fetch = upstream as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/registry/agents?status=active');
    const res = await proxyGet('cp', '/api/registry/agents', req);

    expect(upstream).toHaveBeenCalledTimes(1);
    const callTarget = (upstream.mock.calls[0] as unknown as [string])[0];
    expect(callTarget).toBe('http://localhost:4000/api/registry/agents?status=active');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns a structured 502 when upstream throws', async () => {
    global.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/health');
    const res = await proxyGet('cp', '/api/health', req);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.upstream_status).toBe(502);
    expect(body.target).toContain('http://localhost:4000/api/health');
    expect(String(body.error)).toMatch(/fetch failed/);
  });

  it('adds Authorization header when a key is configured', async () => {
    process.env.CP_API_KEY = 'super-secret';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const proxy = require('./proxy') as typeof import('./proxy');

    const upstream = jest.fn(async () => new Response('{}', { status: 200 }));
    global.fetch = upstream as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/registry/agents');
    await proxy.proxyGet('cp', '/api/registry/agents', req);

    const init = (upstream.mock.calls[0] as unknown as [string, RequestInit])[1];
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
    const upstream = jest.fn(async () =>
      new Response('{"run_id":"abc"}', { status: 202 }),
    );
    global.fetch = upstream as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/playground/runs', {
      method: 'POST',
      body: JSON.stringify({ scenario_ref: 'x' }),
    });

    const res = await proxyPost('playground', '/runs', req);
    expect(res.status).toBe(202);

    const init = (upstream.mock.calls[0] as unknown as [string, RequestInit])[1];
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

    const init = (upstream.mock.calls[0] as unknown as [string, RequestInit])[1];
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

    const req = asNextReq('http://localhost:3001/api/cp/webhooks/abc', { method: 'DELETE' });
    const res = await proxyDelete('cp', '/api/webhooks/abc', req);

    expect(res.status).toBe(204);
    const init = (upstream.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });
});

describe('proxySse', () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
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
