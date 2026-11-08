/** Quota badge, live. Precondition (set by scripts/live/run-live.sh, never by
 *  this spec): the playground per-IP LLM quota is temporarily tiny
 *  (`quota-window.sh low`) and this IP is already past it. Launch an LLM
 *  scenario through the UI; the run falls back to mock responses and the run
 *  page shows the quota badge (src/components/runs/llm-quota-badge.tsx). */
import { expect, test } from '@playwright/test';
import { ConsoleApi } from './support/console-api';
import { launchGuard, ORIGIN, record, RUN_DIR, scenarioPath } from './support/fixtures';
import { classifyQuotaOutcome, failed, FILLER_TEXT } from './support/outcome';

const REF = process.env.AITP_LIVE_QUOTA_REF ?? 'intra-org/research-and-write@1.0.0';

test('the run page shows the quota badge when the LLM quota is spent', async ({ browser }) => {
  test.skip(process.env.AITP_LIVE_QUOTA_WINDOW !== 'low', 'needs the low-quota window (scripts/live/run-live.sh --full)');
  test.setTimeout(15 * 60_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const api = new ConsoleApi(page.request, ORIGIN);

  await launchGuard().acquire();
  await page.goto(scenarioPath(REF), { waitUntil: 'domcontentloaded' });
  const button = page.getByRole('button', { name: 'Run Scenario' });
  await button.waitFor({ timeout: 60_000 });
  for (const input of await page.locator('form input[type="text"][required]').all()) {
    if ((await input.inputValue()) === '') await input.fill(FILLER_TEXT);
  }
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/playground/runs'),
    button.click(),
  ]);
  expect(res.status(), 'launch accepted').toBe(202);
  const runId = String(((await res.json()) as { run_id?: unknown }).run_id);
  await page.waitForURL(/\/runs\/[^/]+$/);

  const status = await api.waitTerminal(runId, { deadline: Date.now() + 10 * 60_000 });
  const run = await api.run(runId);
  const ev = await api.events(runId);
  const bad = failed(classifyQuotaOutcome(run, ev.events));

  await page.reload({ waitUntil: 'networkidle' });
  const badge = page.getByRole('status').filter({ hasText: 'LLM quota reached: mock responses' });
  const visible = await badge
    .first()
    .waitFor({ timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  const text = visible ? await badge.first().innerText() : null;
  await page.screenshot({ path: `${RUN_DIR}/quota-badge.png`, fullPage: true });
  record('quota.badge', {
    ref: REF,
    runId,
    status,
    llm_quota_exceeded: run.llm_quota_exceeded,
    llm_quota: run.llm_quota,
    llm_calls_on_mock: run.llm_calls_on_mock,
    failedChecks: bad,
    badgeVisible: visible,
    badgeText: text,
  });
  expect(bad).toEqual([]);
  expect(visible, 'quota badge (role=status) on the run page').toBe(true);
  await ctx.close();
});
