import { NextRequest } from 'next/server';
import { serverConfig } from '../config';
import { matchRoute, type AllowEntry, type Method } from '../server/allowlist';
import { UNKNOWN_IP, clientIp } from '../server/client-ip';
import { authorizeUpstream } from '../server/access';
import { isPublicMode } from '../server/public-mode';
import type { Verdict } from '../types/cp';

export type Service = 'playground' | 'cp';

/** Default upstream timeout for non-SSE requests. Overridable per call;
 *  upstreams should always return inside this window, otherwise the UI
 *  would hang on dead/slow services. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Fallback-to-admin log lines are throttled per reason, so a missing or
 *  rotated read key can't flood the logs at request rate. */
const FALLBACK_LOG_INTERVAL_MS = 10 * 60_000;

function serviceBase(service: Service): string {
  return service === 'playground'
    ? serverConfig.playgroundUrl
    : serverConfig.cpUrl;
}

// ---------------------------------------------------------------------------
// Upstream credentials and headers
// ---------------------------------------------------------------------------

/** Which CP credential a call uses (D-B in the lockdown plan):
 *  - `none`: a keyless CP route (health, readyz, the public manifest);
 *  - `admin`: `CP_API_KEY`;
 *  - `read`: `CP_READ_API_KEY`, with `fallback` saying whether a 401 or a
 *    `403 READ_ONLY_KEY` may be retried once with the admin key;
 *  - `unavailable`: an anonymous read with no usable read key (503);
 *  - `forbidden`: an anonymous caller on an admin-class route.
 *    `authorizeUpstream` refuses these before any fetch; this is the
 *    backstop that keeps the admin key from ever being sent on an
 *    anonymous request. */
type CpKeyPlan =
  | { kind: 'none' }
  | { kind: 'admin' }
  | { kind: 'read'; fallback: boolean }
  | { kind: 'unavailable' }
  | { kind: 'forbidden' };

const lastFallbackLog = new Map<string, number>();

function logFallback(reason: string, now = Date.now()): void {
  const last = lastFallbackLog.get(reason);
  if (last !== undefined && now - last < FALLBACK_LOG_INTERVAL_MS) return;
  lastFallbackLog.set(reason, now);
  // Names the reason only; never a key, a key length or a header value.
  console.warn(`[proxy] CP read key fallback to admin: ${reason}`);
}

/** Test hook: forget the fallback-log throttle. */
export function resetFallbackLogThrottle(): void {
  lastFallbackLog.clear();
}

function planCpKey(entry: AllowEntry | null, operator: boolean): CpKeyPlan {
  // Anything unmatched is admin-class.
  const cls = entry?.cpKey ?? 'admin';
  if (cls === 'none') return { kind: 'none' };
  if (cls === 'admin')
    return operator ? { kind: 'admin' } : { kind: 'forbidden' };
  const hasReadKey = serverConfig.cpReadApiKey !== '';
  if (!operator) {
    return hasReadKey
      ? { kind: 'read', fallback: false }
      : { kind: 'unavailable' };
  }
  // Operators in public mode use admin so they never share the read-key
  // bucket (and the CP's SSE sub-cap) with anonymous visitors.
  if (isPublicMode()) return { kind: 'admin' };
  if (!hasReadKey) {
    logFallback('read_key_unset');
    return { kind: 'admin' };
  }
  return { kind: 'read', fallback: true };
}

/** Headers for one upstream call, always built from scratch: nothing the
 *  browser sent (`authorization`, `x-api-key`, `x-aitp-client-ip`, cookies)
 *  is ever forwarded. The client IP comes from platform-set headers only
 *  (`src/lib/server/client-ip.ts`) and is omitted when unknown. */
function upstreamHeaders(
  service: Service,
  key: string,
  req: NextRequest,
  accept?: string,
): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accept) h['Accept'] = accept;
  if (key) {
    if (service === 'playground') h['x-api-key'] = key;
    else h['Authorization'] = `Bearer ${key}`;
  }
  const ip = clientIp(req.headers);
  if (ip !== UNKNOWN_IP) h['X-AITP-Client-IP'] = ip;
  return h;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function discardBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // Already consumed or errored: nothing left to release.
  }
}

function isReadOnlyKeyError(text: string): boolean {
  try {
    const body = JSON.parse(text) as unknown;
    return (
      typeof body === 'object' &&
      body !== null &&
      (body as { code?: unknown }).code === 'READ_ONLY_KEY'
    );
  } catch {
    return false;
  }
}

const READ_KEY_UNAVAILABLE = {
  error: 'Control-plane read access is not configured',
  code: 'cp_read_key_unavailable',
};

export interface UpstreamInit {
  body?: string;
  accept?: string;
  signal: AbortSignal;
  operator: boolean;
}

/**
 * One upstream fetch with the right credentials, including the CP read-key
 * fallback. Every helper goes through here.
 *
 * - Playground: `x-api-key: PLAYGROUND_API_KEY` (never Bearer).
 * - CP: the key class comes from the allowlist entry for the method and
 *   pathname actually being fetched. A read with the read key retries once
 *   with admin on 401 or `403 READ_ONLY_KEY`, for operators only; the first
 *   body is cancelled before the retry. An anonymous read never gets admin:
 *   no read key, or a 401 to it, is 503 `cp_read_key_unavailable`, and a
 *   403 is relayed as is.
 *
 * Redirects are never followed (`redirect: 'manual'`): fetch drops
 * `Authorization` on a cross-origin redirect but not `x-api-key`, and a
 * followed redirect would also carry a key chosen for the original path to
 * another one. A 3xx is relayed like any other non-2xx, without `Location`.
 *
 * Module-private on purpose: it does no access check of its own, so only
 * the helpers below (which authorize first) may call it. Tests reach it
 * through `__testing`.
 *
 * Resolves to the upstream response (or a synthesized one); rejects only
 * when fetch itself rejects, which callers map to 502/504.
 */
async function upstreamFetch(
  service: Service,
  method: Method,
  target: string,
  req: NextRequest,
  init: UpstreamInit,
): Promise<Response> {
  const send = (key: string) => {
    const ri: RequestInit = {
      method,
      headers: upstreamHeaders(service, key, req, init.accept),
      signal: init.signal,
      cache: 'no-store',
      redirect: 'manual',
    };
    if (init.body !== undefined) ri.body = init.body;
    return fetch(target, ri);
  };

  if (service === 'playground') return send(serverConfig.playgroundApiKey);

  const entry = matchRoute('cp', method, new URL(target).pathname);
  const plan = planCpKey(entry, init.operator);
  switch (plan.kind) {
    case 'none':
      return send('');
    case 'admin':
      return send(serverConfig.cpApiKey);
    case 'unavailable':
      return jsonResponse(503, READ_KEY_UNAVAILABLE);
    case 'forbidden':
      return jsonResponse(403, {
        error: 'Operator session required',
        code: 'CONSOLE_OPERATOR_SESSION_REQUIRED',
      });
  }

  const first = await send(serverConfig.cpReadApiKey);
  if (first.status === 401) {
    await discardBody(first);
    if (!plan.fallback) return jsonResponse(503, READ_KEY_UNAVAILABLE);
    logFallback('read_key_rejected_401');
    return send(serverConfig.cpApiKey);
  }
  if (first.status === 403) {
    const text = await first.text();
    if (plan.fallback && isReadOnlyKeyError(text)) {
      // The console's read table and the CP's allowlist have drifted.
      logFallback('read_only_key_403');
      return send(serverConfig.cpApiKey);
    }
    return new Response(text, { status: 403, headers: errorHeaders(first) });
  }
  return first;
}

// ---------------------------------------------------------------------------
// Response shaping
// ---------------------------------------------------------------------------

/** Combine the request's abort signal with a timeout signal so an idle
 *  upstream can't pin a route handler forever. Returns the merged signal
 *  plus a cleanup that clears the timeout when the fetch settles. */
function withTimeout(
  req: NextRequest,
  ms = DEFAULT_TIMEOUT_MS,
): {
  signal: AbortSignal;
  cancel: () => void;
  isTimeout: () => boolean;
} {
  const timeoutCtrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    timeoutCtrl.abort();
  }, ms);
  const signal =
    typeof (
      AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }
    ).any === 'function'
      ? (
          AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }
        ).any([req.signal, timeoutCtrl.signal])
      : timeoutCtrl.signal;
  return {
    signal,
    cancel: () => clearTimeout(timer),
    isTimeout: () => timedOut,
  };
}

function emptyBodyStatus(status: number): boolean {
  // Per the fetch spec, these statuses MUST have a null body — passing a
  // string (even '') to `new Response(...)` throws a TypeError.
  return status === 204 || status === 205 || status === 304;
}

/** Response headers for a non-2xx upstream: its own `Content-Type` (so a
 *  JSON error stays JSON) and its `Retry-After` (so a 429 or 503 tells the
 *  browser when to come back). Nothing else is relayed. */
function errorHeaders(res: Response): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
  };
  const retryAfter = res.headers.get('Retry-After');
  if (retryAfter) h['Retry-After'] = retryAfter;
  return h;
}

/** The part of an upstream URL the browser may see: path and query only.
 *  The upstream origin (Railway hostname, port) never leaves the server;
 *  in public mode it would tell anonymous visitors where the backends are. */
function clientTarget(target: string): string {
  // Strip the configured base first, so a base with a path prefix
  // (`https://host/prefix`) doesn't leak the prefix either. The longest
  // matching base wins and must end on a path boundary, so one base being a
  // string prefix of the other (`http://h:4000` vs `http://h:40001`) can't
  // leave a fragment of the longer one behind.
  let best = '';
  for (const base of [serverConfig.playgroundUrl, serverConfig.cpUrl]) {
    const b = base.replace(/\/+$/, '');
    if (!b || b.length <= best.length || !target.startsWith(b)) continue;
    const next = target.charAt(b.length);
    if (next === '' || next === '/' || next === '?') best = b;
  }
  if (best) {
    // A trailing-slash base yields `//path` upstream; show it as `/path`.
    const rest = target.slice(best.length).replace(/^\/+/, '/');
    return rest === '' ? '/' : rest.startsWith('?') ? `/${rest}` : rest;
  }
  try {
    const u = new URL(target);
    return `${u.pathname}${u.search}`;
  } catch {
    return '';
  }
}

function makeError(status: number, message: string, target: string): Response {
  return new Response(
    JSON.stringify({
      error: message,
      target: clientTarget(target),
      upstream_status: status,
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

/** Logged server-side so admins can debug; the client envelope intentionally
 *  carries only a fixed message + the upstream path (never its origin). Raw error strings can
 *  include hostnames, file paths, or TLS detail we don't want to ship to the
 *  browser. */
function logUpstreamError(method: string, target: string, err: unknown): void {
  console.error(`[proxy] ${method} ${target} failed:`, err);
}

/** Authorize, then (only if allowed) read the request body and fetch.
 *  The body is read after the access check so a refused request never
 *  has its body consumed. */
async function runProxy(
  method: Method,
  target: string,
  service: Service,
  req: NextRequest,
  withBody = false,
): Promise<Response> {
  const access = await authorizeUpstream(service, method, target, req);
  if (!access.ok) return access.response;
  const body = withBody ? await req.text() : undefined;
  const t = withTimeout(req);
  try {
    const res = await upstreamFetch(service, method, target, req, {
      body,
      signal: t.signal,
      operator: access.operator,
    });
    const data = await res.text();
    const headers = res.ok
      ? {
          'Content-Type':
            method === 'GET'
              ? (res.headers.get('Content-Type') ?? 'application/json')
              : 'application/json',
        }
      : errorHeaders(res);
    return new Response(emptyBodyStatus(res.status) ? null : data, {
      status: res.status,
      headers,
    });
  } catch (err) {
    if (t.isTimeout()) {
      logUpstreamError(method, target, 'upstream timeout');
      return makeError(504, 'Upstream timeout', target);
    }
    logUpstreamError(method, target, err);
    return makeError(502, 'Upstream unreachable', target);
  } finally {
    t.cancel();
    access.release();
  }
}

export async function proxyGet(
  service: Service,
  path: string,
  req: NextRequest,
): Promise<Response> {
  const url = new URL(req.url);
  const target = `${serviceBase(service)}${path}${url.search}`;
  return runProxy('GET', target, service, req);
}

/** Splice a `_verification` key into a raw JSON object's text without
 *  reparsing and re-emitting the rest of it. Verification runs on the
 *  exact upstream bytes; the response the browser receives must embed
 *  those same bytes, or the proxy would verify one byte sequence and
 *  display another. `JSON.parse` → add key → `JSON.stringify` risks
 *  reordering keys or changing whitespace even when semantically
 *  equivalent — this string-splices onto the raw text instead.
 *
 *  Falls back to wrapping the raw text when it doesn't look like a JSON
 *  object at all (e.g. a genuinely malformed upstream body) — there's
 *  nothing to splice into, but the verdict must not be lost. */
function spliceVerification(rawText: string, verdict: Verdict): string {
  const trimmed = rawText.trim();
  if (trimmed.endsWith('}')) {
    return `${trimmed.slice(0, -1)},"_verification":${JSON.stringify(verdict)}}`;
  }
  return JSON.stringify({ _verification: verdict, _raw: rawText });
}

/**
 * Like `proxyGet`, but for CP-signed artifacts: runs `verify` against the
 * exact upstream response text and attaches the result as `_verification`,
 * server-side, never in the browser (the browser is where an attacker who
 * can serve the page can also serve a verifier that always returns true).
 *
 * Verification only applies to a successful fetch — a non-2xx or
 * unreachable upstream is a connectivity problem, not a signature problem,
 * and is proxied through exactly like `proxyGet` would.
 *
 * `verify` may be async and receives the merged abort/timeout signal, so
 * any work it awaits is cancelled with the request and can't run past this
 * call's timeout budget. It gets no way to fetch upstream itself: every
 * upstream call goes through a helper that picks its credentials (and, in
 * public mode, authorizes it) from the route being fetched.
 */
export async function proxyGetVerified(
  service: Service,
  path: string,
  req: NextRequest,
  verify: (bodyText: string, signal: AbortSignal) => Verdict | Promise<Verdict>,
): Promise<Response> {
  const url = new URL(req.url);
  const target = `${serviceBase(service)}${path}${url.search}`;
  const access = await authorizeUpstream(service, 'GET', target, req);
  if (!access.ok) return access.response;
  const t = withTimeout(req);
  try {
    const res = await upstreamFetch(service, 'GET', target, req, {
      signal: t.signal,
      operator: access.operator,
    });
    const text = await res.text();
    if (!res.ok) {
      return new Response(emptyBodyStatus(res.status) ? null : text, {
        status: res.status,
        headers: errorHeaders(res),
      });
    }
    const verdict = await verify(text, t.signal);
    return new Response(spliceVerification(text, verdict), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (t.isTimeout()) {
      logUpstreamError('GET', target, 'upstream timeout');
      return makeError(504, 'Upstream timeout', target);
    }
    logUpstreamError('GET', target, err);
    return makeError(502, 'Upstream unreachable', target);
  } finally {
    t.cancel();
    access.release();
  }
}

export async function proxyPost(
  service: Service,
  path: string,
  req: NextRequest,
): Promise<Response> {
  const target = `${serviceBase(service)}${path}`;
  return runProxy('POST', target, service, req, true);
}

export async function proxyPut(
  service: Service,
  path: string,
  req: NextRequest,
): Promise<Response> {
  const target = `${serviceBase(service)}${path}`;
  return runProxy('PUT', target, service, req, true);
}

export async function proxyPatch(
  service: Service,
  path: string,
  req: NextRequest,
): Promise<Response> {
  const target = `${serviceBase(service)}${path}`;
  return runProxy('PATCH', target, service, req, true);
}

export async function proxyDelete(
  service: Service,
  path: string,
  req: NextRequest,
): Promise<Response> {
  const target = `${serviceBase(service)}${path}`;
  return runProxy('DELETE', target, service, req);
}

/** SSE proxy — streams the upstream SSE response body to the browser.
 *  The read-key fallback runs before streaming starts (the status is known
 *  before the body is read). A non-2xx upstream is relayed as an ordinary
 *  response with its own Content-Type and Retry-After, not as an event
 *  stream, so the browser's probe can read the error and back off. */
export async function proxySse(
  service: Service,
  path: string,
  req: NextRequest,
): Promise<Response> {
  const url = new URL(req.url);
  const target = `${serviceBase(service)}${path}${url.search}`;
  const access = await authorizeUpstream(service, 'GET', target, req);
  if (!access.ok) return access.response;
  // From here on the stream slot (public mode) must be released exactly
  // once: on a non-2xx, on a fetch error, or when the stream ends, is
  // cancelled by the browser, errors, or the request aborts.
  try {
    const upstream = await upstreamFetch(service, 'GET', target, req, {
      accept: 'text/event-stream',
      signal: req.signal,
      operator: access.operator,
    });
    if (!upstream.ok || !upstream.body) {
      access.release();
      const text = await upstream.text();
      return new Response(emptyBodyStatus(upstream.status) ? null : text, {
        status: upstream.status,
        headers: errorHeaders(upstream),
      });
    }
    return new Response(
      releasingStream(upstream.body, access.release, req.signal),
      {
        status: upstream.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      },
    );
  } catch (err) {
    access.release();
    logUpstreamError('SSE', target, err);
    return makeError(502, 'Upstream unreachable', target);
  }
}

/** Pass `body` through, calling `release` once when it ends, errors, is
 *  cancelled by the consumer, or `signal` aborts. */
function releasingStream(
  body: ReadableStream<Uint8Array>,
  release: () => void,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let released = false;
  const done = () => {
    if (released) return;
    released = true;
    signal.removeEventListener('abort', onAbort);
    release();
  };
  const onAbort = () => {
    done();
    reader.cancel().catch(() => {});
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort, { once: true });
  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      try {
        const r = await reader.read();
        if (r.done) {
          done();
          ctrl.close();
        } else ctrl.enqueue(r.value);
      } catch (err) {
        done();
        ctrl.error(err);
      }
    },
    async cancel(reason) {
      done();
      await reader.cancel(reason).catch(() => {});
    },
  });
}

/** Test-only access to module internals. Not for application code: a
 *  route calling these would bypass the access check. */
export const __testing = { upstreamFetch };
