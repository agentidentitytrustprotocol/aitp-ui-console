/** Tiny typed fetch wrappers for the BFF endpoints. */

const DEFAULT_TIMEOUT_MS = 30_000;

/** How much of a non-ok response body we keep. Anything longer is sliced —
 *  and the fact that it was sliced is carried on the thrown error, so no
 *  caller can render a cut body as if it were complete. */
export const MAX_ERROR_BODY_CHARS = 500;

interface ErrorBody {
  text: string | undefined;
  truncated: boolean;
}

async function errorDetail(res: Response): Promise<ErrorBody> {
  try {
    const text = await res.text();
    if (!text) return { text: undefined, truncated: false };
    return {
      text: text.slice(0, MAX_ERROR_BODY_CHARS),
      truncated: text.length > MAX_ERROR_BODY_CHARS,
    };
  } catch {
    return { text: undefined, truncated: false };
  }
}

/**
 * A non-ok response from a BFF route, carrying the pieces a caller needs in
 * order to tell one failure from another.
 *
 * Why this type exists: `src/lib/api/proxy.ts`'s `runProxy` forwards the
 * upstream status and body **verbatim** — it has no status branch at all — so
 * a structured upstream error (FastAPI's `{"detail": "…"}`, playground's
 * `{"error": {"code", "message"}}`, or the proxy's own
 * `{error, target, upstream_status}`) is still fully intact by the time it
 * reaches here. Flattening all of that into a single `Error` message string
 * destroyed it at the last possible moment, which is why
 * `federation-view.tsx` had no way to tell seven distinct fail-closed
 * handshake outcomes apart. The fix belongs here, not in a regex that parses
 * `"POST … failed: 409 — …"` back apart downstream.
 *
 * `name` is deliberately left inherited (`'Error'`) rather than set to
 * `'ApiError'`. `Error.prototype.toString` reads `this.name`, and a dozen
 * call sites render `String(err)` straight into a toast (e.g.
 * `trust-anchors.tsx:94`, `revocation.tsx:41`, `run-detail.tsx:78`).
 * Inheriting the name keeps every one of those operator-facing strings
 * byte-identical to what it was before this type existed. Detect this type
 * with `instanceof ApiError`, never by name.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly method: string;
  readonly path: string;
  /** The response body exactly as received, sliced to
   *  `MAX_ERROR_BODY_CHARS`. `undefined` when the body was empty or could not
   *  be read. Never reworded — callers surface the upstream's own words. */
  readonly body: string | undefined;
  /** True when `body` is only the leading slice of a longer response. */
  readonly bodyTruncated: boolean;

  constructor(method: string, path: string, status: number, detail: ErrorBody) {
    // Unchanged from the pre-`ApiError` message, character for character:
    // every existing caller reads only `.message`, and several tests pin it.
    super(`${method} ${path} failed: ${status}${detail.text ? ` — ${detail.text}` : ''}`);
    this.status = status;
    this.method = method;
    this.path = path;
    this.body = detail.text;
    this.bodyTruncated = detail.truncated;
  }
}

function failed(method: string, path: string, status: number, detail: ErrorBody): ApiError {
  return new ApiError(method, path, status, detail);
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
