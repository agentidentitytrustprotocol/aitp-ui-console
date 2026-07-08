import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './toast';

function Fire() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success('Saved', 'It is safe now')}>fire-success</button>
      <button onClick={() => toast.info('Heads up')}>fire-info</button>
      <button onClick={() => toast.error('Something broke', 'HTTP 500')}>fire-error</button>
    </>
  );
}

function renderHarness() {
  return render(
    <ToastProvider>
      <Fire />
    </ToastProvider>,
  );
}

describe('useToast variants', () => {
  it('renders a success toast with message, detail and status role', () => {
    const { container } = renderHarness();
    fireEvent.click(screen.getByText('fire-success'));

    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Saved');
    expect(toast).toHaveTextContent('It is safe now');
    expect(container.querySelector('svg[data-icon="CheckCircle2"]')).not.toBeNull();
  });

  it('renders an info toast with the info icon', () => {
    const { container } = renderHarness();
    fireEvent.click(screen.getByText('fire-info'));

    expect(screen.getByRole('status')).toHaveTextContent('Heads up');
    expect(container.querySelector('svg[data-icon="Info"]')).not.toBeNull();
  });

  it('renders an error toast as an alert with the warning icon', () => {
    const { container } = renderHarness();
    fireEvent.click(screen.getByText('fire-error'));

    const toast = screen.getByRole('alert');
    expect(toast).toHaveTextContent('Something broke');
    expect(toast).toHaveTextContent('HTTP 500');
    expect(container.querySelector('svg[data-icon="AlertTriangle"]')).not.toBeNull();
  });

  it('throws when used outside a ToastProvider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Fire />)).toThrow('useToast must be used inside <ToastProvider>');
  });
});

describe('toast stacking and dismissal', () => {
  it('stacks several toasts in the notifications region', () => {
    renderHarness();
    fireEvent.click(screen.getByText('fire-success'));
    fireEvent.click(screen.getByText('fire-info'));
    fireEvent.click(screen.getByText('fire-error'));

    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(region).toHaveTextContent('Saved');
    expect(region).toHaveTextContent('Heads up');
    expect(region).toHaveTextContent('Something broke');
    expect(screen.getAllByLabelText('Dismiss notification')).toHaveLength(3);
  });

  it('dismisses a toast via its close button', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByText('fire-info'));
    expect(screen.getByText('Heads up')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Dismiss notification'));
    expect(screen.queryByText('Heads up')).not.toBeInTheDocument();
  });
});

describe('auto-dismiss timing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('auto-dismisses success after 4s and error after 7s', () => {
    renderHarness();
    fireEvent.click(screen.getByText('fire-success'));
    fireEvent.click(screen.getByText('fire-error'));

    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Something broke')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(4_000);
    });
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    expect(screen.getByText('Something broke')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(3_000);
    });
    expect(screen.queryByText('Something broke')).not.toBeInTheDocument();
  });

  it('keeps a toast open forever when durationMs is 0', () => {
    function FireSticky() {
      const toast = useToast();
      return (
        <button onClick={() => toast.push({ kind: 'info', message: 'Pinned', durationMs: 0 })}>
          fire-sticky
        </button>
      );
    }
    render(
      <ToastProvider>
        <FireSticky />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('fire-sticky'));

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Pinned')).toBeInTheDocument();
  });
});
