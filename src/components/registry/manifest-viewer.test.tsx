import { render, screen } from '@testing-library/react';
import { C } from '@/lib/colors';
import type { Verdict, VerifiedManifestEnvelope } from '@/lib/types/cp';

const useAgentManifestMock = jest.fn();
jest.mock('@/hooks/use-registry', () => ({
  useAgentManifest: () => useAgentManifestMock(),
}));

import { ManifestViewer } from './manifest-viewer';

function envelope(verification: Verdict): VerifiedManifestEnvelope {
  return {
    manifest: { aid: 'aid:pubkey:agent-under-test' },
    _verification: verification,
  };
}

describe('ManifestViewer verification badge', () => {
  it('shows the verified badge on ok:true', () => {
    useAgentManifestMock.mockReturnValue({
      data: envelope({ checked: true, ok: true }),
      isLoading: false,
      error: null,
    });
    render(<ManifestViewer aid="aid:pubkey:agent-under-test" />);

    expect(
      screen.getByText('· verified · signed by the key bound to this AID'),
    ).toHaveStyle({ color: C.green });
  });

  it('shows the expired badge as amber, not red', () => {
    useAgentManifestMock.mockReturnValue({
      data: envelope({ checked: true, ok: false, code: 'expired' }),
      isLoading: false,
      error: null,
    });
    render(<ManifestViewer aid="aid:pubkey:agent-under-test" />);

    expect(
      screen.getByText(
        "· EXPIRED · signature not assessed — the CP's manifest lapsed before it could be checked",
      ),
    ).toHaveStyle({ color: C.amber });
  });

  it('does not render the internal _verification key as part of the JSON tree', () => {
    useAgentManifestMock.mockReturnValue({
      data: envelope({ checked: true, ok: true }),
      isLoading: false,
      error: null,
    });
    render(<ManifestViewer aid="aid:pubkey:agent-under-test" />);

    expect(screen.queryByText('_verification')).not.toBeInTheDocument();
  });
});
