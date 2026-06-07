'use client';

import { useQuery } from '@tanstack/react-query';
import { getJSON } from '@/lib/api/client';
import { REFETCH } from '@/lib/query-options';
import type { AuditEvent } from '@/lib/types/cp';

interface AuditResponse {
  events: AuditEvent[];
  total?: number;
}

interface UseAuditOptions {
  actor?: string;
  action?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export function useAudit(opts: UseAuditOptions = {}) {
  const params = new URLSearchParams();
  if (opts.actor) params.set('actor', opts.actor);
  if (opts.action) params.set('action', opts.action);
  if (opts.since) params.set('since', opts.since);
  if (opts.until) params.set('until', opts.until);
  params.set('limit', String(opts.limit ?? 100));
  const qs = `?${params.toString()}`;
  return useQuery({
    queryKey: ['cp-audit', qs],
    queryFn: () => getJSON<AuditResponse>(`/api/cp/audit${qs}`),
    refetchInterval: REFETCH.list,
  });
}
