import { screen, waitFor } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import { ConnectionStatus } from './connection-status';

const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

/** Minimal fetch-response duck type -- this jsdom test environment has no
 *  global `Response`/`fetch` (see connection-panel.test.tsx for the same
 *  workaround). The component only ever reads `.ok`, `.status`, `.json()`. */
function fakeResponse(status: number, body: unknown = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function wireFetch(handler: () => Promise<unknown>) {
  global.fetch = jest.fn(handler) as unknown as typeof fetch;
}

describe('ConnectionStatus', () => {
  it('shows "unreachable" (never a premature "healthy") before the health check settles', () => {
    wireFetch(() => new Promise(() => {}));
    renderWithClient(<ConnectionStatus label="Playground" path="/api/playground/health" />);
    expect(screen.getByTitle('Playground: unreachable')).toBeInTheDocument();
  });

  it('shows "healthy" once the default ok-check resolves true', async () => {
    wireFetch(() => Promise.resolve(fakeResponse(200)));
    renderWithClient(<ConnectionStatus label="Playground" path="/api/playground/health" />);
    await waitFor(() =>
      expect(screen.getByTitle('Playground: healthy')).toBeInTheDocument(),
    );
  });

  it('shows "unreachable" when the health check resolves not-ok', async () => {
    wireFetch(() => Promise.resolve(fakeResponse(503)));
    renderWithClient(<ConnectionStatus label="CP" path="/api/cp/health" />);
    await waitFor(() => expect(screen.getByTitle('CP: unreachable')).toBeInTheDocument());
  });

  it('applies a custom isHealthy predicate against the parsed body', async () => {
    wireFetch(() => Promise.resolve(fakeResponse(200, { ready: true })));
    renderWithClient(
      <ConnectionStatus
        label="CP ready"
        path="/api/cp/readyz"
        isHealthy={(status, body) => status === 200 && (body as { ready?: boolean }).ready === true}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTitle('CP ready: healthy')).toBeInTheDocument(),
    );
  });

  it('treats a throwing isHealthy predicate as unhealthy rather than crashing', async () => {
    wireFetch(() => Promise.resolve(fakeResponse(200, {})));
    renderWithClient(
      <ConnectionStatus
        label="CP ready"
        path="/api/cp/readyz"
        isHealthy={() => {
          throw new Error('boom');
        }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTitle('CP ready: unreachable')).toBeInTheDocument(),
    );
  });
});
