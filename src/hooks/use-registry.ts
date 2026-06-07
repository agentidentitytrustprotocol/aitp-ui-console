'use client';

import { useQuery } from '@tanstack/react-query';
import { getJSON } from '@/lib/api/client';
import { REFETCH } from '@/lib/query-options';
import type { Agent, ManifestEnvelope } from '@/lib/types/cp';

interface AgentsResponse {
  agents: Agent[];
}

export function useRegistry() {
  return useQuery({
    queryKey: ['registry-agents'],
    queryFn: () => getJSON<AgentsResponse>('/api/cp/registry/agents'),
    refetchInterval: REFETCH.slow,
  });
}

export function useAgent(aid: string | null) {
  return useQuery({
    queryKey: ['registry-agent', aid],
    queryFn: () => getJSON<Agent>(`/api/cp/registry/agents/${encodeURIComponent(aid!)}`),
    enabled: !!aid,
  });
}

export function useAgentManifest(aid: string | null) {
  return useQuery({
    queryKey: ['registry-agent-manifest', aid],
    queryFn: () =>
      getJSON<ManifestEnvelope>(`/api/cp/registry/agents/${encodeURIComponent(aid!)}/manifest`),
    enabled: !!aid,
  });
}
