import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const postMock = jest.fn();

jest.mock('@/lib/api/client', () => ({
  postJSON: (...args: unknown[]) => postMock(...args),
}));

import { useResetCircuitBreaker } from './use-circuit-breaker';

function wrapper(client: QueryClient) {
  const Wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrap.displayName = 'QueryWrap';
  return Wrap;
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

beforeEach(() => {
  postMock.mockReset();
});

describe('useResetCircuitBreaker', () => {
  it('POSTs the reset path and invalidates the webhook list', async () => {
    postMock.mockResolvedValue({
      state: 'closed',
      failures: 0,
      consecutiveSuccesses: 0,
    });
    const client = makeClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useResetCircuitBreaker(), {
      wrapper: wrapper(client),
    });
    await result.current.mutateAsync('wh-123');

    expect(postMock).toHaveBeenCalledWith(
      '/api/cp/webhooks/wh-123/circuit-breaker/reset',
      {},
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['webhooks'] });
  });

  it('encodes the webhook id so special characters survive routing', async () => {
    postMock.mockResolvedValue({});

    const { result } = renderHook(() => useResetCircuitBreaker(), {
      wrapper: wrapper(makeClient()),
    });
    await result.current.mutateAsync('wh/with spaces');

    expect(postMock).toHaveBeenCalledWith(
      '/api/cp/webhooks/wh%2Fwith%20spaces/circuit-breaker/reset',
      {},
    );
  });
});
