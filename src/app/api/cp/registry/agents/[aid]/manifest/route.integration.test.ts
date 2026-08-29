/**
 * Confirms the per-agent manifest route is wired through the same
 * verifying proxy as the well-known route (the CP verifies at enrollment
 * but re-serves the stored blob indefinitely, so this route needs its own
 * check, not a one-time enrollment-time guarantee). Verification semantics
 * themselves (ok/expired/tampered/malformed) are exercised exhaustively in
 * ../../../../well-known/aitp-manifest/route.integration.test.ts -- this
 * file only proves the wiring, not the SDK behaviour again.
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

function makeRequest(): NextRequest {
  const { NextRequest } = require('next/server');
  return new NextRequest('http://localhost:3001/api/cp/registry/agents/aid%3Apubkey%3Atest/manifest');
}

function params(): { params: Promise<{ aid: string }> } {
  return { params: Promise.resolve({ aid: 'aid:pubkey:test' }) };
}

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
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

describe('GET /api/cp/registry/agents/[aid]/manifest — verifying proxy', () => {
  it('attaches a verification verdict, same as the well-known route', async () => {
    const { AitpAgent } = require('aitp');
    const agent = AitpAgent.generate();
    const json = agent.buildManifest({
      displayName: 'Enrolled agent',
      handshakeEndpoint: 'https://agent.example/handshake',
      offeredCaps: [],
      ttlSecs: 3600,
    });
    upstreamText = json;

    const route = require('@/app/api/cp/registry/agents/[aid]/manifest/route');
    const res = await route.GET(makeRequest(), params());
    const body = await res.json();

    expect(body._verification).toEqual({ checked: true, ok: true });
    expect(body.manifest.aid).toBe(agent.aid);
  });

  it('surfaces a stale enrollment-time signature as a failure, not a silent pass', async () => {
    const { AitpAgent } = require('aitp');
    const agent = AitpAgent.generate();
    const json = agent.buildManifest({
      displayName: 'Enrolled agent',
      handshakeEndpoint: 'https://agent.example/handshake',
      offeredCaps: [],
      ttlSecs: 3600,
    });
    const obj = JSON.parse(json);
    obj.manifest.signature = `${obj.manifest.signature.slice(0, -4)}AAAA`;
    upstreamText = JSON.stringify(obj);

    const route = require('@/app/api/cp/registry/agents/[aid]/manifest/route');
    const res = await route.GET(makeRequest(), params());
    const body = await res.json();

    expect(body._verification).toEqual({
      checked: true,
      ok: false,
      code: 'signature_invalid',
    });
  });
});
