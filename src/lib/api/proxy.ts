import { NextRequest } from 'next/server';
import { serverConfig } from '../config';

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
