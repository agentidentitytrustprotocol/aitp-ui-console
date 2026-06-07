import { act, renderHook, waitFor } from '@testing-library/react';
import { useRunEvents } from './use-run-events';

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

describe('useRunEvents', () => {
  it('does not subscribe when runId is null', () => {
    renderHook(() => useRunEvents(null));
    expect(FakeES.instances).toHaveLength(0);
  });

  it('appends incoming events to the buffer', async () => {
    const { result } = renderHook(() => useRunEvents('run-1'));
    act(() => FakeES.instances[0].open());
    act(() => {
      FakeES.instances[0].emit({ type: 'agent.spawning', ts: 1, payload: {} });
      FakeES.instances[0].emit({ type: 'agent.ready', ts: 2, payload: {} });
    });
    await waitFor(() => expect(result.current.events).toHaveLength(2));
    expect(result.current.events.map((e) => e.type)).toEqual([
      'agent.spawning',
      'agent.ready',
    ]);
  });

  it('caps the buffer at maxBuffer and drops the oldest entries', () => {
    const { result } = renderHook(() => useRunEvents('run-1', { maxBuffer: 3 }));
    act(() => FakeES.instances[0].open());
    act(() => {
      for (let i = 0; i < 10; i++) {
        FakeES.instances[0].emit({ type: 'step.complete', ts: i, payload: { i } });
      }
    });
    expect(result.current.events).toHaveLength(3);
    // Newest survive — oldest 7 dropped.
    expect(result.current.events.map((e) => e.ts)).toEqual([7, 8, 9]);
  });

  it('flips done=true on stream.end without appending', () => {
    const { result } = renderHook(() => useRunEvents('run-1'));
    act(() => FakeES.instances[0].open());
    act(() => FakeES.instances[0].emit({ type: 'stream.end' }));
    expect(result.current.done).toBe(true);
    expect(result.current.events).toHaveLength(0);
  });

  it('appends terminal run.complete and flips done=true', () => {
    const { result } = renderHook(() => useRunEvents('run-1'));
    act(() => FakeES.instances[0].open());
    act(() => FakeES.instances[0].emit({ type: 'run.complete', ts: 5, payload: {} }));
    expect(result.current.done).toBe(true);
    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].type).toBe('run.complete');
  });
});
