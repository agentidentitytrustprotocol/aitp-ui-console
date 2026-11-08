/** Console read limit, live: `read` is 300 per 60 s per client IP, kept in
 *  memory per Vercel instance (src/lib/server/limits.ts). Flood a public read
 *  until the console answers 429 CONSOLE_RATE_LIMITED with Retry-After. The
 *  flood is capped; instance fan-out can spread it, so the cap is 4x the
 *  limit. Runs once, first, then waits out the window for the specs after. */
import { expect, test } from '@playwright/test';
import { layerOf429, retryAfterSeconds } from './support/budget';
import { apiContext, record, sleep } from './support/fixtures';
import { intEnv } from './support/env';

const PATH = '/api/playground/health';

test('read flood gets a console 429 with Retry-After', async () => {
  test.setTimeout(5 * 60_000);
  const cap = intEnv(process.env, 'AITP_LIVE_READ_FLOOD_CAP', 1200, 301);
  const concurrency = 25;
  const req = await apiContext(false);
  const counts: Record<string, number> = {};
  let sent = 0;
  let first429: { index: number; status: number; code: unknown; retryAfter: string | null; limit: unknown } | null = null;
  let playground429 = 0;
  const started = Date.now();

  const worker = async () => {
    while (!first429 && sent < cap) {
      const index = ++sent;
      const r = await req.get(PATH, { failOnStatusCode: false }).catch(() => null);
      const status = r?.status() ?? 0;
      counts[status] = (counts[status] ?? 0) + 1;
      if (status === 429 && r) {
        const body = (await r.json().catch(() => null)) as { code?: unknown; limit?: unknown } | null;
        if (layerOf429(body) === 'console') {
          first429 ??= { index, status, code: body?.code, retryAfter: r.headers()['retry-after'] ?? null, limit: body?.limit };
        } else playground429++;
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  const seconds = (Date.now() - started) / 1000;
  record('limits.read', { path: PATH, sent, counts, first429, playground429, seconds });
  await req.dispose();

  expect(first429, `no console 429 within ${cap} reads (instance fan-out or limiter off)`).not.toBeNull();
  const hit = first429!;
  expect(hit.code).toBe('CONSOLE_RATE_LIMITED');
  expect(retryAfterSeconds(hit.retryAfter)).toBeGreaterThan(0);
  expect(hit.index).toBeGreaterThan(300 - concurrency); // not earlier than the limit allows on a fresh window

  // Let the read window clear before anything else runs from this IP.
  await sleep(65_000);
});
