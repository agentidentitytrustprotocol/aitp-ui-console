import { NextRequest } from 'next/server';
import { serverConfig } from '../config';

export type Service = 'playground' | 'cp';

function serviceBase(service: Service): string {
  return service === 'playground' ? serverConfig.playgroundUrl : serverConfig.cpUrl;
}

function serviceHeaders(service: Service): Record<string, string> {
  const key = service === 'playground' ? serverConfig.playgroundApiKey : serverConfig.cpApiKey;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) h['Authorization'] = `Bearer ${key}`;
  return h;
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

export async function proxyGet(
  service: Service,
  path: string,
  req: NextRequest,
): Promise<Response> {
  const url = new URL(req.url);
  const target = `${serviceBase(service)}${path}${url.search}`;
  try {
    const res = await fetch(target, {
      headers: serviceHeaders(service),
      signal: req.signal,
      cache: 'no-store',
    });
    const data = await res.text();
    return new Response(emptyBodyStatus(res.status) ? null : data, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
      },
    });
  } catch (err) {
    logUpstreamError('GET', target, err);
    return makeError(502, 'Upstream unreachable', target);
  }
}

export async function proxyPost(
  service: Service,
  path: string,
  req: NextRequest,
): Promise<Response> {
  const body = await req.text();
  const target = `${serviceBase(service)}${path}`;
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: serviceHeaders(service),
      body,
      signal: req.signal,
      cache: 'no-store',
    });
    const data = await res.text();
    return new Response(emptyBodyStatus(res.status) ? null : data, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logUpstreamError('POST', target, err);
    return makeError(502, 'Upstream unreachable', target);
  }
}

export async function proxyPut(
  service: Service,
  path: string,
  req: NextRequest,
): Promise<Response> {
  const body = await req.text();
  const target = `${serviceBase(service)}${path}`;
  try {
    const res = await fetch(target, {
      method: 'PUT',
      headers: serviceHeaders(service),
      body,
      signal: req.signal,
      cache: 'no-store',
    });
    const data = await res.text();
    return new Response(emptyBodyStatus(res.status) ? null : data, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logUpstreamError('PUT', target, err);
    return makeError(502, 'Upstream unreachable', target);
  }
}

export async function proxyPatch(
  service: Service,
  path: string,
  req: NextRequest,
): Promise<Response> {
  const body = await req.text();
  const target = `${serviceBase(service)}${path}`;
  try {
    const res = await fetch(target, {
      method: 'PATCH',
      headers: serviceHeaders(service),
      body,
      signal: req.signal,
      cache: 'no-store',
    });
    const data = await res.text();
    return new Response(emptyBodyStatus(res.status) ? null : data, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logUpstreamError('PATCH', target, err);
    return makeError(502, 'Upstream unreachable', target);
  }
}

export async function proxyDelete(
  service: Service,
  path: string,
  req: NextRequest,
): Promise<Response> {
  const target = `${serviceBase(service)}${path}`;
  try {
    const res = await fetch(target, {
      method: 'DELETE',
      headers: serviceHeaders(service),
      signal: req.signal,
      cache: 'no-store',
    });
    const data = await res.text();
    return new Response(emptyBodyStatus(res.status) ? null : data, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logUpstreamError('DELETE', target, err);
    return makeError(502, 'Upstream unreachable', target);
  }
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
