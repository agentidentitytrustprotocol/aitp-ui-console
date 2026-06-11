import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './modal';

function renderModal(props?: Partial<React.ComponentProps<typeof Modal>>) {
  const onClose = props?.onClose ?? jest.fn();
  const utils = render(
    <Modal open onClose={onClose} title="Test dialog" {...props}>
      <button>inside</button>
    </Modal>,
  );
  return { onClose, ...utils };
}

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={() => undefined} title="Hidden">
        <div>body</div>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders an accessible dialog labelled by its title when open', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(screen.getByText('Test dialog')).toHaveAttribute('id', labelId!);
  });

  it('closes on Escape', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a backdrop mousedown but not on a click inside the card', () => {
    const { onClose } = renderModal();
    // Click inside the dialog content — should NOT close.
    fireEvent.mouseDown(screen.getByText('inside'));
    expect(onClose).not.toHaveBeenCalled();
    // mousedown on the presentation backdrop itself — should close.
    const backdrop = screen.getByRole('presentation');
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the X button is clicked', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close via ESC, backdrop, or X when dismissable=false', () => {
    const { onClose } = renderModal({ dismissable: false });
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(screen.getByRole('presentation'));
    const closeBtn = screen.getByRole('button', { name: /close dialog/i });
    expect(closeBtn).toBeDisabled();
    fireEvent.click(closeBtn);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders titleRight content alongside the title', () => {
    renderModal({ titleRight: <span>STATUS</span> });
    expect(screen.getByText('STATUS')).toBeInTheDocument();
  });

  it('locks body scroll while open and restores it on unmount', () => {
    const { unmount } = renderModal();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
