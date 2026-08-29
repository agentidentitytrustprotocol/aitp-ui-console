import { screen } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import type { ManifestEnvelope, RevocationList } from '@/lib/types/cp';

const getMock = jest.fn();

jest.mock('@/lib/api/client', () => ({
  getJSON: (...args: unknown[]) => getMock(...args),
}));

import { CpIdentityCard } from './cp-identity';

function manifest(overrides: Partial<ManifestEnvelope['manifest']> = {}): ManifestEnvelope {
  return {
    manifest: {
      aid: 'aid:pubkey:test',
      display_name: 'Test CP',
      handshake_endpoint: 'https://cp.example/handshake',
      offered_capabilities: [],
      ...overrides,
    },
  };
}

function revocationList(overrides: Partial<RevocationList> = {}): RevocationList {
  return {
    revocation_list: { entries: [], version: '1', expires_at: undefined },
    signature: 'sig-bytes',
    ...overrides,
  };
}

beforeEach(() => {
  getMock.mockReset();
});

function wireApi(m: ManifestEnvelope | null, r: RevocationList | null) {
  getMock.mockImplementation(async (url: string) => {
    if (url === '/api/cp/well-known/aitp-manifest') {
      if (!m) throw new Error('manifest unavailable');
      return m;
    }
    if (url === '/api/cp/well-known/aitp-revocation-list') {
      if (!r) throw new Error('revocation list unavailable');
      return r;
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

describe('CpIdentityCard provenance', () => {
  it('never renders the false "signed by CP" claim, with or without a signature field', async () => {
    wireApi(manifest(), revocationList({ signature: 'sig-bytes' }));
    renderWithClient(<CpIdentityCard />);
    await screen.findByText('aid:pubkey:test');

    expect(screen.queryByText(/signed by CP/)).not.toBeInTheDocument();
  });

  it('labels the AID block as unverified, sourced from CP_URL', async () => {
    wireApi(manifest(), revocationList());
    renderWithClient(<CpIdentityCard />);

    expect(await screen.findByText('AID (as reported by CP_URL — unverified)')).toBeInTheDocument();
  });

  it('states the revocation snapshot is unchecked, unconditionally', async () => {
    wireApi(manifest(), revocationList({ signature: undefined }));
    renderWithClient(<CpIdentityCard />);
    await screen.findByText('aid:pubkey:test');

    expect(
      screen.getByText((_, node) =>
        node?.textContent === '0 entries · expires — · as served by CP_URL · signature not checked',
      ),
    ).toBeInTheDocument();
  });
});
