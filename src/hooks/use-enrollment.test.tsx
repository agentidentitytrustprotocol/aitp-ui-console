import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const postMock = jest.fn();
const delMock = jest.fn();

jest.mock('@/lib/api/client', () => ({
  postJSON: (...args: unknown[]) => postMock(...args),
  delJSON: (...args: unknown[]) => delMock(...args),
}));

// Import after mock so the hook picks up the mocked module.
import { useCreateEnrollmentToken, useDeregisterAgent } from './use-enrollment';

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
  delMock.mockReset();
});

describe('useCreateEnrollmentToken', () => {
  it('POSTs the envelope and resolves with the token', async () => {
    const token = {
      token: 'aitp-token-redacted',
      jti: 'abc',
      exp: 1234567890,
      agent_aid: 'aid:pubkey:x',
    };
    postMock.mockResolvedValue(token);

    const { result } = renderHook(() => useCreateEnrollmentToken(), {
      wrapper: wrapper(makeClient()),
    });

    const data = await result.current.mutateAsync({
      manifest: { aid: 'aid:pubkey:x' } as never,
    });
    expect(data).toEqual(token);
    expect(postMock).toHaveBeenCalledWith('/api/cp/registry/enroll', {
      manifest: { aid: 'aid:pubkey:x' },
    });
  });

  it('rejects when the client surfaces an upstream failure', async () => {
    postMock.mockRejectedValue(new Error('POST /api/cp/registry/enroll failed: 400'));

    const { result } = renderHook(() => useCreateEnrollmentToken(), {
      wrapper: wrapper(makeClient()),
    });

    await expect(
      result.current.mutateAsync({ manifest: {} as never }),
    ).rejects.toThrow(/400/);
  });
});

describe('useDeregisterAgent', () => {
  it('issues DELETE with an encoded aid and invalidates registry queries', async () => {
    delMock.mockResolvedValue(undefined);
    const client = makeClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useDeregisterAgent(), {
      wrapper: wrapper(client),
    });
    await result.current.mutateAsync('aid:pubkey:foo');

    expect(delMock).toHaveBeenCalledWith('/api/cp/registry/agents/aid%3Apubkey%3Afoo');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['registry-agents'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['registry-agent'] });
  });
});
