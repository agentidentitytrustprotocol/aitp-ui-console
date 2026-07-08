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
            reject(new DOMException('This operation was aborted', 'AbortError')),
          );
        }),
    );
  }

  it('GET returns a 504 envelope when the upstream hangs past the default timeout', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    // Keep real microtasks so NextRequest body/stream plumbing still works.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    global.fetch = hangingFetch() as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/health');
    const pending = proxyGet('cp', '/api/health', req);
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
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    global.fetch = hangingFetch() as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/playground/runs', {
      method: 'POST',
      body: JSON.stringify({ scenario_ref: 'x' }),
    });
    const pending = proxyPost('playground', '/runs', req);
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
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    global.fetch = (async () => new Response('{"ok":true}', { status: 200 })) as unknown as typeof fetch;

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

    const req = asNextReq('http://localhost:3001/api/cp/webhooks/abc', { method: 'DELETE' });
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
      new Response('pong', { status: 200, headers: { 'Content-Type': 'text/plain' } })) as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/ping');
    const res = await proxyGet('cp', '/api/ping', req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/plain');
    expect(await res.text()).toBe('pong');
  });

  it('GET falls back to application/json when upstream omits Content-Type', async () => {
    // A null-body Response carries no Content-Type header at all.
    global.fetch = (async () => new Response(null, { status: 200 })) as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/ping');
    const res = await proxyGet('cp', '/api/ping', req);

    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('POST always returns application/json even when upstream says text/plain', async () => {
    global.fetch = (async () =>
      new Response('{"ok":true}', { status: 201, headers: { 'Content-Type': 'text/plain' } })) as unknown as typeof fetch;

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

  it.each([205, 304])('upstream %i yields a null-body response without throwing', async (status) => {
    global.fetch = (async () => new Response(null, { status })) as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/resource');
    const res = await proxyGet('cp', '/api/resource', req);

    expect(res.status).toBe(status);
    expect(res.body).toBeNull();
    await expect(res.text()).resolves.toBe('');
  });
});

describe('proxySse', () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it('passes a non-200 upstream status through but still rewrites headers for SSE', async () => {
    global.fetch = (async () =>
      new Response('{"error":"down"}', {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;

    const req = asNextReq('http://localhost:3001/api/cp/events/stream');
    const res = await proxySse('cp', '/api/events/stream', req);

    expect(res.status).toBe(503);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toMatch(/no-cache/);
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
