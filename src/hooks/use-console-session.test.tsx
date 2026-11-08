import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeClient, renderWithClient } from '@/test/test-utils';
import {
  accessFrom,
  ConsoleSessionProvider,
  OperatorAccessProvider,
  OperatorRequiredError,
  useAdminMutation,
  useOperatorAccess,
  type OperatorAccess,
} from './use-console-session';

const SETTLED = { isPending: false, isError: false };
const ANON: OperatorAccess = {
  status: 'anonymous',
  canAdmin: false,
  publicMode: true,
};

describe('accessFrom', () => {
  it('is loading, with no admin, while the session is pending', () => {
    expect(accessFrom(undefined, { isPending: true, isError: false })).toEqual({
      status: 'loading',
      canAdmin: false,
      publicMode: false,
    });
  });

  it('is operator with the flag off, signed in or not', () => {
    expect(accessFrom({ publicMode: false, signedIn: false }, SETTLED)).toEqual(
      {
        status: 'operator',
        canAdmin: true,
        publicMode: false,
      },
    );
  });

  it('is operator in public mode only when signed in', () => {
    expect(
      accessFrom({ publicMode: true, signedIn: true }, SETTLED).status,
    ).toBe('operator');
    expect(accessFrom({ publicMode: true, signedIn: false }, SETTLED)).toEqual(
      ANON,
    );
  });

  it('fails closed when the endpoint errors or answers nonsense', () => {
    expect(accessFrom(undefined, { isPending: false, isError: true })).toEqual(
      ANON,
    );
    expect(accessFrom({ publicMode: 'yes' }, SETTLED)).toEqual(ANON);
    expect(accessFrom(null, SETTLED)).toEqual(ANON);
  });
});

describe('ConsoleSessionProvider', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function Probe() {
    const a = useOperatorAccess();
    return <div data-testid="status">{a.status}</div>;
  }

  function serve(status: number, body: unknown) {
    const text = JSON.stringify(body);
    // jsdom here has no `Response`; getJSON reads only these members.
    const spy = jest.fn<Promise<unknown>, [string]>(async () => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      text: async () => text,
      json: async () => JSON.parse(text),
    }));
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  it('reads /api/auth/session once and shares the answer', async () => {
    const spy = serve(200, { publicMode: true, signedIn: false });
    renderWithClient(
      <ConsoleSessionProvider>
        <Probe />
        <Probe />
      </ConsoleSessionProvider>,
    );
    expect(screen.getAllByTestId('status')[0]).toHaveTextContent('loading');
    await waitFor(() =>
      expect(screen.getAllByTestId('status')[0]).toHaveTextContent('anonymous'),
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('/api/auth/session');
  });

  it('is operator with the flag off', async () => {
    serve(200, { publicMode: false, signedIn: false });
    renderWithClient(
      <ConsoleSessionProvider>
        <Probe />
      </ConsoleSessionProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('operator'),
    );
  });

  it('is anonymous when the session endpoint fails', async () => {
    serve(500, { error: 'boom' });
    renderWithClient(
      <ConsoleSessionProvider>
        <Probe />
      </ConsoleSessionProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('anonymous'),
    );
  });

  describe('with the server-rendered initial session', () => {
    it('flag off: operator on first paint and never asks the endpoint', () => {
      const spy = serve(500, { error: 'boom' });
      renderWithClient(
        <ConsoleSessionProvider
          initial={{ publicMode: false, signedIn: false }}
        >
          <Probe />
        </ConsoleSessionProvider>,
      );
      expect(screen.getByTestId('status')).toHaveTextContent('operator');
      expect(spy).not.toHaveBeenCalled();
    });

    it('flag on, signed in: operator on first paint with no request', () => {
      const spy = serve(500, { error: 'boom' });
      renderWithClient(
        <ConsoleSessionProvider initial={{ publicMode: true, signedIn: true }}>
          <Probe />
        </ConsoleSessionProvider>,
      );
      expect(screen.getByTestId('status')).toHaveTextContent('operator');
      expect(spy).not.toHaveBeenCalled();
    });

    it('flag on, anonymous: anonymous on first paint, never loading', () => {
      serve(200, { publicMode: true, signedIn: true });
      renderWithClient(
        <ConsoleSessionProvider initial={{ publicMode: true, signedIn: false }}>
          <Probe />
        </ConsoleSessionProvider>,
      );
      expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
    });
  });

  it('defaults to operator with no provider mounted (flag-off behaviour)', () => {
    renderWithClient(<Probe />);
    expect(screen.getByTestId('status')).toHaveTextContent('operator');
  });
});

describe('useAdminMutation', () => {
  function wrapper(access: OperatorAccess) {
    const client = makeClient();
    return function W({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>
          <OperatorAccessProvider value={access}>
            {children}
          </OperatorAccessProvider>
        </QueryClientProvider>
      );
    };
  }

  it('refuses before calling the mutation function when anonymous', async () => {
    const fn = jest.fn(async () => 'sent');
    const { result } = renderHook(() => useAdminMutation({ mutationFn: fn }), {
      wrapper: wrapper(ANON),
    });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toBeInstanceOf(
        OperatorRequiredError,
      );
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('refuses while the session is still loading', async () => {
    const fn = jest.fn(async () => 'sent');
    const { result } = renderHook(() => useAdminMutation({ mutationFn: fn }), {
      wrapper: wrapper({
        status: 'loading',
        canAdmin: false,
        publicMode: false,
      }),
    });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow(
        'Operator only',
      );
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('runs the mutation for an operator', async () => {
    const fn = jest.fn(async (n: number) => n * 2);
    const { result } = renderHook(() => useAdminMutation({ mutationFn: fn }), {
      wrapper: wrapper({
        status: 'operator',
        canAdmin: true,
        publicMode: true,
      }),
    });
    await act(async () => {
      await expect(result.current.mutateAsync(21)).resolves.toBe(42);
    });
    expect(fn).toHaveBeenCalledWith(21);
  });
});
