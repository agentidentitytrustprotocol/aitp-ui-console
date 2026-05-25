'use client';

import { useEffect, useRef, useState } from 'react';

interface UseSseOptions<T> {
  url: string | null;
  onMessage: (data: T) => void;
  onError?: (err: Event) => void;
  maxReconnectDelayMs?: number;
}

export function useSse<T>({
  url,
  onMessage,
  onError,
  maxReconnectDelayMs = 30_000,
}: UseSseOptions<T>) {
  const [connected, setConnected] = useState(false);
  const reconnectDelay = useRef(1_000);
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the latest callbacks in refs so the effect doesn't re-run when they change.
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  onMessageRef.current = onMessage;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!url) {
      setConnected(false);
      return;
    }

    let active = true;

    function connect() {
      if (!active) return;
      if (esRef.current) {
        try {
          esRef.current.close();
        } catch {}
      }
      const es = new EventSource(url!);
      esRef.current = es;

      es.onopen = () => {
        if (!active) return;
        setConnected(true);
        reconnectDelay.current = 1_000;
      };

      es.onmessage = (evt) => {
        if (!active) return;
        try {
          const data = JSON.parse(evt.data as string) as T;
          onMessageRef.current(data);
        } catch {
          // ignore unparseable frames
        }
      };

      es.onerror = (err) => {
        if (!active) return;
        setConnected(false);
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

    connect();

    const onVisibilityChange = () => {
      if (document.hidden) {
        try {
          esRef.current?.close();
        } catch {}
        setConnected(false);
      } else {
        reconnectDelay.current = 1_000;
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      try {
        esRef.current?.close();
      } catch {}
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [url, maxReconnectDelayMs]);

  return { connected };
}
