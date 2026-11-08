import { fireEvent, screen } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import { ApiError } from '@/lib/api/client';
import { launchErrorMessage, ScenarioDetail } from './scenario-detail';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/scenarios/demo',
  useSearchParams: () => new URLSearchParams(),
}));

function err429(retryAfter: number | undefined) {
  return new ApiError('POST', '/api/playground/runs', 429, {
    text: undefined,
    truncated: false,
    retryAfter,
  });
}

describe('launchErrorMessage', () => {
  it('names the wait, rounded up, when the 429 gave one', () => {
    expect(launchErrorMessage(err429(4.2))).toBe(
      'Too many runs — try again in 5 s',
    );
    expect(launchErrorMessage(err429(30))).toBe(
      'Too many runs — try again in 30 s',
    );
  });

  it('never says "0 s": a zero or sub-second hint reads as 1 s', () => {
    for (const n of [0, 0.2, -3]) {
      expect(launchErrorMessage(err429(n))).toBe(
        'Too many runs — try again in 1 s',
      );
    }
  });

  it('falls back to "shortly" when the 429 gave no hint', () => {
    expect(launchErrorMessage(err429(undefined))).toBe(
      'Too many runs — try again shortly',
    );
  });

  it('leaves any other error as it was', () => {
    const e = new ApiError('POST', '/api/playground/runs', 500, {
      text: 'boom',
      truncated: false,
      retryAfter: undefined,
    });
    expect(launchErrorMessage(e)).toBe(String(e));
    expect(launchErrorMessage(new Error('x'))).toBe('Error: x');
  });
});

describe('ScenarioDetail launch', () => {
  const SCENARIO = {
    metadata: { name: 'Demo', version: '1.0.0', summary: 's', tags: [] },
    spec: {
      agents: [],
      workflow: { steps: [] },
      inputs: { schema: { type: 'object', properties: {} } },
      trust: {},
    },
    templates: [],
  };

  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('shows the 429 wait from Retry-After above the form', async () => {
    // jsdom here has no `Response`: return only what the client reads.
    const spy = jest.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.stringify({ error: 'rate_limited' });
        return {
          ok: false,
          status: 429,
          headers: {
            get: (h: string) =>
              h.toLowerCase() === 'retry-after' ? '12' : null,
          },
          text: async () => body,
          json: async () => JSON.parse(body),
        };
      }
      const body = JSON.stringify(SCENARIO);
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => body,
        json: async () => JSON.parse(body),
      };
    });
    global.fetch = spy as unknown as typeof fetch;

    const { container } = renderWithClient(
      <ScenarioDetail scenarioRef="demo" />,
    );
    await screen.findByText('Run inputs');
    fireEvent.submit(container.querySelector('form')!);

    expect(
      await screen.findByText('Too many runs — try again in 12 s'),
    ).toBeInTheDocument();
    expect(
      spy.mock.calls.some(
        ([p, i]) => p === '/api/playground/runs' && i?.method === 'POST',
      ),
    ).toBe(true);
  });
});
