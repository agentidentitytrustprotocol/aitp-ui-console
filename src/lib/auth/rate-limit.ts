import { UNKNOWN_IP, rateLimitKey } from '../server/client-ip';

/** Sliding-window rate limiter keyed by client IP.
 *
 *  In-memory and per instance: on Vercel each function instance keeps its
 *  own window, so the effective limit across a cold-start burst can be a
 *  multiple of `limit`. That is acceptable for a single-region,
 *  single-operator console (`vercel.json` pins `iad1`); move to a shared
 *  store before running more than a handful of instances. */
export interface RateLimiter {
  /** Record one attempt for `key`. `allowed` is false once `limit`
   *  attempts already fall inside the window. */
  hit(
    key: string,
    now?: number,
  ): { allowed: boolean; retryAfterSeconds: number };
  reset(): void;
}

/** Upper bound on tracked keys, so a spray of spoofed or rotating IPs
 *  cannot grow the map without limit. Oldest keys are dropped first. */
const MAX_KEYS = 10_000;

export function createRateLimiter(
  limit: number,
  windowMs: number,
): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    hit(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((recent[0] + windowMs - now) / 1000),
        );
        return { allowed: false, retryAfterSeconds };
      }
      recent.push(now);
      hits.delete(key);
      hits.set(key, recent);
      if (hits.size > MAX_KEYS) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
    reset() {
      hits.clear();
    },
  };
}

/** The client IP from a platform-set header; see `src/lib/server/client-ip.ts`
 *  for the trust rules (rightmost `x-forwarded-for` on Vercel, `unknown`
 *  off Vercel unless `CONSOLE_CLIENT_IP_HEADER` names a trusted header). */
export { clientIp } from '../server/client-ip';

/** `POST /login`: 10 attempts per IP per minute; the 11th gets 429. */
export const loginLimiter = createRateLimiter(10, 60_000);

/** Callers whose IP is `unknown` (off Vercel without a trusted header)
 *  share one bucket with a higher cap: brute force stays bounded without
 *  locking out an operator behind one misconfigured proxy. */
export const UNKNOWN_IP_LOGIN_LIMIT = 50;
export const unknownIpLoginLimiter = createRateLimiter(
  UNKNOWN_IP_LOGIN_LIMIT,
  60_000,
);

/** Charge one login attempt for `ip` against the right limiter. IPv6
 *  callers are bucketed by /64 (`rateLimitKey`), so rotating addresses
 *  inside one allocation doesn't buy fresh attempts. */
export function hitLogin(
  ip: string,
  now?: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const key = rateLimitKey(ip);
  return key === UNKNOWN_IP
    ? unknownIpLoginLimiter.hit(key, now)
    : loginLimiter.hit(key, now);
}
