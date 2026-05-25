'use client';

import { useState } from 'react';
import { useSse } from './use-sse';
import type { RunEvent } from '@/lib/types/playground';

export function useRunEvents(runId: string | null) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [done, setDone] = useState(false);

  const { connected } = useSse<RunEvent>({
    url: runId ? `/api/playground/runs/${encodeURIComponent(runId)}/events` : null,
    onMessage(evt) {
      if (evt.type === 'stream.end' || evt.type === 'run.complete' || evt.type === 'run.failed') {
        if (evt.type === 'stream.end') {
          setDone(true);
          return;
        }
        setEvents((prev) => [...prev, evt]);
        setDone(true);
        return;
      }
      setEvents((prev) => [...prev, evt]);
    },
  });

  return { events, done, connected };
}
