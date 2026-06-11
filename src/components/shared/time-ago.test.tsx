import { act, render, screen } from '@testing-library/react';
import { TimeAgo } from './time-ago';

describe('TimeAgo', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-24T12:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('renders the relative label for the given timestamp', () => {
    render(<TimeAgo ts={new Date('2026-05-24T11:59:55Z')} />);
    expect(screen.getByText('5s ago')).toBeInTheDocument();
  });

  it('re-renders as wall-clock time advances past the interval', () => {
    render(<TimeAgo ts={new Date('2026-05-24T11:59:55Z')} intervalMs={1_000} />);
    expect(screen.getByText('5s ago')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(screen.getByText('10s ago')).toBeInTheDocument();
  });

  it('renders a dash for nullish timestamps', () => {
    render(<TimeAgo ts={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('clears its interval on unmount', () => {
    const clearSpy = jest.spyOn(global, 'clearInterval');
    const { unmount } = render(<TimeAgo ts={Date.now()} />);
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
