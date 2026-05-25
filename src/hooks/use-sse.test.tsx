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
