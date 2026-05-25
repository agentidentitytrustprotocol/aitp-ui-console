import { render, screen } from '@testing-library/react';
import { CapabilityBadge, Tag } from './capability-badge';

describe('CapabilityBadge / Tag', () => {
  it('renders a capability name', () => {
    render(<CapabilityBadge cap="research.query" />);
    expect(screen.getByText('research.query')).toBeInTheDocument();
  });

  it('Tag renders children verbatim', () => {
    render(<Tag>cross-org</Tag>);
    expect(screen.getByText('cross-org')).toBeInTheDocument();
  });
});
