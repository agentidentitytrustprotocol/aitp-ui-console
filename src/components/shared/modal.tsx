'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import { Card } from './card';
import { C } from '@/lib/colors';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Optional content rendered to the right of the title (e.g. status pill). */
  titleRight?: ReactNode;
  /** Defaults to 560px. */
  maxWidth?: number;
  /** Override the rendered title id for external aria-labelledby refs. */
  titleId?: string;
  /** If false, ESC + backdrop click no longer dismiss. Useful while a
   *  mutation is pending. */
  dismissable?: boolean;
  /** Extra styles on the Card body. */
  bodyStyle?: CSSProperties;
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Modal({
  open,
  onClose,
  title,
  titleRight,
  children,
  maxWidth = 560,
  titleId: titleIdProp,
  dismissable = true,
  bodyStyle,
}: ModalProps) {
  const generatedId = useId();
  const titleId = titleIdProp ?? `modal-title-${generatedId}`;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const requestClose = useCallback(() => {
    if (dismissable) onClose();
  }, [dismissable, onClose]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Move focus into the dialog so screen readers announce it and tab
    // order starts inside the modal.
    const node = dialogRef.current;
    if (node) {
      const first = node.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node).focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      const prev = previouslyFocused.current;
      if (prev && document.body.contains(prev)) prev.focus();
    };
  }, [open, requestClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000c',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ outline: 'none', width: '100%', maxWidth, display: 'flex' }}
      >
        <Card style={{ padding: 20, width: '100%', ...bodyStyle }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div
              id={titleId}
              style={{ fontSize: 14, fontWeight: 600, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {title}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {titleRight}
              <button
                onClick={requestClose}
                aria-label="Close dialog"
                disabled={!dismissable}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: dismissable ? 'pointer' : 'not-allowed',
                  color: C.textMuted,
                  opacity: dismissable ? 1 : 0.4,
                  padding: 0,
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          {children}
        </Card>
      </div>
    </div>
  );
}
