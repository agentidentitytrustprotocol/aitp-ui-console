'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, AlertTriangle, X, Info } from 'lucide-react';
import { C } from '@/lib/colors';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** Optional extra detail rendered in a smaller line below the message. */
  detail?: string;
  /** ms before auto-dismiss. 0 disables auto-dismiss. */
  durationMs: number;
}

interface ToastContextValue {
  push: (t: Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number }) => number;
  dismiss: (id: number) => void;
  success: (message: string, detail?: string) => number;
  error: (message: string, detail?: string) => number;
  info: (message: string, detail?: string) => number;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULTS: Record<ToastKind, number> = {
  success: 4_000,
  info: 4_000,
  error: 7_000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((curr) => curr.filter((t) => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) clearTimeout(tm);
    timers.current.delete(id);
  }, []);

  const push = useCallback<ToastContextValue['push']>(
    ({ kind, message, detail, durationMs }) => {
      idRef.current += 1;
      const id = idRef.current;
      const ms = durationMs ?? DEFAULTS[kind];
      setToasts((curr) => [...curr, { id, kind, message, detail, durationMs: ms }]);
      if (ms > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), ms),
        );
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      dismiss,
      success: (message, detail) => push({ kind: 'success', message, detail }),
      error: (message, detail) => push({ kind: 'error', message, detail }),
      info: (message, detail) => push({ kind: 'info', message, detail }),
    }),
    [push, dismiss],
  );

  useEffect(() => {
    const timersMap = timers.current;
    return () => {
      timersMap.forEach((t) => clearTimeout(t));
      timersMap.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 200,
        pointerEvents: 'none',
        maxWidth: 360,
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { kind, message, detail } = toast;
  const accent = kind === 'success' ? C.green : kind === 'error' ? C.red : C.blue;
  const Icon = kind === 'success' ? CheckCircle2 : kind === 'error' ? AlertTriangle : Info;
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      style={{
        pointerEvents: 'auto',
        background: C.bg2,
        border: `1px solid ${accent}40`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 6,
        padding: '10px 12px',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
      }}
    >
      <Icon size={14} color={accent} style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{message}</div>
        {detail && (
          <div
            style={{
              fontSize: 11,
              color: C.textDim,
              marginTop: 4,
              wordBreak: 'break-word',
            }}
          >
            {detail}
          </div>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: C.textMuted,
          padding: 0,
          marginLeft: 4,
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
}
