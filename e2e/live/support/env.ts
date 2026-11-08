import { urlNeedles } from './leaks';

/** Gate and configuration for the live public-console suite.
 *
 *  The suite drives the PRODUCTION console, which launches real scenario
 *  runs on Railway, and those make real (paid) LLM calls. It must never run
 *  in CI and never by accident, so `assertLiveAllowed` refuses unless the
 *  caller opted in with `AITP_LIVE=1` and `CI` is unset or empty.
 *  `playwright.live.config.ts` calls it while loading, before any request.
 *
 *  Secrets arrive only through the environment (`scripts/live/run-live.sh`
 *  pipes them from Doppler) and are never logged: see `redact`. */

export const DEFAULT_CONSOLE_URL = 'https://console.agentidentitytrustprotocol.io';

export class LiveRefused extends Error {}

type Env = Record<string, string | undefined>;

export function assertLiveAllowed(env: Env = process.env): void {
  if ((env.CI ?? '') !== '') {
    throw new LiveRefused(
      'live public-console suite refused: CI is set. It spends money on a real LLM and must never run in CI.',
    );
  }
  if (env.AITP_LIVE !== '1') {
    throw new LiveRefused(
      'live public-console suite refused: set AITP_LIVE=1 (use scripts/live/run-live.sh, which also loads the secrets).',
    );
  }
}

export function consoleUrl(env: Env = process.env): string {
  const raw = (env.AITP_LIVE_CONSOLE_URL ?? '').trim() || DEFAULT_CONSOLE_URL;
  const u = new URL(raw);
  if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
    throw new LiveRefused(`AITP_LIVE_CONSOLE_URL must be https (got ${u.protocol})`);
  }
  return u.origin;
}

export function intEnv(env: Env, name: string, fallback: number, min = 0): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) {
    throw new LiveRefused(`${name} must be an integer >= ${min}`);
  }
  return n;
}

/** The operator password, or null (operator projects then skip). */
export function consolePassword(env: Env = process.env): string | null {
  const v = env.CONSOLE_PASSWORD ?? '';
  return v === '' ? null : v;
}

/** One leak needle: a label that is safe to print, and a value that is not. */
export interface Needle {
  label: string;
  value: string;
}

/** Needles from `AITP_LIVE_LEAK_NEEDLES`: one `LABEL=value` per line.
 *  `run-live.sh` builds it from Doppler (backend origins, hosts and keys). */
export function leakNeedles(env: Env = process.env): Needle[] {
  const raw = env.AITP_LIVE_LEAK_NEEDLES ?? '';
  const out: Needle[] = [];
  for (const line of raw.split('\n')) {
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const label = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    // A very short value would match innocently; refuse it rather than
    // produce a meaningless pass or a noisy fail.
    if (!label || value.length < 8) continue;
    // A backend base URL also yields its bare host (catches `//host`, `wss://host`).
    const fromUrl = /^https?:\/\//i.test(value) ? urlNeedles(label, value) : [];
    if (fromUrl.length > 0) out.push(...fromUrl);
    else out.push({ label, value });
  }
  return out;
}

/** Replace every needle value (and common secret shapes) in `text`. */
export function redact(text: string, needles: readonly Needle[] = leakNeedles()): string {
  let out = text;
  for (const n of needles) out = out.split(n.value).join(`<${n.label}>`);
  return out
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-<redacted>')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>');
}
