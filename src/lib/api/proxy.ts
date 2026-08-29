import { NextRequest } from 'next/server';
import { serverConfig } from '../config';
import type { Verdict } from '../types/cp';

export type Service = 'playground' | 'cp';

/** Default upstream timeout for non-SSE requests. Overridable per call;
 *  upstreams should always return inside this window, otherwise the UI
 *  would hang on dead/slow services. */
const DEFAULT_TIMEOUT_MS = 30_000;

function serviceBase(service: Service): string {
  return service === 'playground' ? serverConfig.playgroundUrl : serverConfig.cpUrl;
}

function serviceHeaders(service: Service): Record<string, string> {
  const key = service === 'playground' ? serverConfig.playgroundApiKey : serverConfig.cpApiKey;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) h['Authorization'] = `Bearer ${key}`;
  return h;
}

/** Combine the request's abort signal with a timeout signal so an idle
 *  upstream can't pin a route handler forever. Returns the merged signal
 *  plus a cleanup that clears the timeout when the fetch settles. */
function withTimeout(req: NextRequest, ms = DEFAULT_TIMEOUT_MS): {
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
    typeof (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any === 'function'
      ? (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any([
          req.signal,
          timeoutCtrl.signal,
        ])
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

function makeError(status: number, message: string, target: string): Response {
  return new Response(
    JSON.stringify({ error: message, target, upstream_status: status }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

/** Logged server-side so admins can debug; the client envelope intentionally
 *  carries only a fixed message + the request target. Raw error strings can
 *  include hostnames, file paths, or TLS detail we don't want to ship to the
 *  browser. */
function logUpstreamError(method: string, target: string, err: unknown): void {
  console.error(`[proxy] ${method} ${target} failed:`, err);
}

async function runProxy(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  target: string,
  service: Service,
  req: NextRequest,
  body?: string,
): Promise<Response> {
  const t = withTimeout(req);
  try {
    const init: RequestInit = {
      method,
      headers: serviceHeaders(service),
      signal: t.signal,
      cache: 'no-store',
    };
    if (body !== undefined) init.body = body;
    const res = await fetch(target, init);
    const data = await res.text();
    return new Response(emptyBodyStatus(res.status) ? null : data, {
      status: res.status,
      headers: {
        'Content-Type':
          method === 'GET'
            ? res.headers.get('Content-Type') ?? 'application/json'
            : 'application/json',
      },
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
 * `verify` may be async and may accept the merged abort/timeout signal —
 * some verifiers need a *second* upstream fetch to resolve what to check
 * against (e.g. Phase 4's Tier 1, which fetches the CP manifest to learn
 * the expected issuer before it can verify a revocation snapshot). That
 * second fetch must share this call's timeout budget, not open its own —
 * see `fetchUpstreamText`.
 */
export async function proxyGetVerified(
  service: Service,
  path: string,
  req: NextRequest,
  verify: (bodyText: string, signal: AbortSignal) => Verdict | Promise<Verdict>,
): Promise<Response> {
  const url = new URL(req.url);
  const target = `${serviceBase(service)}${path}${url.search}`;
  const t = withTimeout(req);
  try {
    const res = await fetch(target, {
      method: 'GET',
      headers: serviceHeaders(service),
      signal: t.signal,
      cache: 'no-store',
    });
    const text = await res.text();
    if (!res.ok) {
      return new Response(emptyBodyStatus(res.status) ? null : text, {
        status: res.status,
        headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
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
  }
}

/**
 * A raw upstream GET, sharing an already-merged abort/timeout signal
 * rather than opening a new timeout budget. For a `proxyGetVerified`
 * verify function that needs a *second* upstream resource to do its job —
 * that fetch must not extend the route past the caller's own timeout.
 */
export async function fetchUpstreamText(
  service: Service,
  path: string,
  signal: AbortSignal,
): Promise<{ status: number; text: string }> {
  const target = `${serviceBase(service)}${path}`;
  const res = await fetch(target, {
    method: 'GET',
    headers: serviceHeaders(service),
    signal,
    cache: 'no-store',
  });
  return { status: res.status, text: await res.text() };
}

export async function proxyPost(
  service: Service,
  path: string,
  req: NextRequest,
): Promise<Response> {
  const body = await req.text();
  const target = `${serviceBase(service)}${path}`;
  return runProxy('POST', target, service, req, body);
}

export async function proxyPut(
  service: Service,
  path: string,
  req: NextRequest,
): Promise<Response> {
  const body = await req.text();
  const target = `${serviceBase(service)}${path}`;
  return runProxy('PUT', target, service, req, body);
}

export async function proxyPatch(
  service: Service,
  path: string,
  req: NextRequest,
): Promise<Response> {
  const body = await req.text();
  const target = `${serviceBase(service)}${path}`;
  return runProxy('PATCH', target, service, req, body);
}

export async function proxyDelete(
  service: Service,
  path: string,
  req: NextRequest,
): Promise<Response> {
  const target = `${serviceBase(service)}${path}`;
  return runProxy('DELETE', target, service, req);
}

/** SSE proxy — streams the upstream SSE response body to the browser. */
export async function proxySse(
  service: Service,
  path: string,
  req: NextRequest,
): Promise<Response> {
  const url = new URL(req.url);
  const target = `${serviceBase(service)}${path}${url.search}`;
  try {
    const upstream = await fetch(target, {
      headers: { ...serviceHeaders(service), Accept: 'text/event-stream' },
      signal: req.signal,
      cache: 'no-store',
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    logUpstreamError('SSE', target, err);
    return makeError(502, 'Upstream unreachable', target);
  }
}
