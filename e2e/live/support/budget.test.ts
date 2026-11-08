/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BudgetExceeded, LaunchGuard, layerOf429, readState, retryAfterSeconds } from './budget';

function tmpFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'live-budget-')), 'state.json');
}

describe('LaunchGuard', () => {
  it('charges launches and refuses past the cap before any request', async () => {
    const file = tmpFile();
    let t = 1_000_000;
    const g = new LaunchGuard({ stateFile: file, maxLaunches: 2, paceSeconds: 0, now: () => t });
    await expect(g.acquire()).resolves.toBe(1);
    t += 1;
    await expect(g.acquire()).resolves.toBe(2);
    await expect(g.acquire()).rejects.toBeInstanceOf(BudgetExceeded);
    expect(readState(file).launches).toBe(2);
  });

  it('waits for the pace between launches', async () => {
    const file = tmpFile();
    let t = 0;
    const slept: number[] = [];
    const g = new LaunchGuard({
      stateFile: file,
      maxLaunches: 5,
      paceSeconds: 125,
      now: () => t,
      sleep: async (ms) => {
        slept.push(ms);
        t += ms;
      },
    });
    await g.acquire();
    t += 25_000;
    await g.acquire();
    expect(slept).toEqual([100_000]);
  });

  it('persists across guard instances (retries / worker restarts)', async () => {
    const file = tmpFile();
    await new LaunchGuard({ stateFile: file, maxLaunches: 1, paceSeconds: 0 }).acquire();
    await expect(new LaunchGuard({ stateFile: file, maxLaunches: 1, paceSeconds: 0 }).acquire()).rejects.toBeInstanceOf(
      BudgetExceeded,
    );
  });

  it('treats a corrupt state file as empty', () => {
    const file = tmpFile();
    fs.writeFileSync(file, '{not json');
    expect(readState(file)).toEqual({ launches: 0, lastLaunchAt: null });
  });
});

describe('retryAfterSeconds', () => {
  it('parses delta seconds and HTTP dates', () => {
    expect(retryAfterSeconds('587')).toBe(587);
    const now = Date.parse('2026-11-08T00:00:00Z');
    expect(retryAfterSeconds('Sun, 08 Nov 2026 00:00:30 GMT', now)).toBe(30);
    expect(retryAfterSeconds('soon')).toBeNull();
    expect(retryAfterSeconds(null)).toBeNull();
  });
});

describe('layerOf429', () => {
  it('tells the console limiter from the playground', () => {
    expect(layerOf429({ code: 'CONSOLE_RATE_LIMITED' })).toBe('console');
    expect(layerOf429({ code: 'run_rate_limited' })).toBe('playground');
    expect(layerOf429({ detail: 'rate limit exceeded' })).toBe('playground');
    expect(layerOf429(null)).toBe('playground');
  });
});
