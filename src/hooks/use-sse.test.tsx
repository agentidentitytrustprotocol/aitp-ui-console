import { act, renderHook, waitFor } from '@testing-library/react';
import { useSse } from './use-sse';

interface FakeEventSourceCtor {
  new (url: string): FakeEventSource;
  instances: FakeEventSource[];
}

interface FakeEventSource {
  url: string;
  closed: boolean;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  open(): void;
  emit(data: unknown): void;
  fail(): void;
  close(): void;
}

const FakeES = (globalThis as unknown as { EventSource: FakeEventSourceCtor }).EventSource;

beforeEach(() => {
  FakeES.instances.length = 0;
});

describe('useSse', () => {
  it('does not connect when url is null', () => {
    renderHook(() =>
      useSse<{ x: number }>({
        url: null,
        onMessage: () => undefined,
      }),
    );
    expect(FakeES.instances).toHaveLength(0);
  });

  it('opens a connection and surfaces connected=true after open', async () => {
    const onMessage = jest.fn();
    const { result } = renderHook(() =>
      useSse<{ x: number }>({
        url: '/api/cp/events/stream',
        onMessage,
      }),
    );

    expect(FakeES.instances).toHaveLength(1);
    act(() => FakeES.instances[0].open());

    await waitFor(() => expect(result.current.connected).toBe(true));
  });

  it('parses JSON event payloads and forwards them to onMessage', () => {
    const onMessage = jest.fn();
    renderHook(() =>
      useSse<{ x: number }>({
        url: '/api/cp/events/stream',
        onMessage,
      }),
    );

    act(() => {
      FakeES.instances[0].open();
      FakeES.instances[0].emit({ x: 42 });
    });

    expect(onMessage).toHaveBeenCalledWith({ x: 42 });
  });

  it('ignores unparseable frames without throwing', () => {
    const onMessage = jest.fn();
    renderHook(() =>
      useSse<{ x: number }>({
        url: '/api/cp/events/stream',
        onMessage,
      }),
    );

    act(() => {
      const es = FakeES.instances[0];
      es.open();
      // Simulate a non-JSON event frame.
      es.onmessage?.(new MessageEvent('message', { data: 'not-json' }));
    });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('closes the source on unmount', () => {
    const { unmount } = renderHook(() =>
      useSse<{ x: number }>({
        url: '/api/cp/events/stream',
        onMessage: () => undefined,
      }),
    );

    const es = FakeES.instances[0];
    expect(es.closed).toBe(false);
    unmount();
    expect(es.closed).toBe(true);
  });

  it('flips connected=false on error', async () => {
    const { result } = renderHook(() =>
      useSse<{ x: number }>({
        url: '/api/cp/events/stream',
        onMessage: () => undefined,
      }),
    );

    act(() => {
      FakeES.instances[0].open();
    });
    await waitFor(() => expect(result.current.connected).toBe(true));

    act(() => {
      FakeES.instances[0].fail();
    });
    await waitFor(() => expect(result.current.connected).toBe(false));
  });
});

describe('useSse capacityProbePath', () => {
  const ORIGINAL_FETCH = global.fetch;

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    jest.useRealTimers();
  });

  /** Rejects with AbortError once its own signal aborts, mirroring what a
   *  real fetch does when the probe's 10s watchdog fires. */
  function hangingFetch(): jest.Mock {
    return jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('This operation was aborted', 'AbortError')),
          );
        }),
    );
  }

  it('does not permanently disable capacity probing after one probe times out', async () => {
    // Regression test: AbortController.abort() is permanent. Reusing one
    // controller across every probe attempt in a mount meant a single timed-
    // out probe silently aborted (and therefore skipped) every later probe,
    // including ones triggered by a visibility-change reconnect, for the
    // rest of that mount -- with no error, no log, and no signal to the
    // caller. Each probe attempt must get its own controller.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    const hanging = hangingFetch();
    global.fetch = hanging as unknown as typeof fetch;

    renderHook(() =>
      useSse<{ x: number }>({
        url: '/api/cp/events/stream',
        onMessage: () => undefined,
        capacityProbePath: '/api/cp/events/capacity',
      }),
    );

    // The first probe's 10s watchdog fires and aborts it; the hook falls
    // through to opening the EventSource anyway.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
    expect(hanging).toHaveBeenCalledTimes(1);
    expect(FakeES.instances).toHaveLength(1);

    // A visibility-change reconnect triggers a second connect() -- and
    // therefore a second probe -- in the same effect instance.
    const secondProbeSignals: AbortSignal[] = [];
    global.fetch = jest.fn((_url: string, init: RequestInit) => {
      secondProbeSignals.push(init.signal as AbortSignal);
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as unknown as typeof fetch;

    await act(async () => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(secondProbeSignals).toHaveLength(1);
    // Before the fix, this was the same, already-aborted controller shared
    // across the whole mount -- so the second probe would never actually
    // reach the network.
    expect(secondProbeSignals[0].aborted).toBe(false);
  });

  it('does not reopen a connection when the tab is hidden while a probe is in flight', async () => {
    // Narrower race, same root cause as the main bug: hiding the tab closes
    // the EventSource and clears the reconnect timer, but a probe fetch may
    // still be in flight. Aborting that probe (below) is not enough on its
    // own -- `connect()`'s `catch` falls through to `openEventSource()`
    // unconditionally, so an abort-triggered rejection would reopen a
    // connection *immediately*, which is worse than the original race (which
    // only fired on ordinary network latency). The `suspended` flag is what
    // actually stops the reopen; this test fails without it even though the
    // signal is correctly reported as aborted.
    const probeSignals: AbortSignal[] = [];
    global.fetch = jest.fn((_url: string, init: RequestInit) => {
      probeSignals.push(init.signal as AbortSignal);
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('This operation was aborted', 'AbortError')),
        );
      });
    }) as unknown as typeof fetch;

    const { result } = renderHook(() =>
      useSse<{ x: number }>({
        url: '/api/cp/events/stream',
        onMessage: () => undefined,
        capacityProbePath: '/api/cp/events/capacity',
      }),
    );

    expect(probeSignals).toHaveLength(1);
    expect(probeSignals[0].aborted).toBe(false);

    await act(async () => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      // Let the now-aborted probe's rejection actually settle inside connect().
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(probeSignals[0].aborted).toBe(true);
    expect(result.current.state).toBe('closed');
    expect(FakeES.instances).toHaveLength(0);
  });
});
