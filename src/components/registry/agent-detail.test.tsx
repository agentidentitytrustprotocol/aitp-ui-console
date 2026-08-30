import { screen } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { renderWithClient } from '@/test/test-utils';
import { C } from '@/lib/colors';
import type { Agent, Verdict, VerifiedManifestEnvelope } from '@/lib/types/cp';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const useAgentMock = jest.fn();
const useAgentManifestMock = jest.fn();
jest.mock('@/hooks/use-registry', () => ({
  useAgent: (aid: string | null) => useAgentMock(aid),
  useAgentManifest: (aid: string | null) => useAgentManifestMock(aid),
}));

const useSessionsMock = jest.fn();
jest.mock('@/hooks/use-sessions', () => ({
  useSessions: (...args: unknown[]) => useSessionsMock(...args),
}));

const deregisterMutate = jest.fn();
jest.mock('@/hooks/use-enrollment', () => ({
  useDeregisterAgent: () => ({ mutate: deregisterMutate, isPending: false }),
}));

import { AgentDetail } from './agent-detail';

const AID = 'aid:pubkey:agent-under-test';

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    aid: AID,
    displayName: 'Research Bot',
    handshakeEndpoint: 'https://agents.example/handshake',
    offeredCaps: [],
    status: 'active',
    registeredAt: '2026-07-01T00:00:00Z',
    lastSeenAt: '2026-07-07T00:00:00Z',
    manifestUrl: 'https://agents.example/manifest.json',
    agentManifestHint: null,
    ...overrides,
  };
}

function envelope(verification: Verdict): VerifiedManifestEnvelope {
  return {
    manifest: { aid: AID },
    _verification: verification,
  };
}

function setAgent(overrides: Partial<Agent> = {}) {
  useAgentMock.mockReturnValue({ data: agent(overrides), isLoading: false, error: null });
}

function setManifest(state: { data?: VerifiedManifestEnvelope; isLoading?: boolean; error?: unknown }) {
  useAgentManifestMock.mockReturnValue({
    data: state.data,
    isLoading: state.isLoading ?? false,
    error: state.error ?? null,
  });
}

beforeEach(() => {
  useAgentMock.mockReset();
  useAgentManifestMock.mockReset();
  useSessionsMock.mockReset();
  deregisterMutate.mockClear();
  push.mockClear();
  useSessionsMock.mockReturnValue({ data: { sessions: [] }, isLoading: false, error: null });
});

function aidNode() {
  // The AID text is duplicated by ManifestViewer's own JSON tree rendering,
  // so scope to the AgentDetail's own AID line via getAllByText and take
  // the first (card) occurrence.
  return screen.getAllByText(AID)[0];
}

// ManifestViewer, rendered as a sibling below AgentDetail's own card, computes
// its own badge from the same manifest verdict and can render identical text
// for the ok:true/ok:false cases -- scope to AgentDetail's own (first-rendered)
// occurrence the same way aidNode() does. The loading/error/no-data fallback
// strings are component-local to AgentDetail and never duplicated.
function provenanceNode(text: string) {
  return screen.getAllByText(text)[0];
}

describe('AgentDetail AID provenance', () => {
  it('renders the AID in the verified teal only when the manifest verdict is ok:true', () => {
    setAgent();
    setManifest({ data: envelope({ checked: true, ok: true }) });
    renderWithClient(<AgentDetail aid={AID} />);

    expect(aidNode()).toHaveStyle({ color: C.tealBright });
    expect(provenanceNode('· verified · signed by the key bound to this AID')).toBeInTheDocument();
  });

  it('renders the AID muted when the manifest verdict is ok:false (any failure code)', () => {
    setAgent();
    setManifest({ data: envelope({ checked: true, ok: false, code: 'signature_invalid' }) });
    renderWithClient(<AgentDetail aid={AID} />);

    expect(aidNode()).toHaveStyle({ color: C.textMuted });
    expect(aidNode()).not.toHaveStyle({ color: C.tealBright });
    expect(provenanceNode('· VERIFICATION FAILED (signature_invalid)')).toBeInTheDocument();
  });

  it('renders the AID muted while the manifest query is loading', () => {
    setAgent();
    setManifest({ isLoading: true });
    renderWithClient(<AgentDetail aid={AID} />);

    expect(aidNode()).toHaveStyle({ color: C.textMuted });
    expect(screen.getByText('· checking manifest…')).toBeInTheDocument();
  });

  it('renders the AID muted when the manifest query errors', () => {
    setAgent();
    setManifest({ error: new Error('manifest fetch failed') });
    renderWithClient(<AgentDetail aid={AID} />);

    expect(aidNode()).toHaveStyle({ color: C.textMuted });
    expect(screen.getByText('· manifest unavailable')).toBeInTheDocument();
  });

  it('renders the AID muted when the manifest query has no data', () => {
    setAgent();
    setManifest({ data: undefined });
    renderWithClient(<AgentDetail aid={AID} />);

    expect(aidNode()).toHaveStyle({ color: C.textMuted });
    expect(screen.getByText('· manifest unavailable')).toBeInTheDocument();
  });
});

describe('AgentDetail existing fields', () => {
  beforeEach(() => {
    setManifest({ data: envelope({ checked: true, ok: true }) });
  });

  it('shows a loading skeleton while the agent query is loading', () => {
    useAgentMock.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderWithClient(<AgentDetail aid={AID} />);

    expect(screen.queryByText('Research Bot')).not.toBeInTheDocument();
  });

  it('shows an empty state when the agent is not found', () => {
    useAgentMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error('404') });
    renderWithClient(<AgentDetail aid={AID} />);

    expect(screen.getByText('Agent not found')).toBeInTheDocument();
    expect(screen.getByText(AID)).toBeInTheDocument();
  });

  it('renders the display name, status, registered/last-seen time, and endpoint', () => {
    setAgent();
    renderWithClient(<AgentDetail aid={AID} />);

    expect(screen.getByText('Research Bot')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'status: active' })).toBeInTheDocument();
    expect(screen.getByText('agents.example/handshake')).toBeInTheDocument();
    const endpointLink = screen.getByRole('link', { name: 'agents.example/handshake' });
    expect(endpointLink).toHaveAttribute('href', 'https://agents.example/handshake');
  });

  it('shows the deregister button for a non-deregistered agent', () => {
    setAgent({ status: 'active' });
    renderWithClient(<AgentDetail aid={AID} />);

    expect(screen.getByRole('button', { name: /Deregister/i })).toBeInTheDocument();
  });

  it('hides the deregister button for an already-deregistered agent', () => {
    setAgent({ status: 'deregistered' });
    renderWithClient(<AgentDetail aid={AID} />);

    expect(screen.queryByRole('button', { name: /Deregister/i })).not.toBeInTheDocument();
  });

  it('shows an empty state for no recent sessions', () => {
    setAgent();
    useSessionsMock.mockReturnValue({ data: { sessions: [] }, isLoading: false, error: null });
    renderWithClient(<AgentDetail aid={AID} />);

    expect(screen.getByText('No sessions yet')).toBeInTheDocument();
  });
});
