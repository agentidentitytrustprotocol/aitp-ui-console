'use client';

import { useState } from 'react';
import { useSse } from './use-sse';
import type { AuditEvent } from '@/lib/types/cp';

interface UseCpEventsOptions {
  maxBuffer?: number;
  filter?: (e: AuditEvent) => boolean;
  enabled?: boolean;
}

export function useCpEvents({ maxBuffer = 200, filter, enabled = true }: UseCpEventsOptions = {}) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const { connected } = useSse<AuditEvent>({
    url: enabled ? '/api/cp/events/stream' : null,
    onMessage(evt) {
      if (filter && !filter(evt)) return;
      setEvents((prev) => {
        const next = [evt, ...prev];
        return next.length > maxBuffer ? next.slice(0, maxBuffer) : next;
      });
    },
  });
  return { events, connected };
}
