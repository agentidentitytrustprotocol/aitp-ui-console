/** The public-console matrix, live: every playground scenario, launched
 *  through the console UI (scenario page -> "Run Scenario" -> /runs/{id}),
 *  run to a terminal state on Railway with the real LLM, then checked like
 *  aitp-playground `scripts/console_e2e.py` (`classify_outcome`). The
 *  project's metadata picks anonymous (public mode) or operator sessions.
 *  Launches are paced and capped by the shared LaunchGuard; one retry is
 *  allowed after a 429 or a timeout and is classified, never hidden. */
import { expect, test, type Page } from '@playwright/test';
import { BudgetExceeded, layerOf429, retryAfterSeconds, type Layer429 } from './support/budget';
import { ConsoleApi } from './support/console-api';
import { launchGuard, ORIGIN, record, scenarioPath, signIn, sleep } from './support/fixtures';
import { classifyFailure, classifyOutcome, expectationFor, failed, FILLER_TEXT, type Check, type Json } from './support/outcome';

const RUN_TIMEOUT_MS = 10 * 60_000;

interface Attempt {
  launchStatus: number;
  layer429?: Layer429;
  retryAfter?: number | null;
  runId?: string;
  status?: string | null;
  timedOut?: boolean;
  failedChecks?: Check[];
  eventsComplete?: boolean;
  eventCount?: number;
  llmCompletes?: number;
}

/** Fill required text inputs the UI leaves empty (run-input-form.tsx gives
 *  them ''), the same filler the reference tool uses. */
async function fillRequired(page: Page, detail: Json): Promise<string[]> {
  const schema = ((detail.spec as Json | undefined)?.inputs as Json | undefined)?.schema as
    | { properties?: Record<string, { type?: string; default?: unknown; enum?: unknown[] }>; required?: string[] }
    | undefined;
  const filled: string[] = [];
  for (const key of schema?.required ?? []) {
    const def = schema?.properties?.[key];
    if (!def || def.default !== undefined || def.enum?.length) continue;
    if (def.type && def.type !== 'string') continue;
    const input = page.locator(`#run-input-${key}`);
    if ((await input.count()) && (await input.inputValue()) === '') {
      await input.fill(FILLER_TEXT);
      filled.push(key);
    }
  }
  return filled;
}

async function attempt(page: Page, api: ConsoleApi, ref: string, detail: Json): Promise<Attempt> {
  await page.goto(scenarioPath(ref), { waitUntil: 'domcontentloaded' });
  const button = page.getByRole('button', { name: 'Run Scenario' });
  await button.waitFor({ timeout: 60_000 });
  await fillRequired(page, detail);
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/playground/runs', {
      timeout: 60_000,
    }),
    button.click(),
  ]);
  const a: Attempt = { launchStatus: res.status() };
  if (res.status() === 429) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    a.layer429 = layerOf429(body);
    a.retryAfter = retryAfterSeconds(res.headers()['retry-after']);
    return a;
  }
  if (res.status() !== 202 && res.status() !== 200) return a;
  a.runId = String(((await res.json()) as Json).run_id ?? '');
  await page.waitForURL(/\/runs\/[^/]+$/, { timeout: 30_000 });

  const deadline = Date.now() + RUN_TIMEOUT_MS;
  a.status = await api.waitTerminal(a.runId, { deadline });
  a.timedOut = !a.status || !['success', 'failed', 'cancelled'].includes(a.status);
  const run = await api.run(a.runId);
  const ev = await api.events(a.runId);
  a.eventsComplete = ev.complete;
  a.eventCount = ev.events.length;
  a.llmCompletes = ev.events.filter((e) => e.type === 'llm.complete').length;
  a.failedChecks = failed(classifyOutcome(run, ev.events, expectationFor(ref, detail)));
  if (!ev.complete) a.failedChecks.push({ name: 'event replay complete', ok: false, detail: { error: ev.error } });
  return a;
}

test('every scenario runs end to end through the console', async ({ browser }, testInfo) => {
  const auth = (testInfo.project.metadata as { auth?: string }).auth === 'operator' ? 'operator' : 'anon';
  test.skip(auth === 'operator' && !process.env.CONSOLE_PASSWORD, 'no operator password');

  const ctx = await browser.newContext();
  if (auth === 'operator') await signIn(ctx);
  const page = await ctx.newPage();
  const api = new ConsoleApi(page.request, ORIGIN);
  const session = await api.session();
  expect(session).toMatchObject({ publicMode: true, signedIn: auth === 'operator' });

  const only = (process.env.AITP_LIVE_REFS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const refs = (await api.scenarios()).filter((r) => only.length === 0 || only.includes(r));
  record(`matrix.${auth}.scenarios`, { count: refs.length, refs });
  expect(refs.length).toBeGreaterThan(0);
  test.setTimeout(refs.length * 2 * 15 * 60_000);

  const guard = launchGuard();
  const summary: Record<string, string> = {};
  for (const ref of refs) {
    await test.step(`${auth} ${ref}`, async () => {
      const detail = await api.scenario(ref);
      const attempts: Attempt[] = [];
      let result: 'pass' | 'real' | 'flaky' | 'environmental' | 'budget' = 'real';
      for (let n = 0; n < 2; n++) {
        try {
          await guard.acquire();
        } catch (e) {
          if (!(e instanceof BudgetExceeded)) throw e;
          result = 'budget';
          break;
        }
        const a = await attempt(page, api, ref, detail);
        attempts.push(a);
        const ok = !!a.runId && !a.timedOut && (a.failedChecks?.length ?? 1) === 0;
        if (ok) {
          result = n === 0 ? 'pass' : 'flaky';
          break;
        }
        result = classifyFailure({ checks: a.failedChecks, http429Layer: a.layer429 ?? null, timedOut: a.timedOut });
        // Retry once only for a 429 (after Retry-After) or a timeout.
        if (a.layer429) await sleep(Math.min((a.retryAfter ?? 60) * 1000, 600_000));
        else if (!a.timedOut) break;
      }
      summary[ref] = result;
      record(`matrix.${auth}.run`, { ref, result, attempts });
      expect.soft(result === 'pass' || result === 'flaky' ? 'pass' : result, `${auth} ${ref}`).toBe('pass');
    });
  }
  record(`matrix.${auth}.summary`, { summary, launchBudget: guard.state() });
  await ctx.close();
});
