import { screen, waitFor, within } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import type { RunDeliveriesResponse } from '@/lib/types/playground';

const getMock = jest.fn();

jest.mock('@/lib/api/client', () => ({
  getJSON: (...args: unknown[]) => getMock(...args),
}));

import { RunDeliveries } from './run-deliveries';

/** Epoch seconds — the shape playground actually stamps on every run event,
 *  `cp.webhook.delivered` rows included (`api/webhooks.py:91`,
 *  `"ts": time.time()`). Same magnitude `src/lib/utils.ts`'s `runOffsetMs`
 *  doc comment and `event-cards.test.tsx`'s fixtures use. */
const BASE_TS = 1_790_199_933.127181;

function response(
  overrides: Partial<RunDeliveriesResponse> = {},
): RunDeliveriesResponse {
  return {
    run_id: 'run-7f3c',
    subscribed: true,
    webhook: null,
    deliveries: [],
    count: 0,
    ...overrides,
  };
}

/** The "When" cell of the first delivery row. Scoped to the row rather than a
 *  bare `getByText('—')` — the JTI and Step columns fall back to the same
 *  em dash, so an unscoped lookup is ambiguous the moment any of them is
 *  blank too. */
async function firstRowWhenCell(): Promise<string | null> {
  const rows = await screen.findAllByRole('row');
  const dataRow = rows[1]; // rows[0] is the header row
  const cells = within(dataRow).getAllByRole('cell');
  return cells[0].textContent;
}

beforeEach(() => {
  getMock.mockReset();
});

describe('RunDeliveries · When column (regression: ts is epoch seconds, not ms-since-start)', () => {
  it('renders a real run-relative offset given a baseTs, not the raw epoch stamp', async () => {
    getMock.mockResolvedValue(
      response({
        deliveries: [
          {
            id: 'd1',
            ts: BASE_TS + 1.5,
            event_type: 'cp.webhook.delivered',
            jti: 'jti-1',
          },
        ],
      }),
    );

    renderWithClient(<RunDeliveries runId="run-7f3c" baseTs={BASE_TS} />);

    await screen.findByText('cp.webhook.delivered');
    // What the pre-fix `(ts / 1000).toFixed(1)` code rendered for exactly this
    // frame — the same unit bug Phase 4 fixed everywhere else in the timeline —
    // was `+1790199934.6s`. The "When" cell (and only that cell — the raw
    // delivery dump in the Detail column legitimately still carries the epoch
    // `ts`) must show the real offset instead.
    expect(await firstRowWhenCell()).toBe('+1.5s');
  });

  it('renders no offset — not a wrong one — when baseTs has not been threaded in yet', async () => {
    getMock.mockResolvedValue(
      response({
        deliveries: [
          { id: 'd1', ts: BASE_TS + 1.5, event_type: 'cp.webhook.delivered' },
        ],
      }),
    );

    renderWithClient(<RunDeliveries runId="run-7f3c" />);

    await screen.findByText('cp.webhook.delivered');
    expect(await firstRowWhenCell()).toBe('—');
  });

  it('renders a negative offset honestly, matching the Timeline tab’s convention', async () => {
    // Clock skew between the CP's webhook dispatcher and the run's own first
    // event can place a delivery fractionally before the base, same as the
    // Timeline tab's `formatOffset`.
    getMock.mockResolvedValue(
      response({
        deliveries: [
          { id: 'd1', ts: BASE_TS - 0.012, event_type: 'cp.webhook.delivered' },
        ],
      }),
    );

    renderWithClient(<RunDeliveries runId="run-7f3c" baseTs={BASE_TS} />);

    await screen.findByText('cp.webhook.delivered');
    expect(await firstRowWhenCell()).toBe('-12ms');
  });

  it('renders a dash when the delivery itself carries no numeric ts', async () => {
    getMock.mockResolvedValue(
      response({
        deliveries: [{ id: 'd1', event_type: 'cp.webhook.delivered' }],
      }),
    );

    renderWithClient(<RunDeliveries runId="run-7f3c" baseTs={BASE_TS} />);

    await screen.findByText('cp.webhook.delivered');
    expect(await firstRowWhenCell()).toBe('—');
  });
});

describe('RunDeliveries · other states', () => {
  it('shows a loading skeleton, then the deliveries once the query resolves', async () => {
    let resolve!: (v: RunDeliveriesResponse) => void;
    getMock.mockReturnValue(new Promise((r) => (resolve = r)));

    renderWithClient(<RunDeliveries runId="run-7f3c" baseTs={BASE_TS} />);
    expect(screen.queryByText(/CP deliveries/)).not.toBeInTheDocument();

    resolve(
      response({
        count: 1,
        deliveries: [
          { id: 'd1', ts: BASE_TS, event_type: 'cp.webhook.delivered' },
        ],
      }),
    );
    await screen.findByText('CP deliveries · 1');
  });

  it('shows an error state when the query fails', async () => {
    getMock.mockRejectedValue(new Error('boom'));
    renderWithClient(<RunDeliveries runId="run-7f3c" />);
    await waitFor(() =>
      expect(screen.getByText('Deliveries unavailable')).toBeInTheDocument(),
    );
  });

  it('shows a no-subscription empty state when not subscribed and nothing delivered', async () => {
    getMock.mockResolvedValue(response({ subscribed: false, deliveries: [] }));
    renderWithClient(<RunDeliveries runId="run-7f3c" />);
    await screen.findByText('No CP webhook subscription');
  });

  it('shows a no-deliveries-yet state when subscribed but nothing has arrived', async () => {
    getMock.mockResolvedValue(response({ subscribed: true, deliveries: [] }));
    renderWithClient(<RunDeliveries runId="run-7f3c" />);
    await screen.findByText('No deliveries yet');
  });

  it('renders the webhook URL and falls back `type` → `event_type`', async () => {
    getMock.mockResolvedValue(
      response({
        webhook: { url: 'https://hooks.example/run-7f3c' },
        deliveries: [{ id: 'd1', ts: BASE_TS, type: 'legacy.type' }],
      }),
    );

    renderWithClient(<RunDeliveries runId="run-7f3c" baseTs={BASE_TS} />);

    expect(
      await screen.findByText('→ https://hooks.example/run-7f3c'),
    ).toBeInTheDocument();
    expect(screen.getByText('legacy.type')).toBeInTheDocument();
  });
});
