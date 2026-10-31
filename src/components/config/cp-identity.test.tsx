import { screen } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import { C } from '@/lib/colors';
import type { Verdict, VerifiedManifestEnvelope } from '@/lib/types/cp';

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

beforeEach(() => {
  getMock.mockReset();
});

function wireApi(m: VerifiedManifestEnvelope | null) {
  getMock.mockImplementation(async (url: string) => {
    if (url === '/api/cp/well-known/aitp-manifest') {
      if (!m) throw new Error('manifest unavailable');
      return m;
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

describe('CpIdentityCard provenance', () => {
  it('never renders the false "signed by CP" claim, with or without a signature field', async () => {
    wireApi(manifest({ checked: true, ok: true }));
    renderWithClient(<CpIdentityCard />);
    await screen.findByText('aid:pubkey:test');

    expect(screen.queryByText(/signed by CP/)).not.toBeInTheDocument();
  });
});

describe('CpIdentityCard manifest verdict', () => {
  it('colours the AID teal and shows "verified" only on ok:true', async () => {
    wireApi(manifest({ checked: true, ok: true }));
    renderWithClient(<CpIdentityCard />);

    const aid = await screen.findByText('aid:pubkey:test');
    expect(aid).toHaveStyle({ color: C.tealBright });
    expect(
      screen.getByText('· verified · signed by the key bound to this AID'),
    ).toHaveStyle({ color: C.green });
  });

  it('renders EXPIRED distinctly from a verification failure, with the AID muted (not red)', async () => {
    wireApi(manifest({ checked: true, ok: false, code: 'expired' }));
    renderWithClient(<CpIdentityCard />);

    const aid = await screen.findByText('aid:pubkey:test');
    expect(aid).toHaveStyle({ color: C.textMuted });
    const badge = screen.getByText(
      "· EXPIRED · signature not assessed — the CP's manifest lapsed before it could be checked",
    );
    expect(badge).toHaveStyle({ color: C.amber });
  });

  it('renders a signature failure in red, AID muted', async () => {
    wireApi(manifest({ checked: true, ok: false, code: 'signature_invalid' }));
    renderWithClient(<CpIdentityCard />);

    const aid = await screen.findByText('aid:pubkey:test');
    expect(aid).toHaveStyle({ color: C.textMuted });
    expect(screen.getByText('· SIGNATURE INVALID (signature_invalid)')).toHaveStyle({
      color: C.red,
    });
  });

  it('renders a post-signature rejection in red with the AID still muted, naming the signature as verified', async () => {
    // `verify_manifest` reaches the identity-hint check only after the outer
    // signature has already verified, so this badge must not read as a
    // signature failure -- and the AID must stay muted anyway, because
    // RFC-AITP-0003 §5 requires discarding a manifest that fails any step.
    wireApi(manifest({ checked: true, ok: false, code: 'identity_hint_malformed' }));
    renderWithClient(<CpIdentityCard />);

    const aid = await screen.findByText('aid:pubkey:test');
    expect(aid).toHaveStyle({ color: C.textMuted });
    expect(
      screen.getByText(
        '· REJECTED · signature verified · identity hint is malformed (identity_hint_malformed)',
      ),
    ).toHaveStyle({ color: C.red });
  });

  it('renders pop_failed in red with the AID muted, without claiming the signature verified', async () => {
    // Since aitp 0.24.0 PoP is checked before the outer signature, so a
    // manifest failing both is `pop_failed` and its signature was never assessed.
    wireApi(manifest({ checked: true, ok: false, code: 'pop_failed' }));
    renderWithClient(<CpIdentityCard />);

    const aid = await screen.findByText('aid:pubkey:test');
    expect(aid).toHaveStyle({ color: C.textMuted });
    expect(
      screen.getByText('· REJECTED · proof-of-possession failed · signature not assessed (pop_failed)'),
    ).toHaveStyle({ color: C.red });
    expect(screen.queryByText(/signature verified/)).toBeNull();
  });

  it('does not overclaim for a pre-signature code: version_unknown, malformed and unknown_field render as not-verified, not a failure', async () => {
    for (const code of ['version_unknown', 'malformed', 'unknown_field']) {
      wireApi(manifest({ checked: true, ok: false, code }));
      const { unmount } = renderWithClient(<CpIdentityCard />);
      expect(await screen.findByText(`· NOT VERIFIED · signature not assessed (${code})`)).toHaveStyle({
        color: C.amber,
      });
      unmount();
    }
  });

  it('renders checked:false as unchecked, not as a failure', async () => {
    wireApi(manifest({ checked: false, reason: 'sdk_unavailable' }));
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
      // Rejections after a valid check (PoP, or the identity hint after the
      // signature verified) are still not a licence to colour the AID.
      { checked: true, ok: false, code: 'pop_failed' },
      { checked: true, ok: false, code: 'identity_hint_malformed' },
      { checked: false, reason: 'sdk_unavailable' },
    ];
    for (const verification of nonOkVerdicts) {
      wireApi(manifest(verification));
      const { unmount } = renderWithClient(<CpIdentityCard />);
      const aid = await screen.findByText('aid:pubkey:test');
      expect(aid).not.toHaveStyle({ color: C.tealBright });
      unmount();
    }
  });
});

describe('CpIdentityCard revocation', () => {
  it('fetches no CP-signed revocation list and points at the per-issuer view', async () => {
    wireApi(manifest({ checked: true, ok: true }));
    renderWithClient(<CpIdentityCard />);
    await screen.findByText('aid:pubkey:test');

    expect(getMock).not.toHaveBeenCalledWith(expect.stringContaining('revocation'));
    expect(screen.getByText(/signs no revocation list/)).toBeInTheDocument();
  });
});
