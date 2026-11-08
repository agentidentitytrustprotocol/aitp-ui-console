/** @jest-environment node */

import {
  UNKNOWN_IP_LOGIN_LIMIT,
  clientIp,
  createRateLimiter,
  hitLogin,
  loginLimiter,
  unknownIpLoginLimiter,
} from './rate-limit';

describe('createRateLimiter', () => {
  it('allows `limit` hits per window and rejects the next one', () => {
    const rl = createRateLimiter(10, 60_000);
    for (let i = 0; i < 10; i++)
      expect(rl.hit('1.2.3.4', 1000 + i).allowed).toBe(true);
    const blocked = rl.hit('1.2.3.4', 1010);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it('keys by client', () => {
    const rl = createRateLimiter(1, 60_000);
    expect(rl.hit('a', 0).allowed).toBe(true);
    expect(rl.hit('b', 0).allowed).toBe(true);
    expect(rl.hit('a', 0).allowed).toBe(false);
  });

  it('frees capacity as old hits leave the window', () => {
    const rl = createRateLimiter(2, 60_000);
    rl.hit('a', 0);
    rl.hit('a', 30_000);
    expect(rl.hit('a', 59_999).allowed).toBe(false);
    expect(rl.hit('a', 60_000).allowed).toBe(true);
  });

  it('reset clears all keys', () => {
    const rl = createRateLimiter(1, 60_000);
    rl.hit('a', 0);
    rl.reset();
    expect(rl.hit('a', 0).allowed).toBe(true);
  });
});

describe('clientIp', () => {
  const vercel = { VERCEL: '1' };
  it('on Vercel prefers x-real-ip, then the RIGHTMOST x-forwarded-for entry', () => {
    expect(
      clientIp(
        new Headers({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' }),
        vercel,
      ),
    ).toBe('9.9.9.9');
    // The leftmost entry is client-supplied; only the edge-appended one counts.
    expect(
      clientIp(new Headers({ 'x-forwarded-for': '1.1.1.1, 10.0.0.1' }), vercel),
    ).toBe('10.0.0.1');
    expect(clientIp(new Headers(), vercel)).toBe('unknown');
  });

  it('off Vercel without a trusted header is unknown', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '9.9.9.9' }), {})).toBe(
      'unknown',
    );
  });
});

describe('hitLogin', () => {
  beforeEach(() => {
    loginLimiter.reset();
    unknownIpLoginLimiter.reset();
  });

  it('limits a known IP to 10 per minute', () => {
    for (let i = 0; i < 10; i++)
      expect(hitLogin('1.2.3.4', 0).allowed).toBe(true);
    expect(hitLogin('1.2.3.4', 0).allowed).toBe(false);
  });

  it('puts unknown IPs in one shared bucket with a higher cap', () => {
    for (let i = 0; i < UNKNOWN_IP_LOGIN_LIMIT; i++)
      expect(hitLogin('unknown', 0).allowed).toBe(true);
    expect(hitLogin('unknown', 0).allowed).toBe(false);
    // A known IP is unaffected by the unknown bucket.
    expect(hitLogin('1.2.3.4', 0).allowed).toBe(true);
  });

  it('buckets IPv6 callers by /64', () => {
    for (let i = 0; i < 10; i++)
      expect(hitLogin(`2001:db8:1:2::${i + 1}`, 0).allowed).toBe(true);
    expect(hitLogin('2001:db8:1:2:ffff::9', 0).allowed).toBe(false);
    expect(hitLogin('2001:db8:1:3::1', 0).allowed).toBe(true);
  });
});
