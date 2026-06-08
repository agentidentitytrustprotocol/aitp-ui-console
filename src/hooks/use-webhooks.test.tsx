import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const postMock = jest.fn();
const putMock = jest.fn();
const delMock = jest.fn();
const getMock = jest.fn();

jest.mock('@/lib/api/client', () => ({
  postJSON: (...args: unknown[]) => postMock(...args),
  putJSON: (...args: unknown[]) => putMock(...args),
  delJSON: (...args: unknown[]) => delMock(...args),
  getJSON: (...args: unknown[]) => getMock(...args),
}));

import { useCreateWebhook, useDeleteWebhook, useUpdateWebhook } from './use-webhooks';

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
  putMock.mockReset();
  delMock.mockReset();
  getMock.mockReset();
});

describe('useCreateWebhook', () => {
  it('POSTs the input and invalidates the webhooks list', async () => {
    const wh = { id: 'wh-1', url: 'https://x', events: ['a'], active: true };
    postMock.mockResolvedValue(wh);
    const client = makeClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useCreateWebhook(), { wrapper: wrapper(client) });
    await result.current.mutateAsync({ url: 'https://x', events: ['a'], active: true });

    expect(postMock).toHaveBeenCalledWith('/api/cp/webhooks', {
      url: 'https://x',
      events: ['a'],
      active: true,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['webhooks'] });
  });

  it('surfaces upstream errors', async () => {
    postMock.mockRejectedValue(new Error('POST /api/cp/webhooks failed: 422'));
    const { result } = renderHook(() => useCreateWebhook(), { wrapper: wrapper(makeClient()) });
    await expect(
      result.current.mutateAsync({ url: 'x', events: [], active: true }),
    ).rejects.toThrow(/422/);
  });
});

describe('useUpdateWebhook', () => {
  it('PUTs to the encoded id with the patch body', async () => {
    putMock.mockResolvedValue({ id: 'wh 1', active: false });
    const client = makeClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateWebhook(), { wrapper: wrapper(client) });
    await result.current.mutateAsync({ id: 'wh 1', active: false });

    expect(putMock).toHaveBeenCalledWith('/api/cp/webhooks/wh%201', { active: false });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['webhooks'] });
  });
});

describe('useDeleteWebhook', () => {
  it('DELETEs the encoded id and invalidates the list', async () => {
    delMock.mockResolvedValue(undefined);
    const client = makeClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteWebhook(), { wrapper: wrapper(client) });
    await result.current.mutateAsync('wh:1');

    expect(delMock).toHaveBeenCalledWith('/api/cp/webhooks/wh%3A1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['webhooks'] });
  });
});
