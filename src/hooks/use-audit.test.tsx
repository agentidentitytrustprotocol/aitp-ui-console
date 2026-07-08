import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const getMock = jest.fn();

jest.mock('@/lib/api/client', () => ({
  getJSON: (...args: unknown[]) => getMock(...args),
}));

import { useAudit } from './use-audit';

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

describe('useAudit', () => {
  it('requests the history endpoint with only the default limit when no filters are set', async () => {
    getMock.mockResolvedValue({ events: [] });
    const { result } = renderHook(() => useAudit(), { wrapper: wrapper(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith('/api/cp/events/history?limit=100');
  });

  it('includes aid/type/since/until only when set, URL-encoding the values', async () => {
    getMock.mockResolvedValue({ events: [] });
    const { result } = renderHook(
      () =>
        useAudit({
          aid: 'aid:agent/alpha',
          type: 'session.created',
          since: '2026-07-01T00:00:00Z',
          until: '2026-07-07T00:00:00Z',
          limit: 25,
        }),
      { wrapper: wrapper(makeClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith(
      '/api/cp/events/history?aid=aid%3Aagent%2Falpha&type=session.created' +
        '&since=2026-07-01T00%3A00%3A00Z&until=2026-07-07T00%3A00%3A00Z&limit=25',
    );
  });

  it('skips empty-string filters and keeps the default limit', async () => {
    getMock.mockResolvedValue({ events: [] });
    const { result } = renderHook(
      () => useAudit({ aid: '', type: '', since: '', until: '' }),
      { wrapper: wrapper(makeClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith('/api/cp/events/history?limit=100');
  });

  it('applies a single filter without dragging in the others', async () => {
    getMock.mockResolvedValue({ events: [] });
    const { result } = renderHook(() => useAudit({ type: 'session.closed' }), {
      wrapper: wrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith('/api/cp/events/history?type=session.closed&limit=100');
  });

  it('exposes the fetched events through the query data', async () => {
    const events = [
      { type: 'session.created', aidA: 'aid:agent/a', ts: 1_700_000_000 },
      { type: 'session.closed', aidA: 'aid:agent/a', ts: 1_700_000_100 },
    ];
    getMock.mockResolvedValue({ events, count: 2 });
    const { result } = renderHook(() => useAudit({ aid: 'aid:agent/a' }), {
      wrapper: wrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.events).toEqual(events);
    expect(result.current.data?.count).toBe(2);
  });
});
