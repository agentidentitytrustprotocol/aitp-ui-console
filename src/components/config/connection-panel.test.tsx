import { screen, waitFor } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import { ConnectionPanel } from './connection-panel';

const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

/** Minimal fetch-response duck type -- this jsdom test environment has no
 *  global `Response`/`fetch` (confirmed: `typeof Response === 'undefined'`
 *  here), so a real `Response` instance isn't available to construct. The
 *  component only ever reads `.ok`, `.status`, and (for readyz) `.json()`. */
function fakeResponse(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function wireFetch(responses: Record<string, () => Promise<unknown>>) {
  global.fetch = jest.fn((url: string) => {
    const handler = responses[url];
    if (!handler) throw new Error(`unexpected fetch ${url}`);
    return handler();
  }) as unknown as typeof fetch;
}

describe('ConnectionPanel', () => {
  it('renders "checking…" for both services before either query settles', () => {
    wireFetch({
      '/api/playground/health': () => new Promise(() => {}),
      '/api/cp/health': () => new Promise(() => {}),
      '/api/cp/readyz': () => new Promise(() => {}),
    });
    renderWithClient(<ConnectionPanel />);
    expect(screen.getAllByText('checking…')).toHaveLength(2);
  });

  it('renders "healthy" once the health check resolves ok, and never flashes "unreachable" first', async () => {
    // This only covers the resolved-state text, not the hydration-safety
    // gate itself -- RTL's render() flushes useEffect synchronously, so
    // `mounted` (via useHydrated()) is already true before any assertion
    // here runs, whether or not the gate exists. The actual
    // server-render-then-hydrate regression test lives in
    // src/hooks/use-hydrated.test.tsx.
    wireFetch({
      '/api/playground/health': () => Promise.resolve(fakeResponse(200)),
      '/api/cp/health': () => new Promise(() => {}),
      '/api/cp/readyz': () => new Promise(() => {}),
    });
    renderWithClient(<ConnectionPanel />);
    await waitFor(() => expect(screen.getByText('healthy')).toBeInTheDocument());
  });

  it('renders "unreachable" when the health check resolves not-ok', async () => {
    wireFetch({
      '/api/playground/health': () => Promise.resolve(fakeResponse(503)),
      '/api/cp/health': () => new Promise(() => {}),
      '/api/cp/readyz': () => new Promise(() => {}),
    });
    renderWithClient(<ConnectionPanel />);
    await waitFor(() => expect(screen.getByText('unreachable')).toBeInTheDocument());
  });

  it('renders "ready" for the Control Plane once readyz reports ready', async () => {
    wireFetch({
      '/api/playground/health': () => new Promise(() => {}),
      '/api/cp/health': () => Promise.resolve(fakeResponse(200)),
      '/api/cp/readyz': () => Promise.resolve(fakeResponse(200, { ready: true })),
    });
    renderWithClient(<ConnectionPanel />);
    await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument());
  });

  it('renders the not-ready reason for the Control Plane when readyz reports it', async () => {
    wireFetch({
      '/api/playground/health': () => new Promise(() => {}),
      '/api/cp/health': () => Promise.resolve(fakeResponse(200)),
      '/api/cp/readyz': () =>
        Promise.resolve(fakeResponse(200, { ready: false, reason: 'db unreachable' })),
    });
    renderWithClient(<ConnectionPanel />);
    await waitFor(() =>
      expect(screen.getByText('not ready (db unreachable)')).toBeInTheDocument(),
    );
  });
});
