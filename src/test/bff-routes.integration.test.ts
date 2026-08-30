/**
 * Self-contained integration tests for the BFF proxy routes.
 *
 * Unlike proxies.integration.test.ts (which needs the real playground/CP
 * running and is gated behind RUN_INTEGRATION=1), this suite spins up an
 * in-process mock upstream and calls the actual Next.js route handlers
 * directly, so it runs everywhere — including CI — with no services.
 *
 * It covers the routing contract end-to-end: path mapping, query and body
 * passthrough, auth-header injection, catch-all segment encoding, status
 * and content-type passthrough, empty-body statuses, SSE streaming, and
 * the synthesized 502 envelope when an upstream is unreachable.
 *
 * NOTE: serverConfig reads PLAYGROUND_URL / CP_URL at module load, so env
 * is set in beforeAll *before* the route modules are required. Keep all
 * `@/` requires lazy.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NextRequest } from 'next/server';

interface RecordedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

type RouteModule = {
  GET?: (req: NextRequest, ctx?: unknown) => Promise<Response>;
  POST?: (req: NextRequest, ctx?: unknown) => Promise<Response>;
  DELETE?: (req: NextRequest, ctx?: unknown) => Promise<Response>;
};

const recorded: RecordedRequest[] = [];
let server: http.Server;
let base: string;

// Mutable per-test fixtures for the two verified `.well-known` CP routes
// (aitp-manifest, aitp-revocation-list) — unlike the other mock-upstream
// branches below (which return a fixed shape per path), these two need a
// distinct signed body per test case, so each test sets these before
// calling the route.
let manifestUpstreamText = '';
let manifestUpstreamStatus = 200;
let revocationUpstreamText = '';
let revocationUpstreamStatus = 200;

/** The last request the mock upstream saw. */
function lastRequest(): RecordedRequest {
  if (recorded.length === 0) throw new Error('mock upstream saw no requests');
  return recorded[recorded.length - 1];
}

function makeRequest(url: string, init?: RequestInit): NextRequest {
  // Required lazily so env set in beforeAll wins.
  const { NextRequest } = require('next/server');
  return new NextRequest(url, init);
}

function params<T>(value: T): { params: Promise<T> } {
  return { params: Promise.resolve(value) };
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      recorded.push({
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body,
      });

      const url = req.url ?? '';

      if (url.startsWith('/api/health')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else if (url.startsWith('/api/events/history')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ events: [], echoedUrl: url }));
      } else if (url.startsWith('/scenarios/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ upstreamPath: url }));
      } else if (url === '/runs' && req.method === 'POST') {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'run-1', received: JSON.parse(body || '{}') }));
      } else if (/^\/runs\/[^/]+\/narrate$/.test(url)) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Agent A greeted Agent B.');
      } else if (url === '/hosted-agents' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ hosted_id: 'h1', received: JSON.parse(body || '{}') }));
      } else if (url === '/hosted-agents' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ hosted: [{ hosted_id: 'h1' }] }));
      } else if (/^\/hosted-agents\/[^/]+\/resolve-and-handshake$/.test(url)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ trust: 'established', received: JSON.parse(body || '{}') }));
      } else if (/^\/hosted-agents\/[^/]+\/invoke$/.test(url)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result: JSON.parse(body || '{}') }));
      } else if (/^\/hosted-agents\/[^/]+$/.test(url) && req.method === 'DELETE') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ stopped: url.split('/').pop() }));
      } else if (url.startsWith('/api/registry/agents/') && req.method === 'DELETE') {
        res.writeHead(204);
        res.end();
      } else if (url.startsWith('/.well-known/aitp-manifest')) {
        res.writeHead(manifestUpstreamStatus, { 'Content-Type': 'application/json' });
        res.end(manifestUpstreamText);
      } else if (url.startsWith('/.well-known/aitp-revocation-list')) {
        res.writeHead(revocationUpstreamStatus, { 'Content-Type': 'application/json' });
        res.end(revocationUpstreamText);
      } else if (url.startsWith('/api/events/stream')) {
        if (url.includes('full=1')) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'at capacity' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: {"type":"registry.registered","seq":1}\n\n');
        res.write('data: {"type":"handshake.complete","seq":2}\n\n');
        res.end();
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unknown mock path', url }));
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;

  process.env.CP_URL = base;
  process.env.PLAYGROUND_URL = base;
  process.env.CP_API_KEY = 'test-cp-key';
  process.env.PLAYGROUND_API_KEY = '';
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  recorded.length = 0;
});

describe('BFF route handlers against a mock upstream', () => {
  it('GET /api/cp/health maps to /api/health and injects the CP bearer key', async () => {
    const route: RouteModule = require('@/app/api/cp/health/route');
    const res = await route.GET!(makeRequest('http://localhost:3001/api/cp/health'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok' });

    const seen = lastRequest();
    expect(seen.url).toBe('/api/health');
    expect(seen.headers.authorization).toBe('Bearer test-cp-key');
  });

  it('forwards the query string untouched', async () => {
    const route: RouteModule = require('@/app/api/cp/events/history/route');
    const res = await route.GET!(
      makeRequest('http://localhost:3001/api/cp/events/history?limit=5&type=handshake.complete'),
    );

    expect(res.status).toBe(200);
    expect(lastRequest().url).toBe('/api/events/history?limit=5&type=handshake.complete');
  });

  it('encodes catch-all scenario segments individually, keeping slashes', async () => {
    const route: RouteModule = require('@/app/api/playground/scenarios/[...ref]/route');
    const res = await route.GET!(
      makeRequest('http://localhost:3001/api/playground/scenarios/intra-org/research@1.0.0'),
      params({ ref: ['intra-org', 'research@1.0.0'] }),
    );

    expect(res.status).toBe(200);
    // Each segment is encodeURIComponent-ed; the joining slash is not.
    expect(lastRequest().url).toBe('/scenarios/intra-org/research%401.0.0');
    // The playground has no API key configured, so no auth header leaks.
    expect(lastRequest().headers.authorization).toBeUndefined();
  });

  it('POST /api/playground/runs forwards the JSON body and passes 201 through', async () => {
    const route: RouteModule = require('@/app/api/playground/runs/route');
    const payload = { ref: 'intra-org/research@1.0.0', inputs: { topic: 'test' } };
    const res = await route.POST!(
      makeRequest('http://localhost:3001/api/playground/runs', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: 'run-1', received: payload });
    expect(lastRequest().method).toBe('POST');
    expect(JSON.parse(lastRequest().body)).toEqual(payload);
  });

  it('GET preserves a non-JSON upstream content-type (narrate is text/plain)', async () => {
    const route: RouteModule = require('@/app/api/playground/runs/[id]/narrate/route');
    const res = await route.GET!(
      makeRequest('http://localhost:3001/api/playground/runs/run-1/narrate'),
      params({ id: 'run-1' }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    await expect(res.text()).resolves.toBe('Agent A greeted Agent B.');
  });

  it('DELETE passing through a 204 yields a null body without throwing', async () => {
    const route: RouteModule = require('@/app/api/cp/registry/agents/[aid]/route');
    const res = await route.DELETE!(
      makeRequest('http://localhost:3001/api/cp/registry/agents/aid%3Apubkey%3Aabc', {
        method: 'DELETE',
      }),
      params({ aid: 'aid:pubkey:abc' }),
    );

    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
    expect(lastRequest().url).toBe('/api/registry/agents/aid%3Apubkey%3Aabc');
  });

  it('POST /api/playground/hosted-agents forwards the host body', async () => {
    const route: RouteModule = require('@/app/api/playground/hosted-agents/route');
    const payload = { ref: 'federated/org-a@1.0.0', public_scheme: 'https' };
    const res = await route.POST!(
      makeRequest('http://localhost:3001/api/playground/hosted-agents', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ hosted_id: 'h1', received: payload });
    expect(lastRequest().url).toBe('/hosted-agents');
    expect(JSON.parse(lastRequest().body)).toEqual(payload);
  });

  it('GET /api/playground/hosted-agents returns the wrapped list', async () => {
    const route: RouteModule = require('@/app/api/playground/hosted-agents/route');
    const res = await route.GET!(
      makeRequest('http://localhost:3001/api/playground/hosted-agents'),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ hosted: [{ hosted_id: 'h1' }] });
  });

  it('DELETE /api/playground/hosted-agents/[id] encodes the id', async () => {
    const route: RouteModule = require('@/app/api/playground/hosted-agents/[id]/route');
    const res = await route.DELETE!(
      makeRequest('http://localhost:3001/api/playground/hosted-agents/h%3A1', {
        method: 'DELETE',
      }),
      params({ id: 'h:1' }),
    );

    expect(res.status).toBe(200);
    expect(lastRequest().url).toBe('/hosted-agents/h%3A1');
    expect(lastRequest().method).toBe('DELETE');
  });

  it('POST /api/playground/hosted-agents/[id]/resolve-and-handshake maps to the sub-route', async () => {
    const route: RouteModule = require('@/app/api/playground/hosted-agents/[id]/resolve-and-handshake/route');
    const body = { peer_did: 'did:web:org-b.example.com' };
    const res = await route.POST!(
      makeRequest('http://localhost:3001/api/playground/hosted-agents/h1/resolve-and-handshake', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
      params({ id: 'h1' }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ trust: 'established', received: body });
    expect(lastRequest().url).toBe('/hosted-agents/h1/resolve-and-handshake');
  });

  it('POST /api/playground/hosted-agents/[id]/invoke maps to the sub-route', async () => {
    const route: RouteModule = require('@/app/api/playground/hosted-agents/[id]/invoke/route');
    const body = { peer_port: 9101, capability: 'summarize', payload: { text: 'hi' } };
    const res = await route.POST!(
      makeRequest('http://localhost:3001/api/playground/hosted-agents/h1/invoke', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
      params({ id: 'h1' }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ result: body });
    expect(lastRequest().url).toBe('/hosted-agents/h1/invoke');
  });

  // docs/PROXIES.md step 6 requires a mock-upstream hit here for every
  // proxied route, including the two verifying ones. The deep
  // verification-logic matrix (signature tampering, expiry, pinned vs.
  // self-consistent tiers, ...) already lives in each route's own
  // route.integration.test.ts — these two cases only prove the wiring:
  // GET -> proxyGetVerified -> verify fn -> a `_verification` field
  // attached to the response.
  it('GET /api/cp/well-known/aitp-manifest attaches a well-formed _verification for a validly-signed envelope', async () => {
    const { AitpAgent } = require('aitp');
    const agent = AitpAgent.generate();
    manifestUpstreamStatus = 200;
    manifestUpstreamText = agent.buildManifest({
      displayName: 'Mock CP',
      handshakeEndpoint: 'https://cp.example/handshake',
      offeredCaps: [],
      ttlSecs: 3600,
    });

    const route: RouteModule = require('@/app/api/cp/well-known/aitp-manifest/route');
    const res = await route.GET!(
      makeRequest('http://localhost:3001/api/cp/well-known/aitp-manifest'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._verification).toEqual({ checked: true, ok: true });
    expect(body.manifest.aid).toBe(agent.aid);
    expect(lastRequest().url).toBe('/.well-known/aitp-manifest');
  });

  it('GET /api/cp/well-known/aitp-manifest reports checked:true, ok:false for a malformed upstream body', async () => {
    manifestUpstreamStatus = 200;
    manifestUpstreamText = 'not json at all';

    const route: RouteModule = require('@/app/api/cp/well-known/aitp-manifest/route');
    const res = await route.GET!(
      makeRequest('http://localhost:3001/api/cp/well-known/aitp-manifest'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._verification).toEqual({ checked: true, ok: false, code: 'malformed' });
  });

  it('GET /api/cp/well-known/aitp-revocation-list attaches a well-formed _verification for a validly-signed envelope', async () => {
    const { AitpAgent } = require('aitp');
    const cp = AitpAgent.generate();
    manifestUpstreamStatus = 200;
    manifestUpstreamText = cp.buildManifest({
      displayName: 'Mock CP',
      handshakeEndpoint: 'https://cp.example/handshake',
      offeredCaps: [],
      ttlSecs: 3600,
    });
    revocationUpstreamStatus = 200;
    revocationUpstreamText = cp.signRevocationList([], 3600);

    // No CP_AID is set anywhere in this file, so this exercises the Tier 1
    // ("self-consistent") path, which itself proves the route also fetches
    // the co-served manifest through the same mock upstream.
    const route: RouteModule = require('@/app/api/cp/well-known/aitp-revocation-list/route');
    const res = await route.GET!(
      makeRequest('http://localhost:3001/api/cp/well-known/aitp-revocation-list'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._verification).toEqual({ checked: true, ok: true, tier: 'self-consistent' });
  });

  it('SSE route streams upstream frames with event-stream headers', async () => {
    const route: RouteModule = require('@/app/api/cp/events/stream/route');
    const res = await route.GET!(makeRequest('http://localhost:3001/api/cp/events/stream'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');

    const raw = await res.text();
    expect(raw).toContain('"type":"registry.registered"');
    expect(raw).toContain('"type":"handshake.complete"');
  });

  it('SSE route passes an upstream 503 status through (capacity signal)', async () => {
    const route: RouteModule = require('@/app/api/cp/events/stream/route');
    const res = await route.GET!(
      makeRequest('http://localhost:3001/api/cp/events/stream?full=1'),
    );

    expect(res.status).toBe(503);
    // Headers are still rewritten — the proxy never forwards upstream headers.
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
  });
});

describe('BFF error mapping when the upstream is unreachable', () => {
  it('synthesizes the 502 envelope instead of leaking the raw error', async () => {
    // The proxy logs the raw failure server-side by design; keep the test
    // output clean.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Re-require the config + proxy + route with a dead upstream. Module
    // state is per-registry, so isolateModules gives a fresh serverConfig.
    const dead = 'http://127.0.0.1:9'; // discard port — connection refused
    const prev = process.env.PLAYGROUND_URL;
    process.env.PLAYGROUND_URL = dead;

    let route: RouteModule;
    jest.isolateModules(() => {
      route = require('@/app/api/playground/runs/route');
    });
    const res = await route!.GET!(makeRequest('http://localhost:3001/api/playground/runs'));
    process.env.PLAYGROUND_URL = prev;
    errSpy.mockRestore();

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({
      error: 'Upstream unreachable',
      target: `${dead}/runs`,
      upstream_status: 502,
    });
  });
});
