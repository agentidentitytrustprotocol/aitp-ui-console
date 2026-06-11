import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const postMock = jest.fn();
const patchMock = jest.fn();
const delMock = jest.fn();
const getMock = jest.fn();

jest.mock('@/lib/api/client', () => ({
  postJSON: (...args: unknown[]) => postMock(...args),
  patchJSON: (...args: unknown[]) => patchMock(...args),
  delJSON: (...args: unknown[]) => delMock(...args),
  getJSON: (...args: unknown[]) => getMock(...args),
}));

import {
  useCreatePinnedKey,
  useCreateRevocation,
  useCreateTrustAnchor,
  useDelegations,
  useDeletePinnedKey,
  useDeleteTrustAnchor,
  usePinnedKeys,
  useRevocationList,
  useTcts,
  useTrustAnchors,
  useUpdateTrustAnchor,
} from './use-trust';

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
  patchMock.mockReset();
  delMock.mockReset();
  getMock.mockReset();
});

describe('useCreateTrustAnchor', () => {
  it('POSTs and invalidates the trust-anchors list', async () => {
    postMock.mockResolvedValue({ id: 'ta-1' });
    const client = makeClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useCreateTrustAnchor(), { wrapper: wrapper(client) });
    await result.current.mutateAsync({ issuerUrl: 'https://idp.example.com' });

    expect(postMock).toHaveBeenCalledWith('/api/cp/trust-anchors', {
      issuerUrl: 'https://idp.example.com',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cp-trust-anchors'] });
  });
});

describe('useUpdateTrustAnchor', () => {
  it('PATCHes the encoded id with the patch body and invalidates the list', async () => {
    patchMock.mockResolvedValue({ id: 'ta:1', label: 'new' });
    const client = makeClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateTrustAnchor(), { wrapper: wrapper(client) });
    await result.current.mutateAsync({ id: 'ta:1', label: 'new' });

    expect(patchMock).toHaveBeenCalledWith('/api/cp/trust-anchors/ta%3A1', { label: 'new' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cp-trust-anchors'] });
  });
});

describe('useDeleteTrustAnchor', () => {
  it('DELETEs the encoded id and invalidates the list', async () => {
    delMock.mockResolvedValue(undefined);
    const client = makeClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteTrustAnchor(), { wrapper: wrapper(client) });
    await result.current.mutateAsync('ta-9');

    expect(delMock).toHaveBeenCalledWith('/api/cp/trust-anchors/ta-9');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cp-trust-anchors'] });
  });
});

describe('useCreatePinnedKey', () => {
  it('POSTs and invalidates the pinned-keys list', async () => {
    postMock.mockResolvedValue({ aid: 'aid:pubkey:x', namespace: 'default' });
    const client = makeClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useCreatePinnedKey(), { wrapper: wrapper(client) });
    await result.current.mutateAsync({ aid: 'aid:pubkey:x', pubkey: 'k' });

    expect(postMock).toHaveBeenCalledWith('/api/cp/pinned-keys', {
      aid: 'aid:pubkey:x',
      pubkey: 'k',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cp-pinned-keys'] });
  });
});

describe('useDeletePinnedKey', () => {
  it('DELETEs with namespace + aid as query params', async () => {
    delMock.mockResolvedValue(undefined);
    const client = makeClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useDeletePinnedKey(), { wrapper: wrapper(client) });
    await result.current.mutateAsync({ namespace: 'ns 1', aid: 'aid:pubkey:y' });

    expect(delMock).toHaveBeenCalledWith(
      '/api/cp/pinned-keys?namespace=ns%201&aid=aid%3Apubkey%3Ay',
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cp-pinned-keys'] });
  });
});

describe('useCreateRevocation', () => {
  it('POSTs to /api/cp/revocation/entries and cascades cache invalidation', async () => {
    postMock.mockResolvedValue({ jti: 'j1', revokedAt: '2026-06-08', reason: null });
    const client = makeClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useCreateRevocation(), { wrapper: wrapper(client) });
    await result.current.mutateAsync({ jti: 'j1', reason: 'compromise' });

    expect(postMock).toHaveBeenCalledWith('/api/cp/revocation/entries', {
      jti: 'j1',
      reason: 'compromise',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cp-revocation-list'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cp-delegations'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cp-tcts'] });
  });
});

describe('useTcts', () => {
  it('fetches the bare path when no params are given', async () => {
    getMock.mockResolvedValue({ tcts: [] });
    const { result } = renderHook(() => useTcts(), { wrapper: wrapper(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith('/api/cp/tcts');
  });

  it('encodes only the truthy filters into the query string', async () => {
    getMock.mockResolvedValue({ tcts: [] });
    const { result } = renderHook(
      () => useTcts({ issuer: 'aid:pubkey:i', subject: '', capability: 'research.query' }),
      { wrapper: wrapper(makeClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith(
      '/api/cp/tcts?issuer=aid%3Apubkey%3Ai&capability=research.query',
    );
  });
});

describe('trust read lists', () => {
  it.each([
    ['useDelegations', useDelegations, '/api/cp/delegations', { delegations: [] }],
    ['useTrustAnchors', useTrustAnchors, '/api/cp/trust-anchors', { trustAnchors: [] }],
    ['usePinnedKeys', usePinnedKeys, '/api/cp/pinned-keys', { pinnedKeys: [] }],
    [
      'useRevocationList',
      useRevocationList,
      '/api/cp/well-known/aitp-revocation-list',
      { revokedJtis: [] },
    ],
  ] as const)('%s fetches its endpoint', async (_name, hook, path, payload) => {
    getMock.mockResolvedValue(payload);
    const { result } = renderHook(() => hook(), { wrapper: wrapper(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith(path);
  });
});
