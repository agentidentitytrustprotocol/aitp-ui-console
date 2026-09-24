import { StrictMode } from 'react';
import { renderHook } from '@testing-library/react';
import { useRunTimeBase } from './use-run-time-base';

/** Epoch seconds, the shape playground actually puts on the wire. */
const T0 = 1_790_199_933.127181;
const ev = (ts: number) => ({ ts });

describe('useRunTimeBase', () => {
  it('is undefined until the first event arrives, so callers can render no offset', () => {
    const { result } = renderHook(() => useRunTimeBase([]));
    expect(result.current).toBeUndefined();
  });

  it('takes the first event as the base', () => {
    const { result } = renderHook(() => useRunTimeBase([ev(T0), ev(T0 + 1)]));
    expect(result.current).toBe(T0);
  });

  it('keeps the base when later renders append events', () => {
    const { result, rerender } = renderHook(
      (events: { ts: number }[]) => useRunTimeBase(events),
      {
        initialProps: [ev(T0)],
      },
    );
    rerender([ev(T0), ev(T0 + 1), ev(T0 + 2)]);
    expect(result.current).toBe(T0);
  });

  it('does not rise when the live SSE buffer evicts from the front', () => {
    // `use-run-events.ts` caps the buffer at 500 and drops the oldest events,
    // so `events[0]` moves forward on a long run. Recomputing from `events[0]`
    // each render would make every offset in the timeline jump down at once.
    const { result, rerender } = renderHook(
      (events: { ts: number }[]) => useRunTimeBase(events),
      {
        initialProps: [ev(T0), ev(T0 + 1), ev(T0 + 2)],
      },
    );
    expect(result.current).toBe(T0);

    rerender([ev(T0 + 1), ev(T0 + 2)]); // front dropped
    expect(result.current).toBe(T0);

    rerender([ev(T0 + 2)]); // dropped again
    expect(result.current).toBe(T0);
  });

  it('lowers the base when the persisted record replaces a truncated live buffer', () => {
    // `mergeRunEvents` swaps the live SSE buffer for `run.data.events` once the
    // run is terminal. The persisted array always starts at the true first
    // event, so a base captured from an already-evicted buffer is too LATE and
    // every offset after the swap would go negative. Only `Math.min` is right
    // under both this and the eviction case above.
    const { result, rerender } = renderHook(
      (events: { ts: number }[]) => useRunTimeBase(events),
      {
        initialProps: [ev(T0 + 40), ev(T0 + 41)], // live buffer, front already evicted
      },
    );
    expect(result.current).toBe(T0 + 40);

    rerender([ev(T0), ev(T0 + 40), ev(T0 + 41)]); // persisted record, from the top
    expect(result.current).toBe(T0);

    // And it stays there if the shorter array is ever seen again.
    rerender([ev(T0 + 40), ev(T0 + 41)]);
    expect(result.current).toBe(T0);
  });

  it('is stable under StrictMode double-rendering', () => {
    // The base is lowered with a render-time `setState`, so the double
    // invocation StrictMode forces is the case that would either loop forever
    // or land on the wrong value if the guard were wrong.
    const { result, rerender } = renderHook(
      (events: { ts: number }[]) => useRunTimeBase(events),
      {
        initialProps: [ev(T0 + 40)],
        wrapper: StrictMode,
      },
    );
    expect(result.current).toBe(T0 + 40);

    rerender([ev(T0), ev(T0 + 40)]);
    expect(result.current).toBe(T0);
  });

  it('ignores a first event with a missing or non-finite ts', () => {
    const { result, rerender } = renderHook(
      (events: { ts?: number }[]) => useRunTimeBase(events),
      { initialProps: [{} as { ts?: number }] },
    );
    expect(result.current).toBeUndefined();

    rerender([{ ts: Number.NaN }]);
    expect(result.current).toBeUndefined();

    rerender([ev(T0)]);
    expect(result.current).toBe(T0);
  });
});
