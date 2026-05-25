import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AidCell } from './aid-cell';

describe('AidCell', () => {
  const aid = 'aid:pubkey:A7mK9xP2nR4vQ8sL3tW6uY1jC5bE0fH';

  it('renders a dash when aid is missing', () => {
    render(<AidCell aid={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the truncated form when short=true (default)', () => {
    render(<AidCell aid={aid} />);
    expect(screen.getByText(/A7mK9xP2…E0fH/)).toBeInTheDocument();
  });

  it('renders the full aid when short=false', () => {
    render(<AidCell aid={aid} short={false} />);
    expect(screen.getByText(aid)).toBeInTheDocument();
  });

  it('copies the full aid (not the truncated label) to the clipboard on click', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(<AidCell aid={aid} />);
    fireEvent.click(screen.getByText(/A7mK9xP2…E0fH/));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(aid));
  });
});
