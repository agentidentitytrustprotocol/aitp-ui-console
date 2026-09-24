'use client';

import { useState } from 'react';

/** The run-relative time base for one run's timeline: the **earliest `ts`
 *  this run has ever shown us**, held across re-renders and only ever
 *  lowered.
 *
 *  Playground's `ts` is epoch seconds (see `runOffsetMs` in `@/lib/utils`),
 *  so every offset in the timeline is a delta against this value. Two
 *  separate things make "just read `events[0].ts` each render" wrong, and
 *  they push the base in *opposite* directions — which is why the rule is a
 *  monotonically-lowering hold rather than a one-time capture:
 *
 *  - **Buffer eviction.** `use-run-events.ts` caps the live SSE buffer at
 *    `maxBuffer = 500` and drops from the **front**, so on a long run
 *    `events[0]` moves forward and every offset would jump down at the
 *    moment the 501st event arrives.
 *  - **The source swap.** `run-detail.tsx`'s `mergeRunEvents` feeds the
 *    timeline the live SSE buffer while the run is active and the persisted
 *    `run.data.events` once it is terminal. The persisted array always
 *    starts at the true first event, so a base captured once from an
 *    already-evicted live buffer is *too late* and every offset after the
 *    swap goes negative.
 *
 *  `Math.min` is correct under both: eviction cannot raise it, and the swap
 *  lowers it back to the true run start. A one-time capture is correct under
 *  neither, and "recompute from `events[0]`" is correct under neither.
 *
 *  Implemented as React's "adjusting state during render" pattern rather than
 *  a ref: a ref read or written during render is both unsound under the React
 *  compiler and rejected by this repo's `react-hooks/refs` lint rule. The
 *  computed `next` is returned directly rather than the state variable, so the
 *  very first render pass already has the base and a timeline never paints a
 *  frame of offset-less rows while waiting for the state update to land. The
 *  `setBase` call is guarded on an actual change, so it runs once per genuine
 *  lowering — never on a steady-state render.
 *
 *  Returns `undefined` until the first event with a usable `ts` arrives;
 *  callers render no offset rather than `NaN`. */
export function useRunTimeBase(
  events: readonly { ts?: number }[],
): number | undefined {
  const [base, setBase] = useState<number | undefined>(undefined);

  const first = events.length > 0 ? events[0].ts : undefined;
  const next =
    typeof first === 'number' && Number.isFinite(first)
      ? base === undefined
        ? first
        : Math.min(base, first)
      : base;

  if (next !== base) setBase(next);

  return next;
}
