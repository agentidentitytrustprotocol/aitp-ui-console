'use client';

import { useQuery } from '@tanstack/react-query';
import { getJSON } from '@/lib/api/client';
import type { AuditEvent, HandshakeSession } from '@/lib/types/cp';
import type { NarrateResponse, RunDeliveriesResponse } from '@/lib/types/playground';

export function useRunNarrate(runId: string | null) {
  return useQuery({
    queryKey: ['run-narrate', runId],
    queryFn: () =>
      getJSON<NarrateResponse>(`/api/playground/runs/${encodeURIComponent(runId!)}/narrate`),
    enabled: !!runId,
  });
}

interface RunCpAuditResponse {
  run_id: string;
  cp_enabled: boolean;
  events: AuditEvent[];
}

export function useRunCpAudit(runId: string | null) {
  return useQuery({
    queryKey: ['run-cp-audit', runId],
    queryFn: () =>
      getJSON<RunCpAuditResponse>(`/api/playground/runs/${encodeURIComponent(runId!)}/cp-audit`),
    enabled: !!runId,
  });
}

interface RunCpSessionsResponse {
  run_id: string;
  cp_enabled: boolean;
  sessions: HandshakeSession[];
}

export function useRunCpSessions(runId: string | null) {
  return useQuery({
    queryKey: ['run-cp-sessions', runId],
    queryFn: () =>
      getJSON<RunCpSessionsResponse>(`/api/playground/runs/${encodeURIComponent(runId!)}/cp-sessions`),
    enabled: !!runId,
  });
}

export function useRunDeliveries(runId: string | null) {
  return useQuery({
    queryKey: ['run-deliveries', runId],
    queryFn: () =>
      getJSON<RunDeliveriesResponse>(`/api/playground/runs/${encodeURIComponent(runId!)}/deliveries`),
    enabled: !!runId,
  });
}
