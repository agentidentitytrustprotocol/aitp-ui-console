'use client';

import { useEffect, useRef, useState } from 'react';

export type SseState = 'connecting' | 'connected' | 'reconnecting' | 'at-capacity' | 'closed';

interface UseSseOptions<T> {
  url: string | null;
  onMessage: (data: T) => void;
  onError?: (err: Event) => void;
  maxReconnectDelayMs?: number;
  /** When set, probed before opening the EventSource. A 503 on this path
   *  flips state to `at-capacity` and applies a longer backoff before
   *  retrying. Used for CP SSE where the upstream caps connection count. */
  capacityProbePath?: string;
}

interface UseSseResult {
  connected: boolean;
  state: SseState;
}

export function useSse<T>({
  url,
  onMessage,
  onError,
  maxReconnectDelayMs = 30_000,
  capacityProbePath,
}: UseSseOptions<T>): UseSseResult {
  const [state, setState] = useState<SseState>('connecting');
  const reconnectDelay = useRef(1_000);
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  onMessageRef.current = onMessage;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!url) {
      setState('closed');
      return;
    }

    let active = true;
    const probeController = new AbortController();

    function openEventSource() {
      if (!active) return;
      if (esRef.current) {
        try {
          esRef.current.close();
        } catch {}
      }
      setState((s) => (s === 'connected' ? s : 'connecting'));
      const es = new EventSource(url!);
      esRef.current = es;

      es.onopen = () => {
        if (!active) return;
        setState('connected');
        reconnectDelay.current = 1_000;
      };

      es.onmessage = (evt) => {
        if (!active) return;
        try {
          const data = JSON.parse(evt.data as string) as T;
          onMessageRef.current(data);
        } catch (err) {
          // Surface so consumers can count drops or display a banner.
          // Reason: silent drops looked like "missing events" bugs before.
          console.warn('[sse] unparseable frame', { url, err });
          onErrorRef.current?.(new Event('error'));
        }
      };

      es.onerror = (err) => {
        if (!active) return;
        setState('reconnecting');
        onErrorRef.current?.(err);
        try {
          es.close();
        } catch {}
        timerRef.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, maxReconnectDelayMs);
          connect();
        }, reconnectDelay.current);
      };
    }

    async function connect() {
      if (!active) return;

      if (!capacityProbePath) {
        openEventSource();
        return;
      }

      const probeTimeout = setTimeout(() => probeController.abort(), 10_000);
      try {
        const res = await fetch(capacityProbePath, {
          method: 'GET',
          headers: { Accept: 'text/event-stream' },
          cache: 'no-store',
          signal: probeController.signal,
        });
        clearTimeout(probeTimeout);
        try {
          await res.body?.cancel();
        } catch {}
        if (!active) return;
        if (res.status === 503) {
          setState('at-capacity');
          timerRef.current = setTimeout(() => {
            reconnectDelay.current = Math.min(
              Math.max(reconnectDelay.current, 5_000) * 2,
              maxReconnectDelayMs,
            );
            connect();
          }, Math.max(reconnectDelay.current, 5_000));
          return;
        }
      } catch {
        // Probe failed (network error or timeout) — try the EventSource
        // anyway; EventSource has its own reconnect handling.
        clearTimeout(probeTimeout);
      }
      openEventSource();
    }

    connect();

    const onVisibilityChange = () => {
      if (document.hidden) {
        try {
          esRef.current?.close();
        } catch {}
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setState('closed');
      } else {
        // A reconnect timer may already be pending from a prior failure;
        // clear it so we don't stack timers across visibility cycles.
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        reconnectDelay.current = 1_000;
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      try {
        probeController.abort();
      } catch {}
      if (timerRef.current) clearTimeout(timerRef.current);
      try {
        esRef.current?.close();
      } catch {}
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [url, maxReconnectDelayMs, capacityProbePath]);

  return { connected: state === 'connected', state };
}
