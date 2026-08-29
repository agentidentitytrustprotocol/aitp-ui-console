import { screen } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import type { RevocationList } from '@/lib/types/cp';

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

function wireApi(list: RevocationList) {
  getMock.mockImplementation(async (url: string) => {
    if (url === '/api/cp/well-known/aitp-revocation-list') return list;
    throw new Error(`unexpected GET ${url}`);
  });
}

const PROVENANCE = 'Entries shown as served by the CP · signature not checked by this console.';

describe('RevocationView provenance', () => {
  it('shows the provenance line when the list is empty', async () => {
    wireApi({ revocation_list: { entries: [] } });
    renderWithClient(<RevocationView />);

    await screen.findByText('No revocations');
    expect(screen.getByText(PROVENANCE)).toBeInTheDocument();
  });

  it('shows the provenance line when entries are present', async () => {
    wireApi({
      revocation_list: {
        entries: [{ jti: 'jti-1', reason: 'key-compromise', revoked_at: '2026-08-01T00:00:00Z' }],
      },
    });
    renderWithClient(<RevocationView />);

    await screen.findByText('jti-1');
    expect(screen.getByText(PROVENANCE)).toBeInTheDocument();
  });
});
