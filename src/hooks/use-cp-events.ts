'use client';

import { useState } from 'react';
import { useSse } from './use-sse';
import type { CpEvent } from '@/lib/types/cp';

interface UseCpEventsOptions {
  maxBuffer?: number;
  filter?: (e: CpEvent) => boolean;
  enabled?: boolean;
}

export function useCpEvents({ maxBuffer = 200, filter, enabled = true }: UseCpEventsOptions = {}) {
  const [events, setEvents] = useState<CpEvent[]>([]);
  const { connected, state } = useSse<CpEvent>({
    url: enabled ? '/api/cp/events/stream' : null,
    capacityProbePath: '/api/cp/events/stream',
    onMessage(evt) {
      if (filter && !filter(evt)) return;
      setEvents((prev) => {
        const next = [evt, ...prev];
        return next.length > maxBuffer ? next.slice(0, maxBuffer) : next;
      });
    },
  });
  return { events, connected, state };
}
