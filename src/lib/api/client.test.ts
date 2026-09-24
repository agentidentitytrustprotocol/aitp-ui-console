/**
 * @jest-environment node
 *
 * The client wrappers are consumed by hooks running in the browser, but the
 * helpers themselves only touch `fetch`/`AbortController`/`Response`, all of
 * which Node provides natively. The `node` environment keeps the global
 * `Response` faithful to the platform (jsdom's is patchier).
 */
import {
  ApiError,
  MAX_ERROR_BODY_CHARS,
  delJSON,
  getJSON,
  patchJSON,
  postJSON,
  putJSON,
} from './client';

const ORIGINAL_FETCH = global.fetch;

// The request's 30s timeout guard only clears itself when the merged signal
// aborts; a successful request leaves it pending. Fake timers keep that guard
// from lingering as a real open handle after each test resolves.
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  jest.useRealTimers();
});

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = jest.fn(impl);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('getJSON', () => {
  it('parses the JSON body on success and passes cache: no-store + a signal', async () => {
    const fetchMock = mockFetch(async () =>
      new Response('{"ok":true}', { status: 200 }),
    );

    const data = await getJSON<{ ok: boolean }>('/api/cp/health');

    expect(data).toEqual({ ok: true });
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws a method/path/status error with the upstream detail appended', async () => {
    mockFetch(async () => new Response('boom detail', { status: 404 }));

    await expect(getJSON('/api/cp/missing')).rejects.toThrow(
      'GET /api/cp/missing failed: 404 — boom detail',
    );
  });

  it('omits the detail suffix when the error body is empty', async () => {
    mockFetch(async () => new Response('', { status: 500 }));

    await expect(getJSON('/api/cp/x')).rejects.toThrow('GET /api/cp/x failed: 500');
    // No trailing " — " separator when there is no detail.
    await expect(getJSON('/api/cp/x')).rejects.not.toThrow(/—/);
  });

  it('truncates very long error bodies to 500 chars', async () => {
    const long = 'x'.repeat(2000);
    mockFetch(async () => new Response(long, { status: 400 }));

    let message = '';
    await getJSON('/api/cp/x').catch((e: Error) => (message = e.message));
    const detail = message.split('— ')[1] ?? '';
    expect(detail).toHaveLength(500);
  });

  it('still throws when reading the error body itself fails', async () => {
    mockFetch(async () => ({
      ok: false,
      status: 503,
      text: () => Promise.reject(new Error('stream closed')),
    }) as unknown as Response);

    await expect(getJSON('/api/cp/x')).rejects.toThrow('GET /api/cp/x failed: 503');
  });

  it('merges an external abort signal — aborting it aborts the request signal', async () => {
    const ctrl = new AbortController();
    let captured: AbortSignal | undefined;
    mockFetch(async (_url, init) => {
      captured = init?.signal ?? undefined;
      return new Response('{}', { status: 200 });
    });

    await getJSON('/api/cp/x', { signal: ctrl.signal });
    expect(captured!.aborted).toBe(false);
    ctrl.abort();
    expect(captured!.aborted).toBe(true);
  });

  it('starts already-aborted when the external signal is pre-aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    let captured: AbortSignal | undefined;
    mockFetch(async (_url, init) => {
      captured = init?.signal ?? undefined;
      return new Response('{}', { status: 200 });
    });

    await getJSON('/api/cp/x', { signal: ctrl.signal });
    expect(captured!.aborted).toBe(true);
  });
});

describe('postJSON / putJSON / patchJSON', () => {
  it.each([
    ['POST', postJSON],
    ['PUT', putJSON],
    ['PATCH', patchJSON],
  ] as const)('%s sends a JSON content-type and a serialized body', async (method, fn) => {
    const fetchMock = mockFetch(async () => new Response('{"id":1}', { status: 200 }));

    const data = await fn<{ id: number }>('/api/cp/thing', { a: 1, b: 'two' });

    expect(data).toEqual({ id: 1 });
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.method).toBe(method);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ a: 1, b: 'two' }));
    expect(init.cache).toBe('no-store');
  });

  it.each([
    ['POST', postJSON],
    ['PUT', putJSON],
    ['PATCH', patchJSON],
  ] as const)('%s throws on a non-ok response', async (method, fn) => {
    mockFetch(async () => new Response('nope', { status: 422 }));

    await expect(fn('/api/cp/thing', {})).rejects.toThrow(
      `${method} /api/cp/thing failed: 422 — nope`,
    );
  });
});

/**
 * `src/lib/api/proxy.ts`'s `runProxy` forwards the upstream status and body
 * verbatim, so the structured error is intact right up to this boundary —
 * where it used to be flattened into a message string and lost. These cases
 * pin the structure being kept **and** the message string staying exactly as
 * it was, because a dozen call sites render `String(err)` into a toast.
 */
describe('ApiError', () => {
  async function caught(run: () => Promise<unknown>): Promise<unknown> {
    try {
      await run();
      throw new Error('expected a rejection');
    } catch (err) {
      return err;
    }
  }

  it('carries the status, method, path and raw body alongside the message', async () => {
    mockFetch(async () => new Response('{"detail":"no hosted agent h1"}', { status: 404 }));

    const err = await caught(() => getJSON('/api/playground/hosted-agents/h1'));

    expect(err).toBeInstanceOf(ApiError);
    const api = err as ApiError;
    expect(api.status).toBe(404);
    expect(api.method).toBe('GET');
    expect(api.path).toBe('/api/playground/hosted-agents/h1');
    expect(api.body).toBe('{"detail":"no hosted agent h1"}');
    expect(api.bodyTruncated).toBe(false);
  });

  it('keeps `message` and `String(err)` byte-identical to the pre-ApiError shape', async () => {
    mockFetch(async () => new Response('boom detail', { status: 409 }));

    const err = (await caught(() => postJSON('/api/cp/thing', {}))) as ApiError;

    expect(err.message).toBe('POST /api/cp/thing failed: 409 — boom detail');
    // `Error.prototype.toString` reads `this.name`, and `name` is deliberately
    // left inherited so every existing `String(err)` toast is unchanged.
    expect(String(err)).toBe('Error: POST /api/cp/thing failed: 409 — boom detail');
    expect(err.name).toBe('Error');
  });

  it('is an Error, so `catch`-and-read-.message callers are unaffected', async () => {
    mockFetch(async () => new Response('nope', { status: 422 }));

    const err = await caught(() => putJSON('/api/cp/thing', {}));

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('failed: 422');
  });

  it.each([
    ['GET', () => getJSON('/api/cp/x')],
    ['POST', () => postJSON('/api/cp/x', {})],
    ['PUT', () => putJSON('/api/cp/x', {})],
    ['PATCH', () => patchJSON('/api/cp/x', {})],
    ['DELETE', () => delJSON('/api/cp/x')],
  ] as const)('%s throws an ApiError, not a bare Error', async (_method, run) => {
    mockFetch(async () => new Response('x', { status: 500 }));

    expect(await caught(run)).toBeInstanceOf(ApiError);
  });

  it('flags a sliced body as truncated and leaves a fitting one unflagged', async () => {
    mockFetch(async () => new Response('y'.repeat(MAX_ERROR_BODY_CHARS + 1), { status: 502 }));
    const cut = (await caught(() => getJSON('/api/cp/x'))) as ApiError;
    expect(cut.body).toHaveLength(MAX_ERROR_BODY_CHARS);
    expect(cut.bodyTruncated).toBe(true);

    mockFetch(async () => new Response('y'.repeat(MAX_ERROR_BODY_CHARS), { status: 502 }));
    const whole = (await caught(() => getJSON('/api/cp/x'))) as ApiError;
    expect(whole.body).toHaveLength(MAX_ERROR_BODY_CHARS);
    expect(whole.bodyTruncated).toBe(false);
  });

  it('leaves `body` undefined for an empty body and for an unreadable one', async () => {
    mockFetch(async () => new Response('', { status: 500 }));
    const empty = (await caught(() => getJSON('/api/cp/x'))) as ApiError;
    expect(empty.body).toBeUndefined();
    expect(empty.bodyTruncated).toBe(false);

    mockFetch(async () => ({
      ok: false,
      status: 503,
      text: () => Promise.reject(new Error('stream closed')),
    }) as unknown as Response);
    const unreadable = (await caught(() => getJSON('/api/cp/x'))) as ApiError;
    expect(unreadable.body).toBeUndefined();
    expect(unreadable.status).toBe(503);
  });
});

describe('delJSON', () => {
  it('issues a DELETE and resolves to void on success', async () => {
    const fetchMock = mockFetch(async () => new Response(null, { status: 204 }));

    await expect(delJSON('/api/cp/thing/1')).resolves.toBeUndefined();
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('throws on a non-ok response', async () => {
    mockFetch(async () => new Response('gone', { status: 409 }));

    await expect(delJSON('/api/cp/thing/1')).rejects.toThrow(
      'DELETE /api/cp/thing/1 failed: 409 — gone',
    );
  });
});
