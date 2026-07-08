import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '@/test/test-utils';
import { C } from '@/lib/colors';
import type { Webhook, WebhookCircuitBreaker } from '@/lib/types/cp';

const getMock = jest.fn();
const putMock = jest.fn();
const delMock = jest.fn();
const postMock = jest.fn();

jest.mock('@/lib/api/client', () => ({
  getJSON: (...args: unknown[]) => getMock(...args),
  putJSON: (...args: unknown[]) => putMock(...args),
  delJSON: (...args: unknown[]) => delMock(...args),
  postJSON: (...args: unknown[]) => postMock(...args),
}));

import { WebhookList } from './webhook-list';

function webhook(id: string, overrides: Partial<Webhook> = {}): Webhook {
  return {
    id,
    url: `https://hooks.example/${id}`,
    events: ['session.complete'],
    active: true,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function breaker(
  state: WebhookCircuitBreaker['state'],
  failures = 0,
): WebhookCircuitBreaker {
  return { state, failures, consecutiveSuccesses: 0, openedAt: null, nextProbeAt: null };
}

const CLOSED = breaker('closed');

function wireApi(webhooks: Webhook[], breakers: Record<string, WebhookCircuitBreaker> = {}) {
  getMock.mockImplementation(async (url: string) => {
    if (url === '/api/cp/webhooks') return { webhooks };
    const m = /^\/api\/cp\/webhooks\/(.+)\/circuit-breaker$/.exec(url);
    if (m) return breakers[decodeURIComponent(m[1])] ?? CLOSED;
    throw new Error(`unexpected GET ${url}`);
  });
}

beforeEach(() => {
  getMock.mockReset();
  putMock.mockReset();
  delMock.mockReset();
  postMock.mockReset();
});

async function renderList(
  webhooks: Webhook[],
  breakers: Record<string, WebhookCircuitBreaker> = {},
) {
  wireApi(webhooks, breakers);
  const utils = renderWithClient(<WebhookList />);
  if (webhooks.length > 0) {
    await screen.findByText(webhooks[0].url);
  }
  return utils;
}

describe('breaker pill state mapping', () => {
  it('maps closed / open / half-open to their label, color and reset affordance', async () => {
    const user = userEvent.setup();
    await renderList(
      [webhook('wh-closed'), webhook('wh-open'), webhook('wh-half')],
      {
        'wh-closed': breaker('closed', 0),
        'wh-open': breaker('open', 3),
        'wh-half': breaker('half_open', 1),
      },
    );

    const pills = screen.getAllByTitle('Show / refresh breaker state');
    expect(pills).toHaveLength(3);
    for (const pill of pills) await user.click(pill);

    const closedPill = await screen.findByText('breaker closed · failures 0');
    const openPill = await screen.findByText('breaker open · failures 3');
    const halfPill = await screen.findByText('breaker half-open · failures 1');

    expect(closedPill).toHaveStyle({ color: C.green });
    expect(openPill).toHaveStyle({ color: C.red });
    expect(halfPill).toHaveStyle({ color: C.amber });

    // Reset is offered only for tripped (open / half-open) breakers.
    expect(screen.getAllByTitle('Reset circuit breaker')).toHaveLength(2);
  });
});

describe('tripped-breaker banner', () => {
  it('pluralizes when several breakers are tripped', async () => {
    await renderList([webhook('a'), webhook('b'), webhook('c')], {
      a: breaker('open', 5),
      b: breaker('half_open', 1),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('2 webhook breakers tripped');
  });

  it('uses the singular form for one tripped breaker', async () => {
    await renderList([webhook('a'), webhook('b')], { a: breaker('open', 2) });
    expect(await screen.findByRole('alert')).toHaveTextContent('1 webhook breaker tripped');
  });

  it('shows no banner when all breakers are closed', async () => {
    await renderList([webhook('a'), webhook('b')]);
    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith('/api/cp/webhooks/a/circuit-breaker'),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('select-all checkbox', () => {
  it('selects every row, then clears on a second click', async () => {
    const user = userEvent.setup();
    await renderList([webhook('a'), webhook('b')]);

    const all = screen.getByLabelText('Select all webhooks');
    await user.click(all);

    expect(screen.getByLabelText('Select webhook https://hooks.example/a')).toBeChecked();
    expect(screen.getByLabelText('Select webhook https://hooks.example/b')).toBeChecked();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(all).toBeChecked();

    await user.click(all);
    expect(screen.getByLabelText('Select webhook https://hooks.example/a')).not.toBeChecked();
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it('promotes a partial selection to all rows instead of clearing', async () => {
    const user = userEvent.setup();
    await renderList([webhook('a'), webhook('b')]);

    await user.click(screen.getByLabelText('Select webhook https://hooks.example/a'));
    expect(screen.getByLabelText('Select all webhooks')).not.toBeChecked();

    await user.click(screen.getByLabelText('Select all webhooks'));
    expect(screen.getByLabelText('Select webhook https://hooks.example/b')).toBeChecked();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });
});

describe('bulk apply toasts', () => {
  it('pluralizes the success toast for multiple webhooks', async () => {
    const user = userEvent.setup();
    putMock.mockResolvedValue({});
    await renderList([webhook('a'), webhook('b')]);

    await user.click(screen.getByLabelText('Select all webhooks'));
    await user.click(screen.getByRole('button', { name: 'Pause' }));

    expect(await screen.findByText('Paused 2 webhooks')).toBeInTheDocument();
    expect(putMock).toHaveBeenCalledWith('/api/cp/webhooks/a', { active: false });
    expect(putMock).toHaveBeenCalledWith('/api/cp/webhooks/b', { active: false });
    // Selection is cleared after the bulk action.
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
  });

  it('uses the singular form for a single webhook', async () => {
    const user = userEvent.setup();
    putMock.mockResolvedValue({});
    await renderList([webhook('a'), webhook('b')]);

    await user.click(screen.getByLabelText('Select webhook https://hooks.example/a'));
    await user.click(screen.getByRole('button', { name: 'Resume' }));

    expect(await screen.findByText('Resumed 1 webhook')).toBeInTheDocument();
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledWith('/api/cp/webhooks/a', { active: true });
  });

  it('reports partial failures as an error toast with ok/fail counts', async () => {
    const user = userEvent.setup();
    putMock.mockImplementation(async (url: string) => {
      if (url.includes('/b')) throw new Error('upstream 500');
      return {};
    });
    await renderList([webhook('a'), webhook('b')]);

    await user.click(screen.getByLabelText('Select all webhooks'));
    await user.click(screen.getByRole('button', { name: 'Pause' }));

    expect(await screen.findByText('Paused 1, 1 failed')).toBeInTheDocument();
  });

  it('asks for confirmation before a bulk delete and reports the result', async () => {
    const user = userEvent.setup();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    delMock.mockResolvedValue(undefined);
    await renderList([webhook('a'), webhook('b')]);

    await user.click(screen.getByLabelText('Select all webhooks'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(confirmSpy).toHaveBeenCalledWith('Delete 2 webhooks? This cannot be undone.');
    expect(await screen.findByText('Deleted 2 webhooks')).toBeInTheDocument();
    expect(delMock).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the delete confirmation is declined', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    await renderList([webhook('a')]);

    await user.click(screen.getByLabelText('Select all webhooks'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(delMock).not.toHaveBeenCalled();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });
});
