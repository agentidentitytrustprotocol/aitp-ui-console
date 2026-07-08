import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { REFETCH } from '@/lib/query-options';
import type { RunSummary } from '@/lib/types/playground';

const getMock = jest.fn();

jest.mock('@/lib/api/client', () => ({
  getJSON: (...args: unknown[]) => getMock(...args),
}));

import { useRunCount, useRuns } from './use-runs';

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

function makeRun(status: string | null, id = `run-${status}`): RunSummary {
  return {
    run_id: id,
    status,
    scenario_ref: 'scenario/basic',
    created_at: 1_700_000_000,
    event_count: 3,
  };
}

/** Pull the dynamic refetchInterval callback the hook registered on the
 *  ['runs'] query so its branching can be exercised directly. */
function getIntervalFn(client: QueryClient) {
  const query = client.getQueryCache().find({ queryKey: ['runs'] });
  expect(query).toBeDefined();
  const interval = (query!.options as { refetchInterval?: unknown }).refetchInterval;
  expect(typeof interval).toBe('function');
  return { query: query!, interval: interval as (q: unknown) => number };
}

beforeEach(() => getMock.mockReset());

describe('useRuns', () => {
  it('fetches the runs list and exposes the data', async () => {
    getMock.mockResolvedValue({ runs: [makeRun('completed')] });
    const { result } = renderHook(() => useRuns(), { wrapper: wrapper(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith('/api/playground/runs');
    expect(result.current.data?.runs).toHaveLength(1);
    expect(result.current.data?.runs[0].run_id).toBe('run-completed');
  });

  it('polls at REFETCH.runActive while any run is pending or running', async () => {
    getMock.mockResolvedValue({ runs: [makeRun('completed'), makeRun('running')] });
    const client = makeClient();
    const { result } = renderHook(() => useRuns(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { query, interval } = getIntervalFn(client);
    expect(interval(query)).toBe(REFETCH.runActive);
  });

  it('treats a pending run as active too', async () => {
    getMock.mockResolvedValue({ runs: [makeRun('pending')] });
    const client = makeClient();
    const { result } = renderHook(() => useRuns(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { query, interval } = getIntervalFn(client);
    expect(interval(query)).toBe(REFETCH.runActive);
  });

  it('falls back to REFETCH.list when every run is terminal', async () => {
    getMock.mockResolvedValue({ runs: [makeRun('completed'), makeRun('failed')] });
    const client = makeClient();
    const { result } = renderHook(() => useRuns(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { query, interval } = getIntervalFn(client);
    expect(interval(query)).toBe(REFETCH.list);
  });

  it('uses REFETCH.list before any data has arrived (empty runs)', async () => {
    getMock.mockResolvedValue({ runs: [] });
    const client = makeClient();
    const { result } = renderHook(() => useRuns(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { query, interval } = getIntervalFn(client);
    expect(interval(query)).toBe(REFETCH.list);
  });
});

describe('useRunCount', () => {
  it('counts only pending and running runs', async () => {
    getMock.mockResolvedValue({
      runs: [
        makeRun('pending', 'r1'),
        makeRun('running', 'r2'),
        makeRun('completed', 'r3'),
        makeRun('failed', 'r4'),
        makeRun(null, 'r5'),
      ],
    });
    const { result } = renderHook(() => useRunCount(), { wrapper: wrapper(makeClient()) });
    await waitFor(() => expect(result.current).toBe(2));
    expect(getMock).toHaveBeenCalledWith('/api/playground/runs');
  });

  it('returns 0 when no run is active', async () => {
    getMock.mockResolvedValue({ runs: [makeRun('completed'), makeRun('failed')] });
    const client = makeClient();
    const { result } = renderHook(() => useRunCount(), { wrapper: wrapper(client) });
    // Starts at 0 before data lands and must stay 0 once it does.
    expect(result.current).toBe(0);
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(client.getQueryState(['runs'])?.status).toBe('success'),
    );
    expect(result.current).toBe(0);
  });
});
