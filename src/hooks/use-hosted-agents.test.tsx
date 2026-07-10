import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const postMock = jest.fn();
const delMock = jest.fn();
const getMock = jest.fn();

jest.mock('@/lib/api/client', () => ({
  postJSON: (...args: unknown[]) => postMock(...args),
  delJSON: (...args: unknown[]) => delMock(...args),
  getJSON: (...args: unknown[]) => getMock(...args),
}));

import {
  useHostAgent,
  useHostedAgents,
  useInvokeHosted,
  useResolveAndHandshake,
  useStopHostedAgent,
} from './use-hosted-agents';

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function wrapper(client: QueryClient) {
  const Wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrap.displayName = 'QueryWrap';
  return Wrap;
}

beforeEach(() => {
  postMock.mockReset();
  delMock.mockReset();
  getMock.mockReset();
});

describe('useHostedAgents', () => {
  it('fetches the wrapped hosted-agents list', async () => {
    getMock.mockResolvedValue({ hosted: [{ hosted_id: 'h1' }] });
    const { result } = renderHook(() => useHostedAgents(), { wrapper: wrapper(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith('/api/playground/hosted-agents');
    expect(result.current.data?.hosted).toHaveLength(1);
  });
});

describe('useHostAgent', () => {
  it('POSTs the host request and invalidates the list', async () => {
    postMock.mockResolvedValue({ hosted_id: 'h1', ref: 'pack/a@1' });
    const client = makeClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useHostAgent(), { wrapper: wrapper(client) });
    await result.current.mutateAsync({ ref: 'pack/a@1' });

    expect(postMock).toHaveBeenCalledWith('/api/playground/hosted-agents', { ref: 'pack/a@1' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['hosted-agents'] });
  });
});

describe('useStopHostedAgent', () => {
  it('DELETEs the encoded id and invalidates the list', async () => {
    delMock.mockResolvedValue(undefined);
    const client = makeClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useStopHostedAgent(), { wrapper: wrapper(client) });
    await result.current.mutateAsync('h:1');

    expect(delMock).toHaveBeenCalledWith('/api/playground/hosted-agents/h%3A1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['hosted-agents'] });
  });
});

describe('useResolveAndHandshake', () => {
  it('POSTs to the handshake sub-route with the body', async () => {
    postMock.mockResolvedValue({ trust: 'established' });
    const { result } = renderHook(() => useResolveAndHandshake(), {
      wrapper: wrapper(makeClient()),
    });
    await result.current.mutateAsync({
      id: 'h1',
      body: { peer_did: 'did:web:org-b', requested_grants: ['summarize'] },
    });

    expect(postMock).toHaveBeenCalledWith(
      '/api/playground/hosted-agents/h1/resolve-and-handshake',
      { peer_did: 'did:web:org-b', requested_grants: ['summarize'] },
    );
  });
});

describe('useInvokeHosted', () => {
  it('POSTs to the invoke sub-route with the body', async () => {
    postMock.mockResolvedValue({ result: { ok: true } });
    const { result } = renderHook(() => useInvokeHosted(), { wrapper: wrapper(makeClient()) });
    await result.current.mutateAsync({
      id: 'h1',
      body: { peer_port: 9101, capability: 'summarize', payload: { text: 'hi' } },
    });

    expect(postMock).toHaveBeenCalledWith('/api/playground/hosted-agents/h1/invoke', {
      peer_port: 9101,
      capability: 'summarize',
      payload: { text: 'hi' },
    });
  });
});
