import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const getMock = jest.fn();

jest.mock('@/lib/api/client', () => ({
  getJSON: (...args: unknown[]) => getMock(...args),
}));

import {
  useRunCpAudit,
  useRunCpSessions,
  useRunDeliveries,
  useRunNarrate,
} from './use-run-extras';

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

describe('getJSON-backed run extras', () => {
  it.each([
    ['useRunCpAudit', useRunCpAudit, '/api/playground/runs/run%3A1/cp-audit'],
    ['useRunCpSessions', useRunCpSessions, '/api/playground/runs/run%3A1/cp-sessions'],
    ['useRunDeliveries', useRunDeliveries, '/api/playground/runs/run%3A1/deliveries'],
  ] as const)('%s fetches the encoded run-scoped path', async (_name, hook, path) => {
    getMock.mockResolvedValue({});
    const { result } = renderHook(() => hook('run:1'), { wrapper: wrapper(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith(path);
  });

  it.each([
    ['useRunCpAudit', useRunCpAudit],
    ['useRunCpSessions', useRunCpSessions],
    ['useRunDeliveries', useRunDeliveries],
  ] as const)('%s stays idle when runId is null', (_name, hook) => {
    const { result } = renderHook(() => hook(null), { wrapper: wrapper(makeClient()) });
    expect(result.current.fetchStatus).toBe('idle');
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe('useRunNarrate', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('reads the narrate endpoint as plain text', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'A then B handed off to C.',
    })) as unknown as typeof fetch;

    const { result } = renderHook(() => useRunNarrate('run-7'), {
      wrapper: wrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe('A then B handed off to C.');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      '/api/playground/runs/run-7/narrate',
    );
  });

  it('throws a status-coded error on a non-ok response', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    })) as unknown as typeof fetch;

    const { result } = renderHook(() => useRunNarrate('run-7'), {
      wrapper: wrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('narrate 404'));
  });

  it('stays idle when runId is null', () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const { result } = renderHook(() => useRunNarrate(null), {
      wrapper: wrapper(makeClient()),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
