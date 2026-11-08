import { screen, waitFor } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import { ConsoleSessionProvider } from '@/hooks/use-console-session';
import { OperatorOnly, useLoginHref } from './operator-only';
import { MetricsPanel } from '@/components/config/metrics-panel';
import { WebhookList } from '@/components/config/webhook-list';
import { RevocationView } from '@/components/trust/revocation';
import { Topbar } from '@/components/layout/topbar';

let pathname = '/config';
jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const ISS = 'aid:pubkey:issuer-a';

/** Answers every console route. jsdom here has no `Response`, so this
 *  returns only the members the API client reads. */
function serveConsole(session: { publicMode: boolean; signedIn: boolean }) {
  const bodies: Array<[RegExp, unknown]> = [
    [/^\/api\/auth\/session/, session],
    [
      /^\/api\/cp\/revocation\/issuers/,
      { issuers: [{ iss: ISS, entries: 1 }], limit: 1000, offset: 0 },
    ],
    [/^\/api\/cp\/revocations/, { iss: ISS, entries: [] }],
    [/^\/api\/cp\/tcts/, { tcts: [], total: 0 }],
    [/^\/api\/cp\/webhooks/, { webhooks: [] }],
    [/metrics/, ''],
  ];
  const spy = jest.fn(async (path: string) => {
    const hit = bodies.find(([re]) => re.test(path));
    const body = hit ? hit[1] : {};
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => text,
      json: async () => JSON.parse(text || '{}'),
    };
  });
  global.fetch = spy as unknown as typeof fetch;
  return spy;
}

const ADMIN_GET =
  /^\/api\/(cp\/(metrics|webhooks|revocations|audit)|playground\/metrics)/;

function adminCalls(spy: jest.Mock): string[] {
  return spy.mock.calls
    .map((c) => String(c[0]))
    .filter((p) => ADMIN_GET.test(p));
}

/** Let any query that was going to start, start. */
async function settle(spy: jest.Mock) {
  await waitFor(() =>
    expect(spy.mock.calls.some((c) => c[0] === '/api/auth/session')).toBe(true),
  );
  await new Promise((r) => setTimeout(r, 50));
}

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  pathname = '/config';
});

describe('OperatorOnly', () => {
  it('names the section and links to sign-in, coming back here', () => {
    pathname = '/trust/revocation';
    renderWithClient(<OperatorOnly what="Webhooks" />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(
      'Webhooks: operator only. Sign in to see this.',
    );
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=%2Ftrust%2Frevocation',
    );
  });

  it('reads generically with no section name', () => {
    renderWithClient(<OperatorOnly />);
    expect(screen.getByRole('note')).toHaveTextContent(
      'Operator only. Sign in to see this.',
    );
  });

  it('useLoginHref encodes the current path', () => {
    pathname = '/runs/a b';
    function Probe() {
      return <span>{useLoginHref()}</span>;
    }
    renderWithClient(<Probe />);
    expect(screen.getByText('/login?next=%2Fruns%2Fa%20b')).toBeInTheDocument();
  });
});

describe('AC3: public mode, not signed in', () => {
  const ANON = { publicMode: true, signedIn: false };

  it.each([
    [
      'MetricsPanel (playground)',
      <MetricsPanel key="p" source="playground" />,
      'Metrics: operator only',
    ],
    [
      'MetricsPanel (cp)',
      <MetricsPanel key="c" source="cp" />,
      'Metrics: operator only',
    ],
    ['WebhookList', <WebhookList key="w" />, 'Webhooks: operator only'],
    [
      'RevocationView',
      <RevocationView key="r" />,
      'Recording a revocation: operator only',
    ],
  ])(
    '%s shows the notice and sends no admin request',
    async (_name, ui, notice) => {
      const spy = serveConsole(ANON);
      renderWithClient(<ConsoleSessionProvider>{ui}</ConsoleSessionProvider>);
      expect(await screen.findByText(new RegExp(notice))).toBeInTheDocument();
      await settle(spy);
      expect(adminCalls(spy)).toEqual([]);
    },
  );

  it('signed in, the same sections do fetch (the gate is the session)', async () => {
    const spy = serveConsole({ publicMode: true, signedIn: true });
    renderWithClient(
      <ConsoleSessionProvider>
        <MetricsPanel source="cp" />
        <WebhookList />
      </ConsoleSessionProvider>,
    );
    await waitFor(() => {
      const calls = adminCalls(spy);
      expect(calls.some((p) => p.startsWith('/api/cp/metrics'))).toBe(true);
      expect(calls.some((p) => p.startsWith('/api/cp/webhooks'))).toBe(true);
    });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('flag off, the sections fetch as before', async () => {
    const spy = serveConsole({ publicMode: false, signedIn: false });
    renderWithClient(
      <ConsoleSessionProvider>
        <MetricsPanel source="playground" />
      </ConsoleSessionProvider>,
    );
    await waitFor(() =>
      expect(
        adminCalls(spy).some((p) => p.startsWith('/api/playground/metrics')),
      ).toBe(true),
    );
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('Topbar', () => {
  it('offers Sign in, and no sign-out, to an anonymous visitor', async () => {
    pathname = '/registry';
    serveConsole({ publicMode: true, signedIn: false });
    renderWithClient(
      <ConsoleSessionProvider>
        <Topbar />
      </ConsoleSessionProvider>,
    );
    const link = await screen.findByRole('link', { name: /Sign in/ });
    expect(link).toHaveAttribute('href', '/login?next=%2Fregistry');
    expect(
      screen.queryByRole('button', { name: 'Sign out' }),
    ).not.toBeInTheDocument();
  });

  it('keeps sign-out, and no Sign in, for an operator', async () => {
    const spy = serveConsole({ publicMode: true, signedIn: true });
    renderWithClient(
      <ConsoleSessionProvider>
        <Topbar />
      </ConsoleSessionProvider>,
    );
    await settle(spy);
    expect(
      screen.getByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Sign in/ }),
    ).not.toBeInTheDocument();
  });

  it('is unchanged with no session provider (flag-off default)', () => {
    renderWithClient(<Topbar />);
    expect(
      screen.getByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument();
  });
});
