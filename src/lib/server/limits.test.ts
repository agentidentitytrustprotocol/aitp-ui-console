/** @jest-environment node */
import {
  INSTANCE_KEY,
  POLICIES,
  createLimiter,
  createStreamGate,
} from './limits';

describe('createLimiter', () => {
  it('refuses the 301st read in 60 s with the right Retry-After', () => {
    const l = createLimiter();
    for (let i = 0; i < 300; i++)
      expect(l.consume([{ policy: 'read', key: 'a' }], 1_000 + i).ok).toBe(
        true,
      );
    const r = l.consume([{ policy: 'read', key: 'a' }], 31_000);
    expect(r).toEqual({
      ok: false,
      policy: 'read',
      limit: 300,
      retryAfterSeconds: 30,
    });
    // Window boundary: exactly at resetAt the window is fresh.
    expect(l.consume([{ policy: 'read', key: 'a' }], 61_000).ok).toBe(true);
  });

  it('refuses the 6th launch in 600 s', () => {
    const l = createLimiter();
    const launch = [
      { policy: 'read' as const, key: 'a' },
      { policy: 'launch' as const, key: 'a' },
    ];
    for (let i = 0; i < 5; i++) expect(l.consume(launch, 0).ok).toBe(true);
    const r = l.consume(launch, 60_000);
    expect(r).toMatchObject({
      ok: false,
      policy: 'launch',
      limit: 5,
      retryAfterSeconds: 540,
    });
  });

  it('spends nothing when any check in the set is refused', () => {
    const l = createLimiter({
      ...POLICIES,
      launch: { limit: 1, windowMs: 600_000 },
    });
    const launch = [
      { policy: 'read' as const, key: 'a' },
      { policy: 'launch' as const, key: 'a' },
    ];
    expect(l.consume(launch, 0).ok).toBe(true);
    for (let i = 0; i < 10; i++) expect(l.consume(launch, 0).ok).toBe(false);
    // The 10 refused launches did not spend `read`: 298 more reads still fit.
    for (let i = 0; i < 299; i++)
      expect(l.consume([{ policy: 'read', key: 'a' }], 0).ok).toBe(true);
    expect(l.consume([{ policy: 'read', key: 'a' }], 0).ok).toBe(false);
  });

  it('counts a (policy, key) repeated in one call once', () => {
    const l = createLimiter({
      ...POLICIES,
      read: { limit: 1, windowMs: 60_000 },
    });
    const twice = [
      { policy: 'read' as const, key: 'a' },
      { policy: 'read' as const, key: 'a' },
    ];
    expect(l.consume(twice, 0).ok).toBe(true);
    expect(l.consume(twice, 0).ok).toBe(false);
  });

  it('keys buckets independently', () => {
    const l = createLimiter({
      ...POLICIES,
      read: { limit: 1, windowMs: 60_000 },
    });
    expect(l.consume([{ policy: 'read', key: 'a' }], 0).ok).toBe(true);
    expect(l.consume([{ policy: 'read', key: 'b' }], 0).ok).toBe(true);
    expect(l.consume([{ policy: 'read', key: 'a' }], 0).ok).toBe(false);
  });

  it('reports the longest wait when several checks are refused', () => {
    const l = createLimiter({
      ...POLICIES,
      read: { limit: 1, windowMs: 60_000 },
      launch: { limit: 1, windowMs: 600_000 },
    });
    const both = [
      { policy: 'read' as const, key: 'a' },
      { policy: 'launch' as const, key: 'a' },
    ];
    l.consume(both, 0);
    expect(l.consume(both, 0)).toMatchObject({
      policy: 'launch',
      retryAfterSeconds: 600,
    });
  });

  it('caps the bucket map, pruning expired first, never the instance bucket', () => {
    const l = createLimiter(POLICIES, 100);
    l.consume([{ policy: 'cpRead', key: INSTANCE_KEY }], 0);
    for (let i = 0; i < 100; i++)
      l.consume([{ policy: 'read', key: `ip${i}` }], 0);
    expect(l.size()).toBeLessThanOrEqual(100);
    // The instance bucket survived eviction: its count is still 1.
    const cap = POLICIES.cpRead.limit;
    for (let i = 0; i < cap - 1; i++)
      expect(l.consume([{ policy: 'cpRead', key: INSTANCE_KEY }], 1).ok).toBe(
        true,
      );
    expect(l.consume([{ policy: 'cpRead', key: INSTANCE_KEY }], 1).ok).toBe(
      false,
    );
    // After the window, expired buckets are pruned first.
    for (let i = 0; i < 101; i++)
      l.consume([{ policy: 'read', key: `n${i}` }], 120_000);
    expect(l.size()).toBeLessThanOrEqual(100);
  });
});

describe('createStreamGate', () => {
  it('refuses the 5th slot per key and frees it on release (idempotent)', () => {
    const g = createStreamGate(4, 200, 305_000);
    const slots = [1, 2, 3, 4].map(() => g.acquire('ip', 0));
    expect(slots.every((s) => s.ok)).toBe(true);
    const fifth = g.acquire('ip', 0);
    expect(fifth).toMatchObject({
      ok: false,
      scope: 'ip',
      limit: 4,
      retryAfterSeconds: 305,
    });
    expect(g.acquire('other', 0).ok).toBe(true);
    const s0 = slots[0];
    if (!s0.ok) throw new Error('unreachable');
    s0.release();
    s0.release();
    expect(g.open('ip', 0)).toBe(3);
    expect(g.acquire('ip', 0).ok).toBe(true);
    expect(g.acquire('ip', 0).ok).toBe(false);
  });

  it('caps the instance total', () => {
    const g = createStreamGate(4, 3, 1_000);
    expect(g.acquire('a', 0).ok).toBe(true);
    expect(g.acquire('b', 0).ok).toBe(true);
    expect(g.acquire('c', 0).ok).toBe(true);
    expect(g.acquire('d', 0)).toMatchObject({
      ok: false,
      scope: 'instance',
      limit: 3,
    });
  });

  it('reclaims an expired slot whose release never ran', () => {
    const g = createStreamGate(1, 200, 1_000);
    expect(g.acquire('ip', 0).ok).toBe(true);
    expect(g.acquire('ip', 999).ok).toBe(false);
    expect(g.acquire('ip', 1_000).ok).toBe(true);
  });
});
