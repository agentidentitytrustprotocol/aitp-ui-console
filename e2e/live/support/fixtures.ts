/** Shared plumbing for the live specs: evidence log, launch guard, sign-in,
 *  and a network recorder that checks hosts, headers and bodies for leaks.
 *  Evidence is redacted before it is written (labels, never values). */
import fs from 'node:fs';
import path from 'node:path';
import { request as pwRequest, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { LaunchGuard } from './budget';
import { ConsoleApi, SESSION_COOKIE } from './console-api';
import { consolePassword, consoleUrl, intEnv, leakNeedles, redact, type Needle } from './env';
import { byDesign, findLeaks, type NetworkFinding } from './leaks';

export type { NetworkFinding };

export const ORIGIN = consoleUrl();
export const NEEDLES: Needle[] = leakNeedles();
export const RUN_DIR = process.env.AITP_LIVE_RUN_DIR ?? 'e2e/live/.evidence/adhoc';
fs.mkdirSync(RUN_DIR, { recursive: true });

/** Append one redacted JSON line to the run's evidence log. */
export function record(item: string, data: Record<string, unknown>): void {
  const line = redact(JSON.stringify({ at: new Date().toISOString(), item, ...data }), NEEDLES);
  fs.appendFileSync(path.join(RUN_DIR, 'evidence.jsonl'), line + '\n');
}

const STATE_FILE = path.join(RUN_DIR, 'launch-budget.json');

/** Every paid launch in the run goes through this (paced, capped, persisted). */
export function launchGuard(paceSeconds = intEnv(process.env, 'AITP_LIVE_PACE_SECONDS', 180)): LaunchGuard {
  return new LaunchGuard({
    stateFile: STATE_FILE,
    maxLaunches: intEnv(process.env, 'AITP_LIVE_MAX_LAUNCHES', 80, 1),
    paceSeconds,
  });
}

/** Sign a browser context in through `POST /login` (its request shares the
 *  context's cookie jar). Returns false when no password is configured. */
export async function signIn(ctx: BrowserContext): Promise<boolean> {
  const pw = consolePassword();
  if (!pw) return false;
  const status = await new ConsoleApi(ctx.request, ORIGIN).login(pw);
  const cookies = await ctx.cookies(ORIGIN);
  if (!cookies.some((c) => c.name === SESSION_COOKIE)) throw new Error(`login failed: HTTP ${status}, no session cookie`);
  return true;
}

/** A standalone request context (own cookie jar), optionally signed in. */
export async function apiContext(signedIn: boolean): Promise<APIRequestContext> {
  const req = await pwRequest.newContext({ baseURL: ORIGIN, userAgent: 'aitp-console-live-suite/1 (playwright)' });
  if (signedIn) {
    const pw = consolePassword();
    if (!pw) throw new Error('CONSOLE_PASSWORD is not set');
    const status = await new ConsoleApi(req, ORIGIN).login(pw);
    if (status >= 400) throw new Error(`login failed: HTTP ${status}`);
  }
  return req;
}

const TEXT_TYPES = /json|javascript|text\/(html|plain|css|x-component)|xml/i;

/** Record every request the context makes: hosts other than the console's,
 *  and needle hits in URLs, request headers/bodies, response headers and
 *  (non-streaming text) response bodies. Call `settle()` before reading. */
export function recordNetwork(ctx: BrowserContext) {
  const origin = new URL(ORIGIN);
  const findings: NetworkFinding[] = [];
  const hosts = new Set<string>();
  const pending: Promise<void>[] = [];
  let requests = 0;
  const push = (f: NetworkFinding) => {
    const why = byDesign(f);
    findings.push(why ? { ...f, byDesign: why } : f);
  };
  const leak = (where: string, text: string) => {
    const labels = findLeaks(text, NEEDLES);
    if (labels.length) push({ kind: 'leak', where, labels });
  };
  ctx.on('request', (req) => {
    requests++;
    const u = new URL(req.url());
    if (u.protocol === 'data:' || u.protocol === 'blob:') return;
    hosts.add(u.host);
    const where = `${req.method()} ${u.pathname}`;
    if (u.host !== origin.host) push({ kind: 'foreign-host', where: `${req.method()} ${u.host}${u.pathname}` });
    leak(`${where} [url]`, req.url());
    leak(`${where} [request headers]`, JSON.stringify(req.headers()));
    const body = req.postData();
    if (body) leak(`${where} [request body]`, body);
  });
  ctx.on('response', (res) => {
    const u = new URL(res.url());
    if (u.protocol === 'data:' || u.protocol === 'blob:') return;
    const where = `${res.request().method()} ${u.pathname} ${res.status()}`;
    const headers = res.headers();
    leak(`${where} [response headers]`, JSON.stringify(headers));
    const ct = headers['content-type'] ?? '';
    if (TEXT_TYPES.test(ct) && !/event-stream/i.test(ct)) {
      pending.push(
        res
          .text()
          .then((t) => leak(`${where} [response body]`, t))
          .catch(() => undefined),
      );
    }
  });
  return {
    findings,
    hosts,
    get requests() {
      return requests;
    },
    async settle() {
      await Promise.all(pending.splice(0));
    },
  };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `/scenarios/<pack>/<name>@<v>` page path for a ref. */
export const scenarioPath = (ref: string) => '/scenarios/' + ref.split('/').map(encodeURIComponent).join('/');
