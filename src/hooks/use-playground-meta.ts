'use client';

import { useQuery } from '@tanstack/react-query';
import { getJSON } from '@/lib/api/client';
import { REFETCH } from '@/lib/query-options';
import type {
  PlaygroundAgentsResponse,
  PlaygroundCapabilities,
} from '@/lib/types/playground';
import type { CpReadyz } from '@/lib/types/cp';

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

export function usePlaygroundMetrics() {
  return useQuery({
    queryKey: ['playground-metrics'],
    queryFn: async () => {
      const res = await fetch('/api/playground/metrics', { cache: 'no-store' });
      return res.text();
    },
    refetchInterval: REFETCH.list,
  });
}

export function useCpMetrics() {
  return useQuery({
    queryKey: ['cp-metrics'],
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
