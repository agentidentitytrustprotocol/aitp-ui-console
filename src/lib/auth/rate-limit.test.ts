/** @jest-environment node */

import { clientIp, createRateLimiter } from './rate-limit';

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
  it('prefers x-real-ip, then the first x-forwarded-for entry', () => {
    expect(
      clientIp(
        new Headers({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' }),
      ),
    ).toBe('9.9.9.9');
    expect(
      clientIp(new Headers({ 'x-forwarded-for': '1.1.1.1, 10.0.0.1' })),
    ).toBe('1.1.1.1');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
