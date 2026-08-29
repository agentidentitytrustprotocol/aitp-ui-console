import { screen } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import { C } from '@/lib/colors';
import type {
  RevocationVerdict,
  Verdict,
  VerifiedManifestEnvelope,
  VerifiedRevocationList,
} from '@/lib/types/cp';

const getMock = jest.fn();

jest.mock('@/lib/api/client', () => ({
  getJSON: (...args: unknown[]) => getMock(...args),
}));

import { CpIdentityCard } from './cp-identity';

function manifest(
  verification: Verdict,
  overrides: Partial<VerifiedManifestEnvelope['manifest']> = {},
): VerifiedManifestEnvelope {
  return {
    manifest: {
      aid: 'aid:pubkey:test',
      display_name: 'Test CP',
      handshake_endpoint: 'https://cp.example/handshake',
      offered_capabilities: [],
      ...overrides,
    },
    _verification: verification,
  };
}

function revocationList(
  verification: RevocationVerdict = { checked: true, ok: true, tier: 'self-consistent' },
  overrides: Partial<VerifiedRevocationList> = {},
): VerifiedRevocationList {
  return {
    revocation_list: { entries: [], version: '1', expires_at: undefined },
    signature: 'sig-bytes',
    _verification: verification,
    ...overrides,
  };
}

beforeEach(() => {
  getMock.mockReset();
});

function wireApi(m: VerifiedManifestEnvelope | null, r: VerifiedRevocationList | null) {
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
    wireApi(manifest({ checked: true, ok: true }), revocationList());
    renderWithClient(<CpIdentityCard />);
    await screen.findByText('aid:pubkey:test');

    expect(screen.queryByText(/signed by CP/)).not.toBeInTheDocument();
  });
});

describe('CpIdentityCard manifest verdict', () => {
  it('colours the AID teal and shows "verified" only on ok:true', async () => {
    wireApi(manifest({ checked: true, ok: true }), revocationList());
    renderWithClient(<CpIdentityCard />);

    const aid = await screen.findByText('aid:pubkey:test');
    expect(aid).toHaveStyle({ color: C.tealBright });
    expect(
      screen.getByText('· verified · signed by the key bound to this AID'),
    ).toHaveStyle({ color: C.green });
  });

  it('renders EXPIRED distinctly from a verification failure, with the AID muted (not red)', async () => {
    wireApi(manifest({ checked: true, ok: false, code: 'expired' }), revocationList());
    renderWithClient(<CpIdentityCard />);

    const aid = await screen.findByText('aid:pubkey:test');
    expect(aid).toHaveStyle({ color: C.textMuted });
    const badge = screen.getByText(
      "· EXPIRED · signature not assessed — the CP's manifest lapsed before it could be checked",
    );
    expect(badge).toHaveStyle({ color: C.amber });
  });

  it('renders a signature failure in red, AID muted', async () => {
    wireApi(manifest({ checked: true, ok: false, code: 'signature_invalid' }), revocationList());
    renderWithClient(<CpIdentityCard />);

    const aid = await screen.findByText('aid:pubkey:test');
    expect(aid).toHaveStyle({ color: C.textMuted });
    expect(screen.getByText('· VERIFICATION FAILED (signature_invalid)')).toHaveStyle({
      color: C.red,
    });
  });

  it('does not overclaim for a pre-signature code: version_unknown and malformed render as not-verified, not a failure', async () => {
    for (const code of ['version_unknown', 'malformed']) {
      wireApi(manifest({ checked: true, ok: false, code }), revocationList());
      const { unmount } = renderWithClient(<CpIdentityCard />);
      expect(await screen.findByText(`· NOT VERIFIED · signature not assessed (${code})`)).toHaveStyle({
        color: C.amber,
      });
      unmount();
    }
  });

  it('renders checked:false as unchecked, not as a failure', async () => {
    wireApi(manifest({ checked: false, reason: 'sdk_unavailable' }), revocationList());
    renderWithClient(<CpIdentityCard />);

    const aid = await screen.findByText('aid:pubkey:test');
    expect(aid).toHaveStyle({ color: C.textMuted });
    expect(screen.getByText('· signature not checked (sdk_unavailable)')).toHaveStyle({
      color: C.amber,
    });
  });

  it('never colours the AID teal except on ok:true', async () => {
    const nonOkVerdicts: Verdict[] = [
      { checked: true, ok: false, code: 'expired' },
      { checked: true, ok: false, code: 'signature_invalid' },
      { checked: true, ok: false, code: 'version_unknown' },
      { checked: true, ok: false, code: 'malformed' },
      { checked: false, reason: 'sdk_unavailable' },
    ];
    for (const verification of nonOkVerdicts) {
      wireApi(manifest(verification), revocationList());
      const { unmount } = renderWithClient(<CpIdentityCard />);
      const aid = await screen.findByText('aid:pubkey:test');
      expect(aid).not.toHaveStyle({ color: C.tealBright });
      unmount();
    }
  });
});

describe('CpIdentityCard revocation verdict', () => {
  it('shows the pinned badge in green', async () => {
    wireApi(
      manifest({ checked: true, ok: true }),
      revocationList({ checked: true, ok: true, tier: 'pinned' }),
    );
    renderWithClient(<CpIdentityCard />);

    expect(
      await screen.findByText('· verified · signed by pinned CP identity'),
    ).toHaveStyle({ color: C.green });
  });

  it('never contains the word "verified" for a self-consistent (unpinned) verdict', async () => {
    // Manifest verdict deliberately ok:false here so its badge -- which
    // legitimately says "verified" -- can't produce a false pass on the
    // revocation badge's text.
    wireApi(
      manifest({ checked: true, ok: false, code: 'expired' }),
      revocationList({ checked: true, ok: true, tier: 'self-consistent' }),
    );
    renderWithClient(<CpIdentityCard />);

    const badge = await screen.findByText('· self-consistent with CP manifest · no CP_AID pinned');
    expect(badge.textContent).not.toMatch(/verified/);
  });

  it('renders issuer_mismatch as its own red state, not "SIGNATURE INVALID"', async () => {
    wireApi(
      manifest({ checked: true, ok: true }),
      revocationList({ checked: true, ok: false, code: 'issuer_mismatch', tier: 'pinned' }),
    );
    renderWithClient(<CpIdentityCard />);

    expect(await screen.findByText('· ISSUER MISMATCH (issuer_mismatch)')).toHaveStyle({
      color: C.red,
    });
    expect(screen.queryByText(/SIGNATURE INVALID/)).not.toBeInTheDocument();
  });

  it('names the upstream cause when the manifest is unverifiable', async () => {
    wireApi(
      manifest({ checked: true, ok: true }),
      revocationList({
        checked: false,
        reason: 'no_trusted_issuer',
        manifestCode: 'expired',
      }),
    );
    renderWithClient(<CpIdentityCard />);

    expect(
      await screen.findByText(
        "· signature not checked · the CP's manifest has expired, so no trusted issuer is available (aitp-control-plane defect)",
      ),
    ).toBeInTheDocument();
  });
});
