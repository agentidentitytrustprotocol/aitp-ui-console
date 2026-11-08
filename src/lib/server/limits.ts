/** Public-mode request limits: a fixed-window, multi-bucket limiter and a
 *  concurrent-stream gate. In memory, per instance (see the plan's
 *  long-term note: the playground's Postgres-backed quotas are the
 *  authoritative limits; these protect the console and the CP read bucket).
 *
 *  `consume` is all-or-nothing: either every check has room and every
 *  bucket is charged, or nothing is charged and the tightest refusal is
 *  reported. A refused request therefore never spends quota. */

export type PolicyName = 'read' | 'launch' | 'cpReadIp' | 'cpRead';

export interface Policy {
  limit: number;
  windowMs: number;
}

export const POLICIES: Record<PolicyName, Policy> = {
  /** Every public request, per IP. */
  read: { limit: 300, windowMs: 60_000 },
  /** `POST /runs`, per IP, charged in addition to `read`. */
  launch: { limit: 5, windowMs: 600_000 },
  /** Anonymous CP reads, per IP. */
  cpReadIp: { limit: 60, windowMs: 60_000 },
  /** Anonymous CP reads, per instance: the CP's 1200/min read-key bucket
   *  divided across ~4 warm instances, so visitors can't starve it. */
  cpRead: { limit: 300, windowMs: 60_000 },
};

/** Key for instance-wide buckets. Never evicted. */
export const INSTANCE_KEY = '__instance__';

export interface Check {
  policy: PolicyName;
  key: string;
}

export type ConsumeResult =
  | { ok: true }
  | {
      ok: false;
      policy: PolicyName;
      limit: number;
      retryAfterSeconds: number;
    };

interface Bucket {
  count: number;
  resetAt: number;
}

export interface Limiter {
  consume(checks: readonly Check[], now?: number): ConsumeResult;
  size(): number;
  reset(): void;
}

export const DEFAULT_MAX_BUCKETS = 50_000;

export function createLimiter(
  policies: Record<PolicyName, Policy> = POLICIES,
  maxBuckets = DEFAULT_MAX_BUCKETS,
): Limiter {
  const buckets = new Map<string, Bucket>();

  function evict(now: number): void {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    if (buckets.size <= maxBuckets) return;
    // Still over: drop the oldest 1% by first-seen order (Map insertion;
    // a refreshed bucket keeps its slot, so this is not earliest resetAt,
    // which is fine for a flood-of-new-keys cap), never an
    // instance bucket (losing it would reset the instance-wide cap).
    let toDrop = Math.max(1, Math.ceil(buckets.size / 100));
    for (const k of buckets.keys()) {
      if (toDrop === 0) break;
      if (k.endsWith(`:${INSTANCE_KEY}`)) continue;
      buckets.delete(k);
      toDrop--;
    }
  }

  return {
    consume(checks, now = Date.now()) {
      // One check per bucket: a (policy, key) pair repeated in one call is
      // counted once, so a caller can't overshoot a limit by listing it twice.
      checks = checks.filter(
        (c, i) =>
          checks.findIndex((d) => d.policy === c.policy && d.key === c.key) ===
          i,
      );
      const plan: { id: string; bucket: Bucket; policy: PolicyName }[] = [];
      let refusal: ConsumeResult | null = null;
      for (const c of checks) {
        const p = policies[c.policy];
        const id = `${c.policy}:${c.key}`;
        const existing = buckets.get(id);
        const bucket =
          existing && existing.resetAt > now
            ? existing
            : { count: 0, resetAt: now + p.windowMs };
        if (bucket.count >= p.limit) {
          const retryAfterSeconds = Math.max(
            1,
            Math.ceil((bucket.resetAt - now) / 1000),
          );
          if (
            !refusal ||
            (refusal.ok === false &&
              retryAfterSeconds > refusal.retryAfterSeconds)
          ) {
            refusal = {
              ok: false,
              policy: c.policy,
              limit: p.limit,
              retryAfterSeconds,
            };
          }
        }
        plan.push({ id, bucket, policy: c.policy });
      }
      if (refusal) return refusal;
      for (const { id, bucket } of plan) {
        bucket.count++;
        buckets.set(id, bucket);
      }
      if (buckets.size > maxBuckets) evict(now);
      return { ok: true };
    },
    size: () => buckets.size,
    reset: () => buckets.clear(),
  };
}

/** Concurrent SSE streams: `perKey` open slots per IP key and `perInstance`
 *  in total. A slot expires on its own at `ttlMs` (the route's
 *  `maxDuration` plus slack), so a slot whose release never ran (a crashed
 *  stream) can't leak capacity forever. `release` is idempotent. */
export interface StreamGate {
  acquire(
    key: string,
    now?: number,
  ):
    | { ok: true; release: () => void }
    | {
        ok: false;
        scope: 'ip' | 'instance';
        limit: number;
        retryAfterSeconds: number;
      };
  open(key?: string, now?: number): number;
  reset(): void;
}

export const STREAM_LIMITS = { perKey: 4, perInstance: 200 };
/** SSE routes declare `maxDuration = 300`; +5 s slack. */
export const STREAM_TTL_MS = 305_000;

export function createStreamGate(
  perKey = STREAM_LIMITS.perKey,
  perInstance = STREAM_LIMITS.perInstance,
  ttlMs = STREAM_TTL_MS,
): StreamGate {
  const slots = new Map<number, { key: string; expiresAt: number }>();
  let nextId = 0;

  function sweep(now: number): void {
    for (const [id, s] of slots) if (s.expiresAt <= now) slots.delete(id);
  }

  function count(key: string | undefined): number {
    if (key === undefined) return slots.size;
    let n = 0;
    for (const s of slots.values()) if (s.key === key) n++;
    return n;
  }

  function earliestExpiry(key: string | undefined, now: number): number {
    let min = Infinity;
    for (const s of slots.values())
      if (key === undefined || s.key === key) min = Math.min(min, s.expiresAt);
    return Math.max(1, Math.ceil((min - now) / 1000));
  }

  return {
    acquire(key, now = Date.now()) {
      sweep(now);
      if (slots.size >= perInstance) {
        return {
          ok: false,
          scope: 'instance',
          limit: perInstance,
          retryAfterSeconds: earliestExpiry(undefined, now),
        };
      }
      if (count(key) >= perKey) {
        return {
          ok: false,
          scope: 'ip',
          limit: perKey,
          retryAfterSeconds: earliestExpiry(key, now),
        };
      }
      const id = nextId++;
      slots.set(id, { key, expiresAt: now + ttlMs });
      return { ok: true, release: () => void slots.delete(id) };
    },
    open(key, now = Date.now()) {
      sweep(now);
      return count(key);
    },
    reset: () => slots.clear(),
  };
}

/** Process-wide instances used by the access layer. */
export const publicLimiter = createLimiter();
export const streamGate = createStreamGate();
