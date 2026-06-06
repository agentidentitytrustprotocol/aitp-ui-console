'use client';

import { useQuery } from '@tanstack/react-query';
import { getJSON } from '@/lib/api/client';
import type {
  PlaygroundAgentsResponse,
  PlaygroundCapabilities,
} from '@/lib/types/playground';

export function usePlaygroundCapabilities() {
  return useQuery({
    queryKey: ['playground-capabilities'],
    queryFn: () => getJSON<PlaygroundCapabilities>('/api/playground/capabilities'),
    refetchInterval: 30_000,
  });
}

export function usePlaygroundAgents() {
  return useQuery({
    queryKey: ['playground-agents'],
    queryFn: () => getJSON<PlaygroundAgentsResponse>('/api/playground/agents'),
    refetchInterval: 5_000,
  });
}

export function usePlaygroundMetrics() {
  return useQuery({
    queryKey: ['playground-metrics'],
    queryFn: async () => {
      const res = await fetch('/api/playground/metrics', { cache: 'no-store' });
      return res.text();
    },
    refetchInterval: 15_000,
  });
}

export function useCpMetrics() {
  return useQuery({
    queryKey: ['cp-metrics'],
    queryFn: async () => {
      const res = await fetch('/api/cp/metrics', { cache: 'no-store' });
      return res.text();
    },
    refetchInterval: 15_000,
  });
}

interface CpReadyz {
  ready: boolean;
  draining: boolean;
  checks?: Record<string, 'ok' | 'fail'>;
}

export function useCpReadyz() {
  return useQuery({
    queryKey: ['cp-readyz'],
    queryFn: () => getJSON<CpReadyz>('/api/cp/readyz'),
    refetchInterval: 10_000,
    retry: false,
  });
}
