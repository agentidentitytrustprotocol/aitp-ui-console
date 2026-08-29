/**
 * Integration tests for the manifest verifying-proxy route.
 *
 * Runs the real route handler (`testEnvironment: 'node'`, so the native
 * `aitp` addon loads) against an in-process mock CP. Envelopes are minted
 * with the SDK, not hand-written -- a hand-built fixture pins whatever
 * signing-input convention the author assumed, which is precisely how a
 * signing-input change could cross this family undetected. Ported
 * approach from aitp-control-plane/src/e2e/revocation-flow.integration.test.ts.
 *
 * NOTE: serverConfig reads CP_URL at module load, so it's set in beforeAll
 * *before* the route module is required. Keep all `@/` requires lazy.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NextRequest } from 'next/server';

let server: http.Server;
let base: string;
let upstreamText = '';
let upstreamStatus = 200;

function makeRequest(): NextRequest {
  const { NextRequest } = require('next/server');
  return new NextRequest('http://localhost:3001/api/cp/well-known/aitp-manifest');
}

function setUpstream(text: string, status = 200) {
  upstreamText = text;
  upstreamStatus = status;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mintValidManifest(ttlSecs = 3600): { json: string; aid: string } {
  const { AitpAgent } = require('aitp');
  const agent = AitpAgent.generate();
  const json = agent.buildManifest({
    displayName: 'Test CP',
    handshakeEndpoint: 'https://cp.example/handshake',
    offeredCaps: [],
    ttlSecs,
  });
  return { json, aid: agent.aid };
}

function tamperSignature(json: string): string {
  const obj = JSON.parse(json);
  obj.manifest.signature = `${obj.manifest.signature.slice(0, -4)}AAAA`;
  return JSON.stringify(obj);
}

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(upstreamStatus, { 'Content-Type': 'application/json' });
    res.end(upstreamText);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
  process.env.CP_URL = base;
  process.env.PLAYGROUND_URL = base;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('GET /api/cp/well-known/aitp-manifest — verifying proxy', () => {
  it('(a) a validly-signed envelope verifies ok, manifest returned byte-for-byte', async () => {
    const { json, aid } = mintValidManifest();
    setUpstream(json);

    const route = require('@/app/api/cp/well-known/aitp-manifest/route');
    const res = await route.GET(makeRequest());
    const text = await res.text();
    const body = JSON.parse(text);

    expect(body._verification).toEqual({ checked: true, ok: true });
    expect(body.manifest.aid).toBe(aid);
    // The manifest bytes are exactly the upstream's -- splice, not reparse.
    expect(text.startsWith(json.slice(0, -1))).toBe(true);
  });

  it('(b) one flipped byte in the signature fails with signature_invalid', async () => {
    const { json } = mintValidManifest();
    setUpstream(tamperSignature(json));

    const route = require('@/app/api/cp/well-known/aitp-manifest/route');
    const res = await route.GET(makeRequest());
    const body = await res.json();

    expect(body._verification).toEqual({
      checked: true,
      ok: false,
      code: 'signature_invalid',
    });
  });

  it(
    '(c) an expired manifest fails with code "expired", not a signature failure',
    async () => {
      const { json } = mintValidManifest(1);
      setUpstream(json);
      await sleep(3000);

      const route = require('@/app/api/cp/well-known/aitp-manifest/route');
      const res = await route.GET(makeRequest());
      const body = await res.json();

      expect(body._verification).toEqual({ checked: true, ok: false, code: 'expired' });
    },
    15_000,
  );

  it('(d) unparseable JSON from upstream is handled without crashing the route', async () => {
    setUpstream('not json at all');

    const route = require('@/app/api/cp/well-known/aitp-manifest/route');
    const res = await route.GET(makeRequest());
    const body = await res.json();

    expect(body._verification).toEqual({ checked: true, ok: false, code: 'malformed' });
    expect(body._raw).toBe('not json at all');
  });

  it(
    '(e) expired AND tampered renders identically to expired-and-honest -- pins the fix',
    async () => {
      const { json: honestJson } = mintValidManifest(1);
      const { json: forgedJson } = mintValidManifest(1);
      const tamperedAndExpired = tamperSignature(forgedJson);
      await sleep(3000);

      const route = require('@/app/api/cp/well-known/aitp-manifest/route');

      setUpstream(honestJson);
      const honestRes = await route.GET(makeRequest());
      const honestBody = await honestRes.json();

      setUpstream(tamperedAndExpired);
      const forgedRes = await route.GET(makeRequest());
      const forgedBody = await forgedRes.json();

      // Both must be "expired" -- never "signature_invalid" -- because
      // verify_manifest checks expiry before it ever touches the
      // signature. If this ever diverges, someone has reintroduced an
      // authenticity claim the SDK cannot support for an expired manifest.
      expect(honestBody._verification).toEqual({ checked: true, ok: false, code: 'expired' });
      expect(forgedBody._verification).toEqual({ checked: true, ok: false, code: 'expired' });
    },
    15_000,
  );
});
