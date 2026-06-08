/** Tiny typed fetch wrappers for the BFF endpoints. */

const DEFAULT_TIMEOUT_MS = 30_000;

async function errorDetail(res: Response): Promise<string | undefined> {
  try {
    const text = await res.text();
    return text ? text.slice(0, 500) : undefined;
  } catch {
    return undefined;
  }
}

function failed(method: string, path: string, status: number, detail?: string): Error {
  return new Error(`${method} ${path} failed: ${status}${detail ? ` — ${detail}` : ''}`);
}

/** Merge an external signal (if any) with a timeout signal so requests
 *  can't hang the UI on a stuck network. The caller can still abort via
 *  init.signal (e.g. React Query). */
function timeoutSignal(external: AbortSignal | null | undefined, ms: number): AbortSignal {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('Timeout', 'TimeoutError')), ms);
  const cleanup = () => clearTimeout(timer);
  // Auto-cancel the timer when the merged signal aborts so we don't leak.
  ctrl.signal.addEventListener('abort', cleanup, { once: true });
  if (external) {
    if (external.aborted) ctrl.abort(external.reason);
    else external.addEventListener('abort', () => ctrl.abort(external.reason), { once: true });
  }
  return ctrl.signal;
}

function withSignal(init: RequestInit | undefined): RequestInit {
  return {
    cache: 'no-store',
    ...init,
    signal: timeoutSignal(init?.signal ?? null, DEFAULT_TIMEOUT_MS),
  };
}

export async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, withSignal(init));
  if (!res.ok) throw failed('GET', path, res.status, await errorDetail(res));
  return (await res.json()) as T;
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(
    path,
    withSignal({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (!res.ok) throw failed('POST', path, res.status, await errorDetail(res));
  return (await res.json()) as T;
}

export async function putJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(
    path,
    withSignal({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (!res.ok) throw failed('PUT', path, res.status, await errorDetail(res));
  return (await res.json()) as T;
}

export async function patchJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(
    path,
    withSignal({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (!res.ok) throw failed('PATCH', path, res.status, await errorDetail(res));
  return (await res.json()) as T;
}

export async function delJSON(path: string): Promise<void> {
  const res = await fetch(path, withSignal({ method: 'DELETE' }));
  if (!res.ok) throw failed('DELETE', path, res.status, await errorDetail(res));
}
