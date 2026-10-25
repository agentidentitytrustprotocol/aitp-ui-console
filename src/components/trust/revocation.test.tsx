import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import type { IssuerRevocations, Tct } from '@/lib/types/cp';

const getMock = jest.fn();
const postMock = jest.fn();

jest.mock('@/lib/api/client', () => ({
  getJSON: (...args: unknown[]) => getMock(...args),
  postJSON: (...args: unknown[]) => postMock(...args),
}));

import { RevocationView } from './revocation';

const ISS_A = 'aid:pubkey:issuer-a';
const ISS_B = 'aid:pubkey:issuer-b';
const JTI_A = '11111111-1111-4111-8111-111111111111';
const JTI_B = '22222222-2222-4222-8222-222222222222';
const NOW_S = Math.floor(Date.now() / 1000);

function tct(jti: string, issuer: string): Tct {
  return {
    jti,
    issuer,
    subject: 'aid:pubkey:sub',
    audience: 'aud',
    issuedAt: '2026-10-24T00:00:00Z',
    expiresAt: '2026-10-26T00:00:00Z',
    revoked: false,
  };
}

let metricsText = '';

function wireApi(tcts: Tct[], byIssuer: Record<string, IssuerRevocations['entries']>) {
  getMock.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/cp/tcts')) return { tcts };
    const m = url.match(/^\/api\/cp\/revocations\?iss=(.+)$/);
    if (m) {
      const iss = decodeURIComponent(m[1]);
      return { iss, entries: byIssuer[iss] ?? [] };
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  metricsText = '';
  global.fetch = jest.fn(async () => ({ text: async () => metricsText })) as unknown as typeof fetch;
});

describe('RevocationView, per-issuer model', () => {
  it('lists every issuer but fetches none until its group is opened', async () => {
    wireApi([tct(JTI_A, ISS_A), tct(JTI_B, ISS_B)], {});
    renderWithClient(<RevocationView />);

    await screen.findByRole('region', { name: `Issuer ${ISS_A}` });
    expect(screen.getByRole('region', { name: `Issuer ${ISS_B}` })).toBeInTheDocument();
    expect(screen.getByText('2 issuers')).toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/cp/revocations'));
  });

  it('groups entries by issuer AID, one CP query per opened issuer', async () => {
    wireApi([tct(JTI_A, ISS_A), tct(JTI_B, ISS_B)], {
      [ISS_A]: [{ jti: JTI_A, revoked_at: NOW_S - 60, reason: 'key-compromise' }],
    });
    renderWithClient(<RevocationView />);

    fireEvent.click(await screen.findByRole('button', { name: `Show entries for ${ISS_A}` }));
    fireEvent.click(screen.getByRole('button', { name: `Show entries for ${ISS_B}` }));

    const a = screen.getByRole('region', { name: `Issuer ${ISS_A}` });
    expect(await within(a).findByText(JTI_A)).toBeInTheDocument();
    expect(within(a).getByText('key-compromise')).toBeInTheDocument();
    const b = screen.getByRole('region', { name: `Issuer ${ISS_B}` });
    expect(await within(b).findByText('No revocations.')).toBeInTheDocument();

    expect(getMock).toHaveBeenCalledWith(`/api/cp/revocations?iss=${encodeURIComponent(ISS_A)}`);
    expect(getMock).toHaveBeenCalledWith(`/api/cp/revocations?iss=${encodeURIComponent(ISS_B)}`);
    expect(getMock).not.toHaveBeenCalledWith(expect.stringContaining('well-known'));
  });

  it('opens issuers that pull from the relay by default', async () => {
    metricsText = `aitp_control_plane_revocation_last_pull_timestamp_seconds{issuer="b",aid="${ISS_B}"} ${NOW_S}`;
    wireApi([tct(JTI_A, ISS_A), tct(JTI_B, ISS_B)], { [ISS_B]: [{ jti: JTI_B, revoked_at: NOW_S }] });
    renderWithClient(<RevocationView />);

    const b = await screen.findByRole('region', { name: `Issuer ${ISS_B}` });
    expect(await within(b).findByText(JTI_B)).toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalledWith(`/api/cp/revocations?iss=${encodeURIComponent(ISS_A)}`);
  });

  it('shows the last pull per issuer from the aid-labelled gauge, and "no pull recorded" otherwise', async () => {
    metricsText = [
      '# TYPE aitp_control_plane_revocation_last_pull_timestamp_seconds gauge',
      `aitp_control_plane_revocation_last_pull_timestamp_seconds{issuer="a",aid="${ISS_A}"} ${NOW_S - 120}`,
    ].join('\n');
    wireApi([tct(JTI_A, ISS_A), tct(JTI_B, ISS_B)], {});
    renderWithClient(<RevocationView />);

    const a = await screen.findByRole('region', { name: `Issuer ${ISS_A}` });
    expect(await within(a).findByText(/last pull 2m ago/)).toBeInTheDocument();
    const b = screen.getByRole('region', { name: `Issuer ${ISS_B}` });
    expect(within(b).getByText('no pull recorded')).toBeInTheDocument();
  });

  it('prefills the issuer from the TCT and sends iss with the revocation', async () => {
    wireApi([tct(JTI_A, ISS_A)], {});
    postMock.mockResolvedValue({ jti: JTI_A, revokedAt: '2026-10-25T00:00:00Z', reason: null });
    renderWithClient(<RevocationView />);
    await screen.findByRole('region', { name: `Issuer ${ISS_A}` });

    fireEvent.change(screen.getByPlaceholderText('UUID of a TCT or delegation'), {
      target: { value: JTI_A },
    });
    expect(screen.getByPlaceholderText(/aid:… \(prefilled/)).toHaveValue(ISS_A);

    fireEvent.click(screen.getByRole('button', { name: /Revoke/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Yes, revoke/ }));

    await screen.findByText('Revocation recorded');
    expect(postMock).toHaveBeenCalledWith('/api/cp/revocation/entries', {
      jti: JTI_A,
      iss: ISS_A,
      reason: undefined,
    });
  });

  it('cannot revoke without an issuer', async () => {
    wireApi([], {});
    renderWithClient(<RevocationView />);
    await screen.findByText('No issuers yet');

    fireEvent.change(screen.getByPlaceholderText('UUID of a TCT or delegation'), {
      target: { value: JTI_B },
    });
    expect(screen.getByRole('button', { name: /Revoke/ })).toBeDisabled();
  });

  it('lists an operator-named issuer after revoking against it', async () => {
    wireApi([], { [ISS_B]: [{ jti: JTI_B, revoked_at: NOW_S }] });
    postMock.mockResolvedValue({ jti: JTI_B, revokedAt: '2026-10-25T00:00:00Z', reason: null });
    renderWithClient(<RevocationView />);
    await screen.findByText('No issuers yet');

    fireEvent.change(screen.getByPlaceholderText('UUID of a TCT or delegation'), {
      target: { value: JTI_B },
    });
    fireEvent.change(screen.getByPlaceholderText(/aid:… \(prefilled/), { target: { value: ISS_B } });
    fireEvent.click(screen.getByRole('button', { name: /Revoke/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Yes, revoke/ }));

    const b = await screen.findByRole('region', { name: `Issuer ${ISS_B}` });
    expect(await within(b).findByText(JTI_B)).toBeInTheDocument();
  });
});
