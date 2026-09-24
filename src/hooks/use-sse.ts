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
  useEffect(() => {
    onMessageRef.current = onMessage;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (!url) {
      // Not a derived-state anti-pattern: this whole effect subscribes to
      // an external system (EventSource, below) and only re-runs when
      // `url` actually changes. This branch is the direct response to
      // that dependency going away -- there's no subscription to set up,
      // so reflect that in state and bail before anything else in the
      // effect runs.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState('closed');
      return;
    }

    let active = true;
    // True while the tab is hidden. Distinct from `active` (which only ever
    // goes false on unmount): a probe or fetch that was in flight when the
    // tab was hidden must not be allowed to open a connection once it
    // settles -- that would hold a capacity slot open behind a closed tab,
    // the exact thing `onVisibilityChange`'s "hidden" branch exists to
    // prevent.
    let suspended = false;
    // A fresh controller per probe attempt (assigned in connect(), below) --
    // AbortController.abort() is permanent, so reusing one across attempts
    // would let a single timed-out probe silently disable every later probe
    // for the rest of this mount.
    let currentProbeController: AbortController | null = null;

    function openEventSource() {
      if (!active || suspended) return;
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
        if (!active || suspended) return;
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
      if (!active || suspended) return;

      if (!capacityProbePath) {
        openEventSource();
        return;
      }

      const probeController = new AbortController();
      currentProbeController = probeController;
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
        if (!active || suspended) return;
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
        // anyway; EventSource has its own reconnect handling. If this was an
        // abort triggered by the tab going hidden (below), `suspended` is now
        // true and the check after this block stops it from opening a
        // connection behind a closed tab.
        clearTimeout(probeTimeout);
      } finally {
        if (currentProbeController === probeController) currentProbeController = null;
      }
      if (!active || suspended) return;
      openEventSource();
    }

    connect();

    const onVisibilityChange = () => {
      if (document.hidden) {
        suspended = true;
        try {
          esRef.current?.close();
        } catch {}
        try {
          currentProbeController?.abort();
        } catch {}
        currentProbeController = null;
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setState('closed');
      } else {
        suspended = false;
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
        currentProbeController?.abort();
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
