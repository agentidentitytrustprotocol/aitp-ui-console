'use client';

import { useQuery } from '@tanstack/react-query';
import { getJSON } from '@/lib/api/client';
import { REFETCH } from '@/lib/query-options';
import type { AuditEvent, HandshakeSession } from '@/lib/types/cp';

interface SessionsResponse {
  sessions: HandshakeSession[];
}

interface SessionDetailResponse {
  session: HandshakeSession;
  events: AuditEvent[];
}

function buildPath(filters?: { status?: string; aid?: string; limit?: number }): string {
  const qs = new URLSearchParams();
  if (filters?.status) qs.set('status', filters.status);
  if (filters?.aid) qs.set('aid', filters.aid);
  if (filters?.limit) qs.set('limit', String(filters.limit));
  const q = qs.toString();
  return q ? `/api/cp/sessions?${q}` : '/api/cp/sessions';
}

export function useSessions(filters?: { status?: string; aid?: string; limit?: number }) {
  return useQuery({
    queryKey: ['sessions', filters],
    queryFn: () => getJSON<SessionsResponse>(buildPath(filters)),
    refetchInterval: REFETCH.realtime,
  });
}

export function useSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: () =>
      getJSON<SessionDetailResponse>(`/api/cp/sessions/${encodeURIComponent(sessionId!)}`),
    enabled: !!sessionId,
  });
}

/** Disabled by default; the consumer toggles `enabled` when the operator
 *  triggers the replay action so the (potentially expensive) recompute
 *  doesn't fire on page load. */
export function useSessionReplay(sessionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['session-replay', sessionId],
    queryFn: () =>
      getJSON<unknown>(`/api/cp/sessions/${encodeURIComponent(sessionId!)}/replay`),
    enabled: !!sessionId && enabled,
    retry: false,
  });
}
