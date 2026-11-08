import { defineConfig } from '@playwright/test';
import { assertLiveAllowed, consoleUrl } from './e2e/live/support/env';

/** Live public-console suite: drives the PRODUCTION console (and through it
 *  real Railway runs and a real LLM). Never runs in CI: this throws while the
 *  config loads when `CI` is set or `AITP_LIVE=1` is missing, before any
 *  request. Run it through `scripts/live/run-live.sh`, which loads secrets
 *  from Doppler and orchestrates the quota window. See
 *  internal_docs/TESTING.md § "Live public-console suite". */
assertLiveAllowed();

const runDir = process.env.AITP_LIVE_RUN_DIR ?? 'e2e/live/.evidence/adhoc';

export default defineConfig({
  testDir: './e2e/live',
  testMatch: '**/*.live.spec.ts',
  outputDir: `${runDir}/test-results`,
  // One IP, shared limits, real money: strictly serial, no retries (a retry
  // would re-launch a paid run; flakiness is classified, not hidden).
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 20 * 60_000,
  reporter: [['list'], ['json', { outputFile: `${runDir}/report.json` }]],
  use: {
    baseURL: consoleUrl(),
    browserName: 'chromium',
    headless: true,
    trace: 'off',
    screenshot: 'only-on-failure',
    // Identify the suite in console/playground logs.
    userAgent: 'aitp-console-live-suite/1 (playwright)',
  },
  projects: [
    { name: 'security', testMatch: 'security.live.spec.ts' },
    { name: 'read-limit', testMatch: 'read-limit.live.spec.ts' },
    { name: 'matrix-anon', testMatch: 'matrix.live.spec.ts', metadata: { auth: 'anon' } },
    { name: 'matrix-operator', testMatch: 'matrix.live.spec.ts', metadata: { auth: 'operator' } },
    { name: 'quota', testMatch: 'quota.live.spec.ts' },
    { name: 'launch-limit', testMatch: 'launch-limit.live.spec.ts' },
  ],
});
