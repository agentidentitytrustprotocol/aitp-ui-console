/** Console launch limit, live: `launch` is 5 per 600 s per client IP, per
 *  instance, charged when the console authorizes the call and before any
 *  upstream answer (src/lib/server/access.ts), so an upstream 429 still uses
 *  a token. Up to 8 back-to-back launches of a no-LLM scenario on one
 *  keep-alive context; pass on the first console 429 with Retry-After. A
 *  playground-layer 429 alone is environmental (shared IP / concurrency). */
import { expect, test } from '@playwright/test';
import { BudgetExceeded, layerOf429, retryAfterSeconds } from './support/budget';
import { ConsoleApi } from './support/console-api';
import { apiContext, launchGuard, ORIGIN, record } from './support/fixtures';

const REF = process.env.AITP_LIVE_RATELIMIT_REF ?? 'intra-org/spki-pinning@1.0.0';

test('back-to-back launches get a console 429 with Retry-After', async () => {
  test.setTimeout(5 * 60_000);
  const guard = launchGuard(0); // counted against the run cap, not paced
  const req = await apiContext(false);
  const api = new ConsoleApi(req, ORIGIN);
  const rows: { n: number; status: number; code: unknown; layer?: string; retryAfter: string | null; runId?: unknown }[] = [];
  let hit: (typeof rows)[number] | null = null;
  for (let n = 1; n <= 8 && !hit; n++) {
    try {
      await guard.acquire();
    } catch (e) {
      if (e instanceof BudgetExceeded) break;
      throw e;
    }
    const r = await api.launch(REF, {}, `live-launch-limit-${n}`);
    const code = (r.body as { code?: unknown } | null)?.code;
    const row = { n, status: r.status, code, retryAfter: r.retryAfter, runId: r.body?.run_id } as (typeof rows)[number];
    if (r.status === 429) {
      row.layer = layerOf429(r.body);
      if (row.layer === 'console') hit = row;
    }
    rows.push(row);
  }
  record('limits.launch', { ref: REF, rows, hit, launchBudget: guard.state() });
  await req.dispose();

  const playground = rows.filter((r) => r.layer === 'playground').length;
  expect(
    hit,
    `no console 429 in ${rows.length} launches (${playground} playground-layer 429s; instance fan-out => environmental)`,
  ).not.toBeNull();
  expect(hit!.code).toBe('CONSOLE_RATE_LIMITED');
  expect(retryAfterSeconds(hit!.retryAfter)).toBeGreaterThan(0);
});
