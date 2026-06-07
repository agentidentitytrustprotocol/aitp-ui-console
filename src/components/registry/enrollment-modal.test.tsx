/**
 * @jest-environment jsdom
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithClient } from '@/test/test-utils';
import { EnrollmentModal } from './enrollment-modal';

const mintMock = jest.fn();

jest.mock('@/hooks/use-enrollment', () => ({
  useCreateEnrollmentToken: () => ({
    mutate: (input: unknown, { onSuccess }: { onSuccess: (data: unknown) => void }) => {
      mintMock(input);
      onSuccess({
        token: 'aitp-test-token-redacted',
        jti: 'jti-12345',
        // 5 minutes ahead of the fake "now" set in beforeEach.
        exp: Math.floor(new Date('2026-01-01T00:05:00Z').getTime() / 1000),
        agent_aid: 'aid:pubkey:test',
      });
    },
    isPending: false,
    error: null,
  }),
}));

describe('EnrollmentModal countdown', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    mintMock.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the issued token with a 5:00 countdown that ticks down', () => {
    renderWithClient(<EnrollmentModal onClose={() => undefined} />);

    const textarea = screen.getByPlaceholderText(/manifest/i) as HTMLTextAreaElement;
    const validEnvelope = JSON.stringify({ manifest: { aid: 'aid:pubkey:x' } });
    fireEvent.change(textarea, { target: { value: validEnvelope } });

    fireEvent.click(screen.getByRole('button', { name: /Mint token/i }));

    expect(mintMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Token expires in 5:00')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(screen.getByText('Token expires in 4:59')).toBeInTheDocument();

    // Skip forward 4:50; should show 0:09.
    act(() => {
      jest.advanceTimersByTime(290_000);
    });
    expect(screen.getByText('Token expires in 0:09')).toBeInTheDocument();

    // After expiry the display floors at 0:00 rather than going negative.
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Token expires in 0:00')).toBeInTheDocument();
  });
});
