'use client';

import { useQuery } from '@tanstack/react-query';
import { getJSON } from '@/lib/api/client';
import { REFETCH } from '@/lib/query-options';
import type {
  PlaygroundAgentsResponse,
  PlaygroundCapabilities,
} from '@/lib/types/playground';
import type { CpReadyz } from '@/lib/types/cp';
import { useOperatorAccess } from '@/hooks/use-console-session';

export function usePlaygroundCapabilities() {
  return useQuery({
    queryKey: ['playground-capabilities'],
    queryFn: () => getJSON<PlaygroundCapabilities>('/api/playground/capabilities'),
    refetchInterval: REFETCH.slow,
  });
}

export function usePlaygroundAgents() {
  return useQuery({
    queryKey: ['playground-agents'],
    queryFn: () => getJSON<PlaygroundAgentsResponse>('/api/playground/agents'),
    refetchInterval: REFETCH.realtime,
  });
}

/** Admin-class (`GET /metrics`): fetched only with an operator session. */
export function usePlaygroundMetrics() {
  const { canAdmin } = useOperatorAccess();
  return useQuery({
    queryKey: ['playground-metrics'],
    enabled: canAdmin,
    queryFn: async () => {
      const res = await fetch('/api/playground/metrics', { cache: 'no-store' });
      return res.text();
    },
    refetchInterval: REFETCH.list,
  });
}

/** Admin-class (`GET /api/metrics`): fetched only with an operator session. */
export function useCpMetrics() {
  const { canAdmin } = useOperatorAccess();
  return useQuery({
    queryKey: ['cp-metrics'],
    enabled: canAdmin,
    queryFn: async () => {
      const res = await fetch('/api/cp/metrics', { cache: 'no-store' });
      return res.text();
    },
    refetchInterval: REFETCH.list,
  });
}

export function useCpReadyz() {
  return useQuery({
    queryKey: ['cp-readyz'],
    queryFn: () => getJSON<CpReadyz>('/api/cp/readyz'),
    refetchInterval: REFETCH.health,
    retry: false,
  });
}
