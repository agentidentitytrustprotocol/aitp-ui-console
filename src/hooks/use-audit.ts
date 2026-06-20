'use client';

import { useQuery } from '@tanstack/react-query';
import { getJSON } from '@/lib/api/client';
import { REFETCH } from '@/lib/query-options';
import type { AuditEvent } from '@/lib/types/cp';

interface AuditResponse {
  events: AuditEvent[];
  count?: number;
}

interface UseAuditOptions {
  aid?: string;
  type?: string;
  since?: string;
  until?: string;
  limit?: number;
}

// Sources the CP telemetry event history (/api/events/history), which
// returns `{ events: AuditEvent[] }` matching the AuditEvent shape this
// page renders (type / aidA / aidB / sessionId / runId / payload). The
// admin-action log lives at /api/cp/audit and has a different shape.
export function useAudit(opts: UseAuditOptions = {}) {
  const params = new URLSearchParams();
  if (opts.aid) params.set('aid', opts.aid);
  if (opts.type) params.set('type', opts.type);
  if (opts.since) params.set('since', opts.since);
  if (opts.until) params.set('until', opts.until);
  params.set('limit', String(opts.limit ?? 100));
  const qs = `?${params.toString()}`;
  return useQuery({
    queryKey: ['cp-audit', qs],
    queryFn: () => getJSON<AuditResponse>(`/api/cp/events/history${qs}`),
    refetchInterval: REFETCH.list,
  });
}
