/**
 * Integration tests for the revocation-list verifying-proxy route, across
 * the six-case matrix from Phase 4 of
 * plans/cp-signed-artifact-verification.md: pinned-correct, pinned-wrong,
 * unpinned (Tier 1 happy path), tampered snapshot, manifest-unverifiable
 * (tampered manifest), manifest-expired.
 *
 * Envelopes are minted with the SDK (`AitpAgent.buildManifest`,
 * `signRevocationList`), not hand-written -- a hand-built fixture pins
 * whatever signing-input convention the author assumed, which is
 * precisely how a signing-input change could cross this family
 * undetected.
 *
 * `CP_AID` varies per test (pinned vs. unpinned), and `serverConfig` reads
 * it at module load -- so tests that change it call `jest.resetModules()`
 * and re-require the route (and its transitive `@/` deps) fresh. `CP_URL`
 * is constant across all cases and set once in beforeAll.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NextRequest } from 'next/server';

let server: http.Server;
let base: string;
let manifestText = '';
const manifestStatus = 200;
let revocationText = '';
const revocationStatus = 200;

function makeRequest(): NextRequest {
  const { NextRequest } = require('next/server');
  return new NextRequest('http://localhost:3001/api/cp/well-known/aitp-revocation-list');
}

function requireRoute(cpAid?: string) {
  if (cpAid === undefined) delete process.env.CP_AID;
  else process.env.CP_AID = cpAid;
  jest.resetModules();
  return require('@/app/api/cp/well-known/aitp-revocation-list/route');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tamperSignature(json: string): string {
  const obj = JSON.parse(json);
  obj.signature = `${obj.signature.slice(0, -4)}AAAA`;
  return JSON.stringify(obj);
}

function tamperManifestSignature(json: string): string {
  const obj = JSON.parse(json);
  obj.manifest.signature = `${obj.manifest.signature.slice(0, -4)}AAAA`;
  return JSON.stringify(obj);
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '';
    if (url.startsWith('/.well-known/aitp-manifest')) {
      res.writeHead(manifestStatus, { 'Content-Type': 'application/json' });
      res.end(manifestText);
    } else if (url.startsWith('/.well-known/aitp-revocation-list')) {
      res.writeHead(revocationStatus, { 'Content-Type': 'application/json' });
      res.end(revocationText);
    } else {
      res.writeHead(404);
      res.end();
    }
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

afterEach(() => {
  delete process.env.CP_AID;
});

describe('GET /api/cp/well-known/aitp-revocation-list — verifying proxy', () => {
  it('1. pinned-correct: CP_AID set to the real issuer -> tier pinned, ok:true', async () => {
    const { AitpAgent } = require('aitp');
    const cp = AitpAgent.generate();
    revocationText = cp.signRevocationList(
      [{ jti: '11111111-1111-1111-1111-111111111111' }],
      3600,
    );

    const route = requireRoute(cp.aid);
    const res = await route.GET(makeRequest());
    const body = await res.json();

    expect(body._verification).toEqual({ checked: true, ok: true, tier: 'pinned' });
  });

  it('2. pinned-wrong: CP_AID set to a different valid AID -> issuer_mismatch', async () => {
    const { AitpAgent } = require('aitp');
    const cp = AitpAgent.generate();
    const someoneElse = AitpAgent.generate();
    revocationText = cp.signRevocationList([], 3600);

    const route = requireRoute(someoneElse.aid);
    const res = await route.GET(makeRequest());
    const body = await res.json();

    expect(body._verification).toEqual({
      checked: true,
      ok: false,
      code: 'issuer_mismatch',
      tier: 'pinned',
    });
  });

  it('3. unpinned: CP_AID unset, healthy manifest -> tier self-consistent, ok:true, never says "verified"', async () => {
    const { AitpAgent } = require('aitp');
    const cp = AitpAgent.generate();
    manifestText = cp.buildManifest({
      displayName: 'CP',
      handshakeEndpoint: 'https://cp.example/h',
      offeredCaps: [],
      ttlSecs: 3600,
    });
    revocationText = cp.signRevocationList([], 3600);

    const route = requireRoute(undefined);
    const res = await route.GET(makeRequest());
    const body = await res.json();

    expect(body._verification).toEqual({ checked: true, ok: true, tier: 'self-consistent' });
  });

  it('4. tampered snapshot -> signature_invalid; entries still returned', async () => {
    const { AitpAgent } = require('aitp');
    const cp = AitpAgent.generate();
    revocationText = tamperSignature(
      cp.signRevocationList([{ jti: '22222222-2222-2222-2222-222222222222' }], 3600),
    );

    const route = requireRoute(cp.aid);
    const res = await route.GET(makeRequest());
    const body = await res.json();

    expect(body._verification).toEqual({
      checked: true,
      ok: false,
      code: 'signature_invalid',
      tier: 'pinned',
    });
    expect(body.revocation_list.entries).toHaveLength(1);
  });

  it('5. manifest-unverifiable (tampered manifest): unpinned Tier 1 cannot proceed', async () => {
    const { AitpAgent } = require('aitp');
    const cp = AitpAgent.generate();
    manifestText = tamperManifestSignature(
      cp.buildManifest({
        displayName: 'CP',
        handshakeEndpoint: 'https://cp.example/h',
        offeredCaps: [],
        ttlSecs: 3600,
      }),
    );
    revocationText = cp.signRevocationList([], 3600);

    const route = requireRoute(undefined);
    const res = await route.GET(makeRequest());
    const body = await res.json();

    expect(body._verification).toEqual({
      checked: false,
      reason: 'no_trusted_issuer',
      manifestCode: 'signature_invalid',
    });
  });

  it(
    '6. manifest-expired: unpinned Tier 1 is checked:false with manifestCode "expired", ' +
      "and the snapshot's own (different) declared issuer is never consulted",
    async () => {
      const { AitpAgent } = require('aitp');
      const cp = AitpAgent.generate();
      manifestText = cp.buildManifest({
        displayName: 'CP',
        handshakeEndpoint: 'https://cp.example/h',
        offeredCaps: [],
        ttlSecs: 1,
      });
      await sleep(3000);

      // Signed by a *different* agent, so revocation_list.issuer names an
      // AID the (expired) manifest never claimed -- proves it isn't
      // consulted as a fallback.
      const someoneElse = AitpAgent.generate();
      revocationText = someoneElse.signRevocationList([], 3600);

      const route = requireRoute(undefined);
      const res = await route.GET(makeRequest());
      const body = await res.json();

      expect(body._verification).toEqual({
        checked: false,
        reason: 'no_trusted_issuer',
        manifestCode: 'expired',
      });
      expect(body.revocation_list.issuer).toBe(someoneElse.aid);
    },
    15_000,
  );
});
