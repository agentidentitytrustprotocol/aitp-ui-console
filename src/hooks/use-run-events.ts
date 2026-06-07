'use client';

import { useState } from 'react';
import { useSse } from './use-sse';
import type { RunEvent } from '@/lib/types/playground';

interface UseRunEventsOptions {
  maxBuffer?: number;
}

export function useRunEvents(
  runId: string | null,
  { maxBuffer = 500 }: UseRunEventsOptions = {},
) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [done, setDone] = useState(false);

  const append = (evt: RunEvent) =>
    setEvents((prev) => {
      const next = [...prev, evt];
      return next.length > maxBuffer ? next.slice(next.length - maxBuffer) : next;
    });

  const { connected } = useSse<RunEvent>({
    url: runId ? `/api/playground/runs/${encodeURIComponent(runId)}/events` : null,
    onMessage(evt) {
      if (evt.type === 'stream.end' || evt.type === 'run.complete' || evt.type === 'run.failed') {
        if (evt.type === 'stream.end') {
          setDone(true);
          return;
        }
        append(evt);
        setDone(true);
        return;
      }
      append(evt);
    },
  });

  return { events, done, connected };
}
