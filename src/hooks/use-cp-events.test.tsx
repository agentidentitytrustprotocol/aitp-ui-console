import { act, renderHook } from '@testing-library/react';
import { useCpEvents } from './use-cp-events';
import type { CpEvent } from '@/lib/types/cp';

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
  // useCpEvents probes the URL first, so stub fetch to return a 200.
  global.fetch = (async () =>
    new Response(null, { status: 200 })) as unknown as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

function emitInOrder(ev: CpEvent[]) {
  for (const e of ev) FakeES.instances[0].emit(e);
}

describe('useCpEvents', () => {
  it('does not subscribe when disabled', () => {
    renderHook(() => useCpEvents({ enabled: false }));
    expect(FakeES.instances).toHaveLength(0);
  });

  it('prepends incoming events so newest is first', async () => {
    const { result } = renderHook(() => useCpEvents());
    // The probe fetch resolves on a microtask — open the ES once that resolves.
    await act(async () => {
      await Promise.resolve();
    });
    act(() => FakeES.instances[0].open());
    act(() =>
      emitInOrder([
        { id: 'a', type: 'agent.registered', ts: 1 } as unknown as CpEvent,
        { id: 'b', type: 'session.opened', ts: 2 } as unknown as CpEvent,
      ]),
    );
    expect(result.current.events.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('caps the buffer at maxBuffer, dropping the oldest tail', async () => {
    const { result } = renderHook(() => useCpEvents({ maxBuffer: 3 }));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => FakeES.instances[0].open());
    act(() => {
      for (let i = 0; i < 8; i++) {
        FakeES.instances[0].emit({ id: String(i), type: 't', ts: i } as unknown as CpEvent);
      }
    });
    expect(result.current.events.map((e) => e.id)).toEqual(['7', '6', '5']);
  });

  it('honours the filter predicate', async () => {
    const { result } = renderHook(() =>
      useCpEvents({ filter: (e) => e.type === 'keep' }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    act(() => FakeES.instances[0].open());
    act(() =>
      emitInOrder([
        { id: 'a', type: 'drop', ts: 1 } as unknown as CpEvent,
        { id: 'b', type: 'keep', ts: 2 } as unknown as CpEvent,
        { id: 'c', type: 'drop', ts: 3 } as unknown as CpEvent,
      ]),
    );
    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].id).toBe('b');
  });
});
