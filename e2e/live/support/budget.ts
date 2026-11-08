import fs from 'node:fs';
import path from 'node:path';

/** The money guard and the shared-IP guard for scenario launches.
 *
 *  Every real LLM call the suite causes comes from a launched run, so a hard
 *  cap on launches caps the spend. Launches are also paced: the console and
 *  the playground both allow 5 launches per 600 s per IP, and that IP is
 *  shared with other test sessions, so the suite never launches faster than
 *  one per `paceSeconds`.
 *
 *  State lives in a small JSON file (the run directory), so it survives
 *  Playwright retries and worker restarts within one run. */

export class BudgetExceeded extends Error {}

export interface LaunchState {
  launches: number;
  lastLaunchAt: number | null;
}

export interface LaunchGuardOptions {
  stateFile: string;
  maxLaunches: number;
  paceSeconds: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function readState(file: string): LaunchState {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<LaunchState>;
    return {
      launches: Number.isInteger(s.launches) ? (s.launches as number) : 0,
      lastLaunchAt: typeof s.lastLaunchAt === 'number' ? s.lastLaunchAt : null,
    };
  } catch {
    return { launches: 0, lastLaunchAt: null };
  }
}

function writeState(file: string, s: LaunchState): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s));
  fs.renameSync(tmp, file);
}

export class LaunchGuard {
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: LaunchGuardOptions) {
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? realSleep;
  }

  state(): LaunchState {
    return readState(this.opts.stateFile);
  }

  /** Milliseconds until the next launch is allowed by the pace. */
  waitMs(): number {
    const { lastLaunchAt } = this.state();
    if (lastLaunchAt === null) return 0;
    return Math.max(0, lastLaunchAt + this.opts.paceSeconds * 1000 - this.now());
  }

  /** Wait for the pace, charge one launch, or throw when the cap is spent.
   *  Charges BEFORE the request, so a crash mid-request still counts. */
  async acquire(): Promise<number> {
    const before = this.state();
    if (before.launches >= this.opts.maxLaunches) {
      throw new BudgetExceeded(
        `launch budget spent: ${before.launches}/${this.opts.maxLaunches} (raise AITP_LIVE_MAX_LAUNCHES deliberately)`,
      );
    }
    const wait = this.waitMs();
    if (wait > 0) await this.sleep(wait);
    const next = { launches: before.launches + 1, lastLaunchAt: this.now() };
    writeState(this.opts.stateFile, next);
    return next.launches;
  }
}

/** Seconds from a `Retry-After` header (delta-seconds or HTTP date), or null. */
export function retryAfterSeconds(header: string | null | undefined, now = Date.now()): number | null {
  if (!header) return null;
  const t = header.trim();
  if (/^\d+$/.test(t)) return Number(t);
  const at = Date.parse(t);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

export type Layer429 = 'console' | 'playground';

/** Which layer answered a 429: the console's own limiter
 *  (`CONSOLE_RATE_LIMITED`, `src/lib/server/access.ts`) or the playground
 *  passed through (`run_rate_limited`, `max_concurrent_runs`, its token
 *  bucket or hourly cap). */
export function layerOf429(body: unknown): Layer429 {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  return b.code === 'CONSOLE_RATE_LIMITED' ? 'console' : 'playground';
}
