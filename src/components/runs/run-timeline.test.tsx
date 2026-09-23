import { render, screen } from '@testing-library/react';
import { RunTimeline } from './run-timeline';
import { mergeRunEvents } from './run-detail';
import RunDetailPage from '@/app/runs/[id]/page';
import { useRunTimeBase } from '@/hooks/use-run-time-base';
import type { RunEvent } from '@/lib/types/playground';

/** Epoch seconds — the shape playground puts on the wire (`time.time()`). */
const T0 = 1_790_199_933.127181;

const ev = (ts: number, agent_id: string): RunEvent => ({ type: 'agent.ready', ts, agent_id });

/** The timeline's rendered offsets, in document order. `agent.ready` with only
 *  an `agent_id` renders exactly one `+`/`-` prefixed cell, the offset. */
const offsets = () => screen.queryAllByText(/^[+-]\d/).map((el) => el.textContent);

/** Mirrors `run-detail.tsx`'s composition exactly — `mergeRunEvents` chooses
 *  the source, `useRunTimeBase` holds the base across the switch, the timeline
 *  renders offsets against it. Re-rendering this same component type preserves
 *  the hook's **state** (`useRunTimeBase` holds the base in `useState`, not a
 *  ref — a ref read or written during render is rejected by this repo's
 *  `react-hooks/refs` lint rule; see `ASSUMPTIONS.md`), which is the whole
 *  point of the test. */
function Harness({
  active,
  live,
  persisted,
}: {
  active: boolean;
  live: RunEvent[];
  persisted?: RunEvent[];
}) {
  const events = mergeRunEvents(active, live, persisted);
  const baseTs = useRunTimeBase(events);
  return <RunTimeline events={events} active={active} connected baseTs={baseTs} />;
}

describe('RunTimeline offsets across the mergeRunEvents source swap', () => {
  it('leaves the common events untouched when the live buffer never evicted', () => {
    // The ordinary case: the live buffer still holds the true first event, so
    // the terminal swap to `run.data.events` adds the final frame and moves
    // nothing that was already on screen.
    const live = [ev(T0, 'researcher'), ev(T0 + 1, 'writer')];
    const persisted = [...live, ev(T0 + 2, 'editor')];

    const { rerender } = render(<Harness active live={live} />);
    expect(offsets()).toEqual(['+0ms', '+1.0s']);

    rerender(<Harness active={false} live={live} persisted={persisted} />);
    expect(offsets()).toEqual(['+0ms', '+1.0s', '+2.0s']);
  });

  it('never renders a negative offset when the persisted record predates the live buffer', () => {
    // The live buffer has evicted its front (`use-run-events.ts` caps at 500
    // and drops the oldest), so its first event is NOT the run's first. When
    // the run goes terminal, `mergeRunEvents` hands the timeline the persisted
    // array, which starts 40s earlier.
    //
    // Note what this test does NOT assert: that the common events keep the
    // offsets they had before the swap. They must not — a base captured from
    // an evicted buffer is too late, and holding it would render the earlier
    // persisted events at -40.0s. Lowering the base re-anchors every row on
    // the true run start, which moves the already-visible rows on purpose.
    const live = [ev(T0 + 40, 'writer'), ev(T0 + 41, 'editor')];
    const persisted = [ev(T0, 'researcher'), ...live];

    const { rerender } = render(<Harness active live={live} />);
    expect(offsets()).toEqual(['+0ms', '+1.0s']);

    rerender(<Harness active={false} live={live} persisted={persisted} />);
    expect(offsets()).toEqual(['+0ms', '+40.0s', '+41.0s']);
    expect(offsets().some((o) => o?.startsWith('-'))).toBe(false);
  });

  it('holds the lowered base if a truncated source is ever seen again', () => {
    const live = [ev(T0 + 40, 'writer')];
    const persisted = [ev(T0, 'researcher'), ev(T0 + 40, 'writer')];

    const { rerender } = render(<Harness active={false} live={live} persisted={persisted} />);
    expect(offsets()).toEqual(['+0ms', '+40.0s']);

    // A late refetch that returns only the tail must not push offsets back.
    rerender(<Harness active live={live} />);
    expect(offsets()).toEqual(['+40.0s']);
  });

  it('renders the empty state without inventing a base', () => {
    const { container } = render(<Harness active live={[]} />);
    expect(screen.getByText('Waiting for first event…')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('NaN');
  });
});

/** Mirrors `src/app/runs/[id]/page.tsx`: the run id **keys** the subtree that
 *  holds the base, so landing on a different run remounts it rather than
 *  re-rendering it. `runId` is deliberately not read inside — the key is the
 *  entire mechanism, and a test that also passed it down as a prop would not
 *  distinguish the two. */
function KeyedRun({ runId, live }: { runId: string; live: RunEvent[] }) {
  return <Harness key={runId} active live={live} />;
}

describe('RunTimeline offsets across a run-identity change', () => {
  // The monotonically-lowering hold is right *within* one run and wrong across
  // two: a base can only ever fall, so run A's start would follow the reader
  // into run B and shift every one of its offsets, forever. Run identity is not
  // visible to `useRunTimeBase` (it takes only the event array), so the reset
  // has to come from above — the `key` on the route segment.
  const RUN_A = [ev(T0, 'researcher'), ev(T0 + 1, 'writer')];
  // A second run that began a minute later. Its own first event is its base.
  const RUN_B = [ev(T0 + 60, 'researcher'), ev(T0 + 90, 'writer')];

  it('re-anchors on the new run when the run id keys the subtree', () => {
    const { rerender } = render(<KeyedRun runId="run-7f3c" live={RUN_A} />);
    expect(offsets()).toEqual(['+0ms', '+1.0s']);

    // The wrapper is NOT unmounted — only the key changes, which is exactly
    // what a client-side navigation between two `/runs/[id]` pages does.
    rerender(<KeyedRun runId="run-91ab" live={RUN_B} />);
    expect(offsets()).toEqual(['+0ms', '+30.0s']);
  });

  it('would carry the first run’s base into the second without that key', () => {
    // The hazard the key closes, pinned so the key cannot be deleted silently.
    const { rerender } = render(<Harness active live={RUN_A} />);
    expect(offsets()).toEqual(['+0ms', '+1.0s']);

    rerender(<Harness active live={RUN_B} />);
    expect(offsets()).toEqual(['+1.0m', '+1.5m']);
  });

  it('is what the route segment actually renders', async () => {
    // Binds the two cases above to the real source: the key comes from
    // `src/app/runs/[id]/page.tsx`, and it is the *decoded* id, the same value
    // the prop carries — so a run id with an encoded character keys once, not
    // twice under two spellings.
    const el = await RunDetailPage({ params: Promise.resolve({ id: 'org%2Frun-7f3c' }) });
    expect(el.key).toBe('org/run-7f3c');
    expect((el.props as { runId: string }).runId).toBe('org/run-7f3c');
  });
});
