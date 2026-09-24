import { render, screen } from '@testing-library/react';
import { RunSummary } from './run-summary';
import type { RunEvent, RunResponse } from '@/lib/types/playground';

/** Epoch seconds — the shape playground puts on the wire (`time.time()`). */
const T0 = 1_790_199_933.127181;

function run(overrides: Partial<RunResponse> = {}): RunResponse {
  return {
    run_id: 'run-7f3c',
    status: 'success',
    scenario_ref: 'intra-org/research-and-write@1.0.0',
    outputs: {},
    events: [],
    error: null,
    created_at: T0,
    ...overrides,
  };
}

const ev = (
  type: string,
  ts: number,
  extra: Partial<RunEvent> = {},
): RunEvent => ({ type, ts, ...extra });

/** The `Duration` row's value cell. */
function durationText(): string {
  const label = screen.getByText('Duration');
  return label.nextElementSibling?.textContent ?? '';
}

describe('RunSummary duration', () => {
  it('is last − first for a two-event epoch pair', () => {
    render(
      <RunSummary
        run={run()}
        events={[ev('run.started', T0), ev('run.complete', T0 + 2.5)]}
        baseTs={T0}
      />,
    );
    expect(durationText()).toBe('2.5s');
  });

  it('does not report the epoch itself as the duration', () => {
    // Pre-fix this was `events[events.length - 1].ts / 1000`, which reported
    // ~1.79 million seconds (20+ days) for every run ever displayed.
    const { container } = render(
      <RunSummary
        run={run()}
        events={[ev('run.started', T0), ev('run.complete', T0 + 2.5)]}
        baseTs={T0}
      />,
    );
    expect(container).not.toHaveTextContent('1790199.9s');
    expect(container).not.toHaveTextContent(/17901\d\d\.\ds/);
  });

  it('measures from the held base, not from the oldest event still buffered', () => {
    // The live SSE buffer drops from the front at 500 events. Using
    // `events[0]` once that has happened under-reports the duration; the base
    // threaded in from `useRunTimeBase` is the true run start.
    render(
      <RunSummary
        run={run({ status: 'running' })}
        events={[ev('llm.complete', T0 + 40), ev('step.complete', T0 + 47)]}
        baseTs={T0}
      />,
    );
    expect(durationText()).toBe('47.0s');
  });

  it('falls back to the first event in hand when no base is threaded in', () => {
    render(
      <RunSummary
        run={run()}
        events={[ev('run.started', T0), ev('run.complete', T0 + 9)]}
      />,
    );
    expect(durationText()).toBe('9.0s');
  });

  it('shows 0.0s — not NaN — for a run with no events yet', () => {
    const { container } = render(
      <RunSummary run={run({ status: 'pending' })} events={[]} />,
    );
    expect(durationText()).toBe('0.0s');
    expect(container).not.toHaveTextContent('NaN');
  });

  it('reports a clock-skewed run as a negative duration rather than flooring it', () => {
    // The last event is stamped *before* the base. That is reachable: the
    // orchestrator (`runner/context.py`) and the agent subprocesses
    // (`agents/base/telemetry.py`) each call `time.time()` in their own
    // process, so a final agent-channel frame can carry an earlier stamp than
    // the run's first orchestrator frame. Same decision as `formatOffset`'s
    // signed offsets: the duration is left unclamped, because `0.0s` here would
    // present a measured inversion as a completed instant and hide the one
    // fact this row had. Also asserts it does not crash or print `NaN`.
    const { container } = render(
      <RunSummary
        run={run()}
        events={[ev('run.started', T0), ev('llm.complete', T0 - 0.4)]}
        baseTs={T0}
      />,
    );
    expect(durationText()).toBe('-0.4s');
    expect(container).not.toHaveTextContent('NaN');
  });

  it('shows 0.0s for a single event, which is its own base', () => {
    render(
      <RunSummary
        run={run({ status: 'running' })}
        events={[ev('run.started', T0)]}
      />,
    );
    expect(durationText()).toBe('0.0s');
  });
});

describe('RunSummary counts', () => {
  it('counts handshakes, halves the llm start/complete pair, and lists grants', () => {
    render(
      <RunSummary
        run={run()}
        events={[
          ev('run.started', T0),
          ev('trust.established', T0 + 1, { grants: ['summarize.text'] }),
          ev('trust.established', T0 + 2, {
            grants: ['write.doc', 'summarize.text'],
          }),
          ev('llm.started', T0 + 3),
          ev('llm.complete', T0 + 4),
          ev('run.complete', T0 + 5),
        ]}
        baseTs={T0}
      />,
    );

    expect(screen.getByText('Handshakes').nextElementSibling).toHaveTextContent(
      '2',
    );
    expect(screen.getByText('LLM calls').nextElementSibling).toHaveTextContent(
      '1',
    );
    expect(screen.getByText('Events').nextElementSibling).toHaveTextContent(
      '6',
    );
    // De-duplicated across both handshakes.
    expect(screen.getByText('summarize.text')).toBeInTheDocument();
    expect(screen.getByText('write.doc')).toBeInTheDocument();
  });
});
