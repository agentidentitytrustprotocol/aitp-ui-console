import { act, screen, fireEvent } from '@testing-library/react';
import { EventTicker } from './event-ticker';
import { renderWithClient } from '@/test/test-utils';
import type { CpEvent } from '@/lib/types/cp';

interface FakeEventSource {
  url: string;
  open(): void;
  emit(data: unknown): void;
  fail(): void;
}
const FakeES = (globalThis as unknown as { EventSource: { instances: FakeEventSource[] } })
  .EventSource;

// Capacity probe in useSse fetches the SSE path before opening EventSource.
// Stub it so the probe sees a 200 and useSse proceeds to open the stream.
const realFetch = global.fetch;
beforeEach(() => {
  FakeES.instances.length = 0;
  global.fetch = jest.fn(async () => new Response('', { status: 200 })) as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = realFetch;
});

function evt(partial: Partial<CpEvent>): CpEvent {
  return {
    id: partial.id ?? 'e1',
    type: partial.type ?? 'agent.registered',
    ts: partial.ts ?? '2026-06-08T00:00:00Z',
    aidA: partial.aidA,
    aidB: partial.aidB,
    sessionId: partial.sessionId,
    payload: partial.payload ?? {},
  } as CpEvent;
}

async function waitForEventSource() {
  // The probe fetch is async — useSse opens the EventSource on the next
  // microtask. Yield a few ticks so jsdom can settle.
  for (let i = 0; i < 5; i++) {
    if (FakeES.instances.length > 0) return FakeES.instances[0];
    await act(async () => Promise.resolve());
  }
  throw new Error('EventSource never opened');
}

describe('EventTicker', () => {
  it('announces connected state with a live region', async () => {
    renderWithClient(<EventTicker />);
    const es = await waitForEventSource();
    act(() => es.open());

    const status = screen.getByRole('status', { name: /event stream/i });
    expect(status).toHaveAttribute('aria-label', expect.stringMatching(/connected/i));
  });

  it('renders incoming events and filters by the search box', async () => {
    renderWithClient(<EventTicker />);
    const es = await waitForEventSource();
    act(() => es.open());

    act(() => {
      es.emit(evt({ id: 'a', type: 'agent.registered', aidA: 'aid:pubkey:alice' }));
      es.emit(evt({ id: 'b', type: 'handshake.complete', aidA: 'aid:pubkey:bob' }));
    });

    // Both event types visible in the ticker.
    expect(screen.getAllByText(/agent\.registered/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/handshake\.complete/i).length).toBeGreaterThan(0);

    const search = screen.getByPlaceholderText(/filter by type/i);
    fireEvent.change(search, { target: { value: 'handshake' } });

    expect(screen.queryByText(/agent\.registered/i)).toBeNull();
    expect(screen.getAllByText(/handshake\.complete/i).length).toBeGreaterThan(0);
  });

  it('announces reconnecting state when the stream errors', async () => {
    renderWithClient(<EventTicker />);
    const es = await waitForEventSource();
    act(() => es.open());
    act(() => es.fail());

    const status = screen.getByRole('status', { name: /event stream/i });
    expect(status.getAttribute('aria-label')).toMatch(/reconnect|disconnect/i);
  });
});
