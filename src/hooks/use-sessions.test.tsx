import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const getMock = jest.fn();

jest.mock('@/lib/api/client', () => ({
  getJSON: (...args: unknown[]) => getMock(...args),
}));

import { useSession, useSessionReplay, useSessions } from './use-sessions';

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function wrapper(client: QueryClient) {
  const Wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrap.displayName = 'QueryWrap';
  return Wrap;
}

beforeEach(() => getMock.mockReset());

describe('useSessions', () => {
  it('requests the bare path when no filters are given', async () => {
    getMock.mockResolvedValue({ sessions: [] });
    const { result } = renderHook(() => useSessions(), { wrapper: wrapper(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith('/api/cp/sessions');
  });

  it('builds a query string from the provided filters, skipping empty ones', async () => {
    getMock.mockResolvedValue({ sessions: [] });
    const { result } = renderHook(
      () => useSessions({ status: 'active', aid: '', limit: 50 }),
      { wrapper: wrapper(makeClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith('/api/cp/sessions?status=active&limit=50');
  });
});

describe('useSession', () => {
  it('stays disabled while sessionId is null and never fetches', () => {
    const { result } = renderHook(() => useSession(null), { wrapper: wrapper(makeClient()) });
    expect(result.current.fetchStatus).toBe('idle');
    expect(getMock).not.toHaveBeenCalled();
  });

  it('fetches the encoded session detail path once an id is supplied', async () => {
    getMock.mockResolvedValue({ session: {}, events: [] });
    const { result } = renderHook(() => useSession('sess:1'), {
      wrapper: wrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith('/api/cp/sessions/sess%3A1');
  });
});

describe('useSessionReplay', () => {
  it('stays idle until both an id is present AND enabled is true', () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useSessionReplay('sess-1', enabled),
      { wrapper: wrapper(makeClient()), initialProps: { enabled: false } },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(getMock).not.toHaveBeenCalled();

    rerender({ enabled: true });
    expect(getMock).toHaveBeenCalledWith('/api/cp/sessions/sess-1/replay');
  });
});
