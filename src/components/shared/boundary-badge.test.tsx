import { render, screen } from '@testing-library/react';
import { BoundaryBadge } from './boundary-badge';

describe('BoundaryBadge', () => {
  it.each([
    ['intra_org', 'intra-org'],
    ['cross_org', 'cross-org'],
    ['cross_cloud', 'cross-cloud'],
  ])('maps %s to the friendly hyphenated label', (boundary, label) => {
    render(<BoundaryBadge boundary={boundary} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders a dash for missing boundary', () => {
    render(<BoundaryBadge boundary={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('passes unknown boundary values through unchanged', () => {
    render(<BoundaryBadge boundary={'experimental'} />);
    expect(screen.getByText('experimental')).toBeInTheDocument();
  });
});
