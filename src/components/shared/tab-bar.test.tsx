import { render, screen, fireEvent } from '@testing-library/react';
import { TabBar, type Tab } from './tab-bar';

const TABS: Tab<'events' | 'delegations' | 'tcts'>[] = [
  { id: 'events', label: 'Events' },
  { id: 'delegations', label: 'Delegations', count: 3 },
  { id: 'tcts', label: 'TCTs', count: null },
];

describe('TabBar', () => {
  it('renders one button per tab with its label', () => {
    render(<TabBar tabs={TABS} current="events" onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: /events/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delegations/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tcts/i })).toBeInTheDocument();
  });

  it('renders the count badge only when count is a non-null value', () => {
    render(<TabBar tabs={TABS} current="events" onChange={() => undefined} />);
    // delegations has count 3 → badge shown; tcts has count null → no badge.
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('null')).toBeNull();
  });

  it('shows a 0 count badge (0 is a valid count, not nullish)', () => {
    render(
      <TabBar
        tabs={[{ id: 'events', label: 'Events', count: 0 }]}
        current="events"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('fires onChange with the clicked tab id', () => {
    const onChange = jest.fn();
    render(<TabBar tabs={TABS} current="events" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /delegations/i }));
    expect(onChange).toHaveBeenCalledWith('delegations');
  });

  it('marks the current tab with heavier font weight than inactive tabs', () => {
    render(<TabBar tabs={TABS} current="delegations" onChange={() => undefined} />);
    const active = screen.getByRole('button', { name: /delegations/i });
    const inactive = screen.getByRole('button', { name: /events/i });
    expect(active.style.fontWeight).toBe('600');
    expect(inactive.style.fontWeight).toBe('400');
  });
});
