/** @jest-environment node */
import { assertLiveAllowed, consoleUrl, intEnv, leakNeedles, LiveRefused, redact } from './env';
import { byDesign, findLeaks, urlNeedles } from './leaks';

describe('assertLiveAllowed', () => {
  it('refuses under CI whatever its value, even with AITP_LIVE=1', () => {
    for (const ci of ['1', 'true', 'false', '0']) {
      expect(() => assertLiveAllowed({ CI: ci, AITP_LIVE: '1' })).toThrow(LiveRefused);
    }
  });
  it('refuses without the explicit opt-in', () => {
    expect(() => assertLiveAllowed({})).toThrow(/AITP_LIVE=1/);
    expect(() => assertLiveAllowed({ AITP_LIVE: 'true' })).toThrow(LiveRefused);
  });
  it('allows a local opt-in with CI unset or empty', () => {
    expect(() => assertLiveAllowed({ AITP_LIVE: '1' })).not.toThrow();
    expect(() => assertLiveAllowed({ AITP_LIVE: '1', CI: '' })).not.toThrow();
  });
});

describe('config readers', () => {
  it('defaults to the production console and refuses plain http', () => {
    expect(consoleUrl({})).toBe('https://console.agentidentitytrustprotocol.io');
    expect(consoleUrl({ AITP_LIVE_CONSOLE_URL: 'http://localhost:3001/x' })).toBe('http://localhost:3001');
    expect(() => consoleUrl({ AITP_LIVE_CONSOLE_URL: 'http://example.com' })).toThrow(LiveRefused);
  });
  it('validates integers', () => {
    expect(intEnv({}, 'X', 7)).toBe(7);
    expect(intEnv({ X: '3' }, 'X', 7)).toBe(3);
    expect(() => intEnv({ X: '-1' }, 'X', 7)).toThrow(LiveRefused);
    expect(() => intEnv({ X: '2.5' }, 'X', 7)).toThrow(LiveRefused);
  });
});

const KEY = 'k3y-0123456789abcdef0123456789abcdef';
const ENV = {
  AITP_LIVE_LEAK_NEEDLES: [
    'PLAYGROUND_URL=https://pg-backend-xyz.example.net',
    `PLAYGROUND_API_KEY=${KEY}`,
    'SHORT=abc',
    'garbage line',
  ].join('\n'),
};

describe('leak needles', () => {
  it('expands URLs to origin + host and drops short values', () => {
    const labels = leakNeedles(ENV).map((n) => n.label);
    expect(labels).toEqual(['PLAYGROUND_URL-origin', 'PLAYGROUND_URL-host', 'PLAYGROUND_API_KEY']);
  });

  it('finds needles as-is, URL-encoded and JSON-escaped, returning labels only', () => {
    const needles = leakNeedles(ENV);
    expect(findLeaks('{"target":"/runs"}', needles)).toEqual([]);
    expect(findLeaks('see pg-backend-xyz.example.net:443', needles)).toEqual(['PLAYGROUND_URL-host']);
    expect(findLeaks('u=https%3A%2F%2Fpg-backend-xyz.example.net', needles)).toContain('PLAYGROUND_URL-host');
    expect(findLeaks('"https:\\/\\/pg-backend-xyz.example.net"', needles)).toContain('PLAYGROUND_URL-origin');
    const hits = findLeaks(`x-api-key: ${KEY}`, needles);
    expect(hits).toEqual(['PLAYGROUND_API_KEY']);
    expect(JSON.stringify(hits)).not.toContain(KEY);
  });

  it('flags any Railway domain even without a configured needle', () => {
    expect(findLeaks('https://svc-xyz.up.railway.app/runs', [])).toEqual(['railway-public-domain']);
    expect(findLeaks('http://aitp-control-plane.railway.internal:4000', [])).toEqual(['railway-private-domain']);
  });

  it('urlNeedles ignores junk', () => {
    expect(urlNeedles('X', undefined)).toEqual([]);
    expect(urlNeedles('X', 'not a url')).toEqual([]);
  });

  it('redact removes needle values and secret shapes', () => {
    const out = redact(`key=${KEY} auth=Bearer abc.def sk-ABCDEFGH12345`, leakNeedles(ENV));
    expect(out).not.toContain(KEY);
    expect(out).toContain('<PLAYGROUND_API_KEY>');
    expect(out).toContain('Bearer <redacted>');
    expect(out).toContain('sk-<redacted>');
  });
});

describe('byDesign exemptions', () => {
  it('exempts the static font hosts only', () => {
    expect(byDesign({ kind: 'foreign-host', where: 'GET fonts.gstatic.com/s/x.ttf' })).toBeDefined();
    expect(byDesign({ kind: 'foreign-host', where: 'GET evil.example.com/x' })).toBeUndefined();
  });
  it('exempts URL labels in a relayed manifest body, never a key, never elsewhere', () => {
    const where = 'GET /api/cp/well-known/aitp-manifest 200 [response body]';
    expect(byDesign({ kind: 'leak', where, labels: ['CP_URL-host', 'railway-public-domain'] })).toBeDefined();
    expect(byDesign({ kind: 'leak', where, labels: ['CP_URL-host', 'CP_API_KEY'] })).toBeUndefined();
    expect(byDesign({ kind: 'leak', where: 'GET /api/cp/registry/agents/aid%3Ax/manifest 200 [response body]', labels: ['PLAYGROUND_URL-origin'] })).toBeDefined();
    expect(byDesign({ kind: 'leak', where: 'GET /api/cp/dashboard 200 [response body]', labels: ['CP_URL-host'] })).toBeUndefined();
    expect(byDesign({ kind: 'leak', where: 'GET /api/cp/well-known/aitp-manifest 200 [response headers]', labels: ['CP_URL-host'] })).toBeUndefined();
  });
});
