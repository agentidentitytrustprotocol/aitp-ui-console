import { screen } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import { C } from '@/lib/colors';
import type { RevocationVerdict, VerifiedRevocationList } from '@/lib/types/cp';

const getMock = jest.fn();
const postMock = jest.fn();

jest.mock('@/lib/api/client', () => ({
  getJSON: (...args: unknown[]) => getMock(...args),
  postJSON: (...args: unknown[]) => postMock(...args),
}));

import { RevocationView } from './revocation';

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
});

function wireApi(list: VerifiedRevocationList) {
  getMock.mockImplementation(async (url: string) => {
    if (url === '/api/cp/well-known/aitp-revocation-list') return list;
    throw new Error(`unexpected GET ${url}`);
  });
}

type RevocationEntries = NonNullable<VerifiedRevocationList['revocation_list']>['entries'];

function list(verification: RevocationVerdict, entries: RevocationEntries = []): VerifiedRevocationList {
  return {
    revocation_list: { entries, version: 'aitp/0.2', issuer: 'aid:pubkey:cp', expires_at: undefined },
    signature: 'sig-bytes',
    _verification: verification,
  };
}

describe('RevocationView badge placement', () => {
  it('shows the badge above the empty-list state, not swallowed by it', async () => {
    wireApi(list({ checked: true, ok: true, tier: 'self-consistent' }, []));
    renderWithClient(<RevocationView />);

    await screen.findByText('No revocations');
    expect(
      screen.getByText('· self-consistent with CP manifest · no CP_AID pinned'),
    ).toBeInTheDocument();
  });

  it('shows the badge above the populated table', async () => {
    wireApi(
      list({ checked: true, ok: true, tier: 'pinned' }, [
        { jti: 'jti-1', reason: 'key-compromise', revoked_at: '2026-08-01T00:00:00Z' },
      ]),
    );
    renderWithClient(<RevocationView />);

    await screen.findByText('jti-1');
    expect(screen.getByText('· verified · signed by pinned CP identity')).toBeInTheDocument();
  });
});

describe('RevocationView verdict rendering', () => {
  it('renders EXPIRED in amber, never red', async () => {
    wireApi(list({ checked: true, ok: false, code: 'expired', tier: 'self-consistent' }));
    renderWithClient(<RevocationView />);

    expect(
      await screen.findByText('· EXPIRED · signature not assessed (expired)'),
    ).toHaveStyle({ color: C.amber });
  });

  it('does not overclaim for issuer_mismatch, version_unknown or malformed -- only signature_invalid says "SIGNATURE INVALID"', async () => {
    const notAssessed: Array<{ code: string; text: string }> = [
      { code: 'version_unknown', text: '· NOT VERIFIED · signature not assessed (version_unknown)' },
      { code: 'malformed', text: '· NOT VERIFIED · signature not assessed (malformed)' },
    ];
    for (const { code, text } of notAssessed) {
      wireApi(list({ checked: true, ok: false, code, tier: 'pinned' }));
      const { unmount } = renderWithClient(<RevocationView />);
      expect(await screen.findByText(text)).toHaveStyle({ color: C.amber });
      unmount();
    }

    wireApi(list({ checked: true, ok: false, code: 'issuer_mismatch', tier: 'pinned' }));
    const { unmount } = renderWithClient(<RevocationView />);
    expect(await screen.findByText('· ISSUER MISMATCH (issuer_mismatch)')).toHaveStyle({
      color: C.red,
    });
    unmount();

    wireApi(list({ checked: true, ok: false, code: 'signature_invalid', tier: 'pinned' }));
    renderWithClient(<RevocationView />);
    expect(await screen.findByText('· SIGNATURE INVALID (signature_invalid)')).toHaveStyle({
      color: C.red,
    });
  });

  it('entries still render, visibly marked untrusted, on a signature failure', async () => {
    wireApi(
      list({ checked: true, ok: false, code: 'signature_invalid', tier: 'pinned' }, [
        { jti: 'jti-tampered', revoked_at: '2026-08-01T00:00:00Z' },
      ]),
    );
    renderWithClient(<RevocationView />);

    await screen.findByText('jti-tampered');
    expect(screen.getByText('· SIGNATURE INVALID (signature_invalid)')).toBeInTheDocument();
  });

  it('never contains the word "verified" for a self-consistent (unpinned) ok verdict', async () => {
    wireApi(list({ checked: true, ok: true, tier: 'self-consistent' }));
    renderWithClient(<RevocationView />);

    await screen.findByText('· self-consistent with CP manifest · no CP_AID pinned');
    expect(screen.queryByText(/verified/)).not.toBeInTheDocument();
  });

  it('names the upstream cause when the manifest could not be verified', async () => {
    wireApi(list({ checked: false, reason: 'no_trusted_issuer', manifestCode: 'expired' }));
    renderWithClient(<RevocationView />);

    expect(
      await screen.findByText(
        "· signature not checked · the CP's manifest has expired, so no trusted issuer is available (aitp-control-plane defect)",
      ),
    ).toBeInTheDocument();
  });

  it('renders a generic unchecked reason without a manifestCode', async () => {
    wireApi(list({ checked: false, reason: 'manifest_unreachable' }));
    renderWithClient(<RevocationView />);

    expect(
      await screen.findByText('· signature not checked (manifest_unreachable)'),
    ).toBeInTheDocument();
  });
});
