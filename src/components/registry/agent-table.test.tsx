import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import type { Agent } from '@/lib/types/cp';

// Search / status filters live in the URL; drive them via the mocked params.
let currentParams = new URLSearchParams();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/registry',
  useRouter: () => ({ replace }),
  useSearchParams: () => currentParams,
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

const useRegistryMock = jest.fn();
jest.mock('@/hooks/use-registry', () => ({
  useRegistry: () => useRegistryMock(),
}));

import { AgentTable } from './agent-table';

function agent(overrides: Partial<Agent>): Agent {
  return {
    aid: 'aid:pubkey:DefaultKey000000000000000000',
    displayName: 'Agent',
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

const AGENTS: Agent[] = [
  agent({
    aid: 'aid:pubkey:AlphaKey1111111111111111111',
    displayName: 'Research Bot',
    offeredCaps: ['summarize.text'],
    status: 'active',
  }),
  agent({
    aid: 'aid:pubkey:BravoKey2222222222222222222',
    displayName: 'Writer',
    offeredCaps: ['write.doc', 'edit.doc'],
    status: 'active',
  }),
  agent({
    aid: 'aid:pubkey:CharlieKey333333333333333333',
    displayName: 'Legacy Agent',
    offeredCaps: ['legacy.op'],
    status: 'expired',
  }),
  agent({
    aid: 'aid:pubkey:DeltaKey44444444444444444444',
    displayName: 'Retired Agent',
    offeredCaps: ['old.cap'],
    status: 'deregistered',
  }),
];

function setRegistry(agents: Agent[]) {
  useRegistryMock.mockReturnValue({ data: { agents }, isLoading: false, error: null });
}

beforeEach(() => {
  currentParams = new URLSearchParams();
  replace.mockClear();
  useRegistryMock.mockReset();
  setRegistry(AGENTS);
});

function rowNames() {
  return {
    research: screen.queryByText('Research Bot'),
    writer: screen.queryByText('Writer'),
    legacy: screen.queryByText('Legacy Agent'),
    retired: screen.queryByText('Retired Agent'),
  };
}

describe('AgentTable status filter', () => {
  it('shows every agent for the default "all" filter', () => {
    render(<AgentTable />);
    const rows = rowNames();
    expect(rows.research).toBeInTheDocument();
    expect(rows.writer).toBeInTheDocument();
    expect(rows.legacy).toBeInTheDocument();
    expect(rows.retired).toBeInTheDocument();
  });

  it.each([
    ['active', ['Research Bot', 'Writer'], ['Legacy Agent', 'Retired Agent']],
    ['expired', ['Legacy Agent'], ['Research Bot', 'Writer', 'Retired Agent']],
    ['deregistered', ['Retired Agent'], ['Research Bot', 'Writer', 'Legacy Agent']],
  ])('status=%s keeps only matching agents', (status, shown, hidden) => {
    currentParams = new URLSearchParams(`status=${status}`);
    render(<AgentTable />);
    for (const name of shown) expect(screen.getByText(name)).toBeInTheDocument();
    for (const name of hidden) expect(screen.queryByText(name)).not.toBeInTheDocument();
  });

  it('falls back to "all" for a status outside the union', () => {
    currentParams = new URLSearchParams('status=garbage');
    render(<AgentTable />);
    expect(screen.getByText('Retired Agent')).toBeInTheDocument();
  });
});

describe('AgentTable search', () => {
  it('matches displayName case-insensitively', () => {
    currentParams = new URLSearchParams('q=RESEARCH');
    render(<AgentTable />);
    const rows = rowNames();
    expect(rows.research).toBeInTheDocument();
    expect(rows.writer).not.toBeInTheDocument();
    expect(rows.legacy).not.toBeInTheDocument();
  });

  it('matches the aid case-insensitively', () => {
    currentParams = new URLSearchParams('q=bravokey');
    render(<AgentTable />);
    const rows = rowNames();
    expect(rows.writer).toBeInTheDocument();
    expect(rows.research).not.toBeInTheDocument();
  });

  it('matches offered capabilities case-insensitively', () => {
    currentParams = new URLSearchParams('q=WRITE.DOC');
    render(<AgentTable />);
    const rows = rowNames();
    expect(rows.writer).toBeInTheDocument();
    expect(rows.research).not.toBeInTheDocument();
    expect(rows.legacy).not.toBeInTheDocument();
  });

  it('combines with the status filter (search hit outside the status is hidden)', () => {
    currentParams = new URLSearchParams('status=active&q=legacy');
    render(<AgentTable />);
    expect(screen.queryByText('Legacy Agent')).not.toBeInTheDocument();
    expect(screen.getByText('No agents match')).toBeInTheDocument();
  });
});

describe('AgentTable active count', () => {
  it('counts active agents regardless of the current filter', () => {
    currentParams = new URLSearchParams('status=expired');
    render(<AgentTable />);
    expect(screen.getByText('2 active agents')).toBeInTheDocument();
  });

  it('uses the singular form for exactly one active agent', () => {
    setRegistry([AGENTS[0], AGENTS[2]]);
    render(<AgentTable />);
    expect(screen.getByText('1 active agent')).toBeInTheDocument();
  });

  it('uses the plural form for zero active agents', () => {
    setRegistry([AGENTS[2]]);
    render(<AgentTable />);
    expect(screen.getByText('0 active agents')).toBeInTheDocument();
  });
});

describe('AgentTable empty state', () => {
  it('suggests changing the search when a search is active', () => {
    currentParams = new URLSearchParams('q=zzz-no-such-agent');
    render(<AgentTable />);
    expect(screen.getByText('No agents match')).toBeInTheDocument();
    expect(
      screen.getByText('Try a different search term or status filter.'),
    ).toBeInTheDocument();
  });

  it('says no agents are registered when there is no search', () => {
    setRegistry([]);
    render(<AgentTable />);
    expect(screen.getByText('No agents match')).toBeInTheDocument();
    expect(screen.getByText('No agents are registered yet.')).toBeInTheDocument();
  });

  it('shows the registry error state when the query fails', () => {
    useRegistryMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error('down') });
    render(<AgentTable />);
    expect(screen.getByText("Couldn't reach the registry")).toBeInTheDocument();
  });
});
