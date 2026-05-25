import { render, screen } from '@testing-library/react';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it.each([
    ['active', '●'],
    ['expired', '◌'],
    ['success', '✓'],
    ['failed', '✕'],
    ['running', '⟳'],
    ['pending', '○'],
    ['cancelled', '–'],
  ])('renders %s with its glyph and label', (status, glyph) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(status)).toBeInTheDocument();
    expect(screen.getByText(glyph)).toBeInTheDocument();
  });

  it('falls back to "?" for unknown statuses and uses pending label', () => {
    render(<StatusBadge status={'wat'} />);
    expect(screen.getByText('?')).toBeInTheDocument();
    expect(screen.getByText('wat')).toBeInTheDocument();
  });

  it('treats nullish input as pending', () => {
    render(<StatusBadge status={null} />);
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('adds the pulse class while running', () => {
    const { container } = render(<StatusBadge status="running" />);
    expect(container.querySelector('.pulse')).not.toBeNull();
  });
});
