/**
 * @jest-environment node
 *
 * Web Crypto (`crypto.subtle`) is a Node global; jsdom's window doesn't
 * expose it the same way, so run under the node environment.
 */
import {
  SESSION_TTL_SECONDS,
  basicAuthMatches,
  passwordMatches,
  signSession,
  verifySession,
} from './session';

const SECRET = 'a'.repeat(64);
const NOW = 1_800_000_000;

describe('signSession / verifySession', () => {
  it('accepts a freshly signed token', async () => {
    const token = await signSession(SECRET, NOW);
    expect(await verifySession(token, SECRET, NOW)).toBe(true);
    expect(
      await verifySession(token, SECRET, NOW + SESSION_TTL_SECONDS - 1),
    ).toBe(true);
  });

  it('mints a distinct token each time', async () => {
    expect(await signSession(SECRET, NOW)).not.toBe(
      await signSession(SECRET, NOW),
    );
  });

  it('rejects an expired token', async () => {
    const token = await signSession(SECRET, NOW);
    expect(await verifySession(token, SECRET, NOW + SESSION_TTL_SECONDS)).toBe(
      false,
    );
    expect(
      await verifySession(token, SECRET, NOW + SESSION_TTL_SECONDS + 3600),
    ).toBe(false);
  });

  it('rejects a token signed with another secret', async () => {
    const token = await signSession('b'.repeat(64), NOW);
    expect(await verifySession(token, SECRET, NOW)).toBe(false);
  });

  it('rejects a tampered signature', async () => {
    const token = await signSession(SECRET, NOW);
    const sig = token.split('.')[3];
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(await verifySession(token.replace(sig, flipped), SECRET, NOW)).toBe(
      false,
    );
  });

  it('rejects an extended expiry with the original signature', async () => {
    const token = await signSession(SECRET, NOW);
    const [v, exp, nonce, sig] = token.split('.');
    const extended = [v, String(Number(exp) + 3600), nonce, sig].join('.');
    expect(
      await verifySession(extended, SECRET, NOW + SESSION_TTL_SECONDS + 10),
    ).toBe(false);
  });

  it('rejects a tampered nonce', async () => {
    const token = await signSession(SECRET, NOW);
    const [v, exp, , sig] = token.split('.');
    expect(
      await verifySession(
        [v, exp, 'AAAAAAAAAAAAAAAAAAAAAA', sig].join('.'),
        SECRET,
        NOW,
      ),
    ).toBe(false);
  });

  it('rejects an expiry far beyond the TTL even if the signature were valid', async () => {
    // A token minted "in the future" (e.g. by a host with a wrong clock).
    const token = await signSession(SECRET, NOW + 3600);
    expect(await verifySession(token, SECRET, NOW)).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['garbage', 'not-a-token'],
    ['wrong version', 'v0.1800043200.abc.def'],
    ['non-numeric exp', 'v1.soon.abc.def'],
    ['bad base64', 'v1.1800043200.abc.!!!'],
    ['too many parts', 'v1.1800043200.abc.def.ghi'],
  ])('rejects a %s token', async (_label, token) => {
    expect(await verifySession(token, SECRET, NOW)).toBe(false);
  });

  it('rejects everything when the secret is empty', async () => {
    const token = await signSession(SECRET, NOW);
    expect(await verifySession(token, '', NOW)).toBe(false);
  });
});

describe('passwordMatches', () => {
  it('matches the exact password only', async () => {
    expect(await passwordMatches('correct horse', 'correct horse')).toBe(true);
    expect(await passwordMatches('correct hors', 'correct horse')).toBe(false);
    expect(await passwordMatches('', 'correct horse')).toBe(false);
  });

  it('never matches when no password is configured', async () => {
    expect(await passwordMatches('', '')).toBe(false);
  });
});

describe('basicAuthMatches', () => {
  const basic = (s: string) => `Basic ${Buffer.from(s).toString('base64')}`;

  it('accepts any username with the operator password', async () => {
    expect(await basicAuthMatches(basic('operator:pw'), 'pw')).toBe(true);
    expect(await basicAuthMatches(basic(':pw'), 'pw')).toBe(true);
  });

  it('accepts a password containing a colon', async () => {
    expect(await basicAuthMatches(basic('op:a:b'), 'a:b')).toBe(true);
  });

  it.each([
    ['missing', null],
    ['wrong password', basic('op:nope')],
    ['no colon', basic('pw')],
    ['other scheme', 'Bearer pw'],
    ['bad base64', 'Basic ***'],
  ])('rejects a %s header', async (_label, header) => {
    expect(await basicAuthMatches(header, 'pw')).toBe(false);
  });
});
