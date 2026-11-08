/**
 * AC3, admin actions: with a fixed access value, an anonymous visitor sees no
 * control that starts an admin write and none is sent; an operator sees the
 * control and it sends exactly the admin request. Real hooks, fetch spied.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { renderWithClient } from '@/test/test-utils';
import {
  OperatorAccessProvider,
  type OperatorAccess,
} from '@/hooks/use-console-session';
import { TrustAnchorsView } from '@/components/trust/trust-anchors';
import { PinnedKeysView } from '@/components/trust/pinned-keys';
import { RevocationView } from '@/components/trust/revocation';
import { FederationView } from '@/components/federation/federation-view';
import { AgentTable } from '@/components/registry/agent-table';
import { AgentDetail } from '@/components/registry/agent-detail';
import { DelegationTree } from '@/components/monitor/delegation-tree';
import { RunDetail } from '@/components/runs/run-detail';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// RunDetail's live stream: no EventSource in jsdom, and not under test here.
jest.mock('@/hooks/use-sse', () => ({
  useSse: () => ({ connected: false }),
}));

const ANON: OperatorAccess = {
  status: 'anonymous',
  canAdmin: false,
  publicMode: true,
};
const OPERATOR: OperatorAccess = {
  status: 'operator',
  canAdmin: true,
  publicMode: false,
};

const ISS = 'aid:pubkey:issuer-a';
const AID = 'aid:pubkey:agent-a';
const NOW = '2026-11-01T00:00:00Z';

const ANCHOR = {
  id: 'ta1',
  namespace: 'default',
  issuerUrl: 'https://issuer.example',
  jwksUrl: null,
  label: 'Issuer A',
  jwksCachedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};
const PINNED = {
  namespace: 'default',
  aid: AID,
  pubkey: 'pk',
  label: null,
  expiresAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};
const AGENT = {
  aid: AID,
  displayName: 'Research Bot',
  handshakeEndpoint: 'https://agents.example/handshake',
  offeredCaps: [],
  status: 'active',
  registeredAt: NOW,
  lastSeenAt: NOW,
  manifestUrl: 'https://agents.example/manifest.json',
  agentManifestHint: null,
};
const HOSTED = {
  hosted_id: 'h1',
  agent_id: 'org-a',
  ref: 'federated/org-a@1.0.0',
  port: 9101,
  aid: 'aid:pubkey:orga',
  did: 'did:web:org-a.example.com',
  origin: 'https://org-a.example.com',
  manifest_url: 'https://org-a.example.com/.well-known/aitp-manifest',
  handshake_url: 'https://org-a.example.com/handshake',
  did_document_url: 'https://org-a.example.com/.well-known/did.json',
};
const DELEGATION = {
  jti: 'jti-1',
  parentJti: null,
  delegator: 'aid:pubkey:delegator',
  delegatee: 'aid:pubkey:delegatee',
  scope: ['read'],
  issuedAt: NOW,
  expiresAt: null,
  revoked: false,
};

/** GET bodies by path; anything else (every write) answers `{}`. jsdom here
 *  has no `Response`, so this returns only the members the client reads. */
const GETS: Array<[RegExp, unknown]> = [
  [/^\/api\/cp\/trust-anchors$/, { trustAnchors: [ANCHOR] }],
  [/^\/api\/cp\/pinned-keys$/, { pinnedKeys: [PINNED] }],
  [
    /^\/api\/cp\/revocation\/issuers/,
    { issuers: [{ iss: ISS, entries: 1 }], limit: 1000, offset: 0 },
  ],
  [/^\/api\/cp\/revocations/, { iss: ISS, entries: [] }],
  [/^\/api\/cp\/delegations$/, { delegations: [DELEGATION] }],
  [/^\/api\/cp\/registry\/agents$/, { agents: [AGENT] }],
  [
    /^\/api\/cp\/registry\/agents\/[^/]+\/manifest$/,
    {
      manifest: { aid: AID },
      _verification: { checked: true, ok: true },
    },
  ],
  [/^\/api\/cp\/registry\/agents\/[^/]+$/, AGENT],
  [/^\/api\/cp\/sessions/, { sessions: [], total: 0 }],
  [/^\/api\/playground\/hosted-agents$/, { hosted: [HOSTED] }],
  [
    /^\/api\/playground\/runs\/[^/]+$/,
    {
      run_id: 'r1',
      status: 'running',
      scenario_ref: 's@1',
      outputs: {},
      events: [],
      error: null,
      created_at: null,
    },
  ],
];

function serve() {
  const spy = jest.fn(async (path: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const hit =
      method === 'GET' ? GETS.find(([re]) => re.test(path)) : undefined;
    const text = JSON.stringify(hit ? hit[1] : {});
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => text,
      json: async () => JSON.parse(text),
    };
  });
  global.fetch = spy as unknown as typeof fetch;
  return spy;
}

/** Every non-GET request the spy saw, as "METHOD path". */
function writes(spy: jest.Mock): string[] {
  return spy.mock.calls
    .map(
      ([p, i]) =>
        `${((i as RequestInit | undefined)?.method ?? 'GET').toUpperCase()} ${p}`,
    )
    .filter((c) => !c.startsWith('GET '));
}

function renderAs(access: OperatorAccess, ui: ReactElement) {
  return renderWithClient(
    <OperatorAccessProvider value={access}>{ui}</OperatorAccessProvider>,
  );
}

const realFetch = global.fetch;
const realConfirm = window.confirm;
beforeEach(() => {
  window.confirm = jest.fn(() => true);
});
afterEach(() => {
  global.fetch = realFetch;
  window.confirm = realConfirm;
});

describe('TrustAnchorsView', () => {
  it('anonymous: no add, edit or delete, and no write sent', async () => {
    const spy = serve();
    renderAs(ANON, <TrustAnchorsView />);
    await screen.findByText('issuer.example');
    expect(screen.queryByRole('button', { name: /Add anchor/ })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Edit trust anchor/ }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Delete trust anchor/ }),
    ).toBeNull();
    // Selecting rows must not surface the bulk Delete either.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Issuer A' }));
    expect(screen.queryByRole('button', { name: /^Delete$/ })).toBeNull();
    expect(writes(spy)).toEqual([]);
  });

  it('operator: add/edit shown; delete sends the DELETE', async () => {
    const spy = serve();
    renderAs(OPERATOR, <TrustAnchorsView />);
    await screen.findByText('issuer.example');
    expect(
      screen.getByRole('button', { name: /Add anchor/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit trust anchor Issuer A' }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete trust anchor Issuer A' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    await waitFor(() =>
      expect(writes(spy)).toEqual(['DELETE /api/cp/trust-anchors/ta1']),
    );
  });
});

describe('PinnedKeysView', () => {
  it('anonymous: no pin or unpin, and no write sent', async () => {
    const spy = serve();
    renderAs(ANON, <PinnedKeysView />);
    await screen.findByText(AID);
    expect(screen.queryByRole('button', { name: /Pin key/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Unpin / })).toBeNull();
    expect(writes(spy)).toEqual([]);
  });

  it('operator: pin shown; unpin sends the DELETE', async () => {
    const spy = serve();
    renderAs(OPERATOR, <PinnedKeysView />);
    await screen.findByText(AID);
    expect(screen.getByRole('button', { name: /Pin key/ })).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: `Unpin ${AID} in namespace default` }),
    );
    await waitFor(() => expect(writes(spy)).toHaveLength(1));
    expect(writes(spy)[0]).toMatch(/^DELETE \/api\/cp\/pinned-keys\?/);
  });
});

describe('RevocationView, issuer group opened', () => {
  const toggle = () =>
    screen.findByRole('button', { name: `Show entries for ${ISS}` });

  it('anonymous: the opened group shows the notice and fetches no entries', async () => {
    const spy = serve();
    renderAs(ANON, <RevocationView />);
    fireEvent.click(await toggle());
    expect(
      await screen.findByText(/Entries: operator only/),
    ).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(
      spy.mock.calls.filter(([p]) =>
        String(p).startsWith('/api/cp/revocations'),
      ),
    ).toEqual([]);
    expect(writes(spy)).toEqual([]);
  });

  it('operator: the opened group fetches its entries', async () => {
    const spy = serve();
    renderAs(OPERATOR, <RevocationView />);
    fireEvent.click(await toggle());
    await waitFor(() =>
      expect(
        spy.mock.calls.some(([p]) =>
          String(p).startsWith(
            `/api/cp/revocations?iss=${encodeURIComponent(ISS)}`,
          ),
        ),
      ).toBe(true),
    );
    expect(screen.queryByText(/Entries: operator only/)).toBeNull();
  });
});

describe('FederationView hosting', () => {
  it('anonymous: no host form, stop or handshake, and no write sent', async () => {
    const spy = serve();
    renderAs(ANON, <FederationView />);
    await screen.findByText('federated/org-a@1.0.0');
    expect(
      screen.getByText(/Hosting an agent: operator only/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Host agent/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Stop / })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Handshake & invoke/ }),
    ).toBeNull();
    expect(writes(spy)).toEqual([]);
  });

  it('operator: host form shown; stop sends the DELETE', async () => {
    const spy = serve();
    renderAs(OPERATOR, <FederationView />);
    await screen.findByText('federated/org-a@1.0.0');
    expect(screen.queryByText(/Hosting an agent: operator only/)).toBeNull();
    expect(
      screen.getByRole('button', { name: /Host agent/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Handshake & invoke/ }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Stop federated/org-a@1.0.0' }),
    );
    await waitFor(() =>
      expect(writes(spy)).toEqual(['DELETE /api/playground/hosted-agents/h1']),
    );
  });
});

describe('AgentTable enroll', () => {
  it('anonymous: no Enroll button', async () => {
    const spy = serve();
    renderAs(ANON, <AgentTable />);
    await screen.findByText('Research Bot');
    expect(screen.queryByRole('button', { name: /New enrollment/ })).toBeNull();
    expect(writes(spy)).toEqual([]);
  });

  it('operator: Enroll shown', async () => {
    serve();
    renderAs(OPERATOR, <AgentTable />);
    await screen.findByText('Research Bot');
    expect(
      screen.getByRole('button', { name: /New enrollment/ }),
    ).toBeInTheDocument();
  });
});

describe('AgentDetail deregister', () => {
  it('anonymous: no Deregister, and no write sent', async () => {
    const spy = serve();
    renderAs(ANON, <AgentDetail aid={AID} />);
    await screen.findAllByText('Research Bot');
    expect(screen.queryByRole('button', { name: /Deregister/ })).toBeNull();
    expect(writes(spy)).toEqual([]);
  });

  it('operator: Deregister sends the DELETE', async () => {
    const spy = serve();
    renderAs(OPERATOR, <AgentDetail aid={AID} />);
    fireEvent.click(await screen.findByRole('button', { name: /Deregister/ }));
    await waitFor(() =>
      expect(writes(spy)).toEqual([
        `DELETE /api/cp/registry/agents/${encodeURIComponent(AID)}`,
      ]),
    );
  });
});

describe('DelegationTree revoke', () => {
  async function selectNode() {
    fireEvent.click(await screen.findByText('jti-1'));
  }

  it('anonymous: a selected delegation offers no revoke', async () => {
    const spy = serve();
    renderAs(ANON, <DelegationTree />);
    await selectNode();
    expect(await screen.findByText('active')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Revoke this jti/ }),
    ).toBeNull();
    expect(writes(spy)).toEqual([]);
  });

  it('operator: revoke, confirmed, posts the entry', async () => {
    const spy = serve();
    renderAs(OPERATOR, <DelegationTree />);
    await selectNode();
    fireEvent.click(
      await screen.findByRole('button', { name: /Revoke this jti/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, revoke' }));
    await waitFor(() =>
      expect(writes(spy)).toEqual(['POST /api/cp/revocation/entries']),
    );
  });
});

describe('RunDetail cancel', () => {
  it('anonymous: an active run shows no Cancel', async () => {
    const spy = serve();
    renderAs(ANON, <RunDetail runId="r1" />);
    await screen.findAllByText(/running/i);
    expect(screen.queryByRole('button', { name: /^Cancel$/ })).toBeNull();
    expect(writes(spy)).toEqual([]);
  });

  it('operator: Cancel posts the cancel', async () => {
    const spy = serve();
    renderAs(OPERATOR, <RunDetail runId="r1" />);
    fireEvent.click(await screen.findByRole('button', { name: /^Cancel$/ }));
    await waitFor(() =>
      expect(writes(spy)).toEqual(['POST /api/playground/runs/r1/cancel']),
    );
  });
});
