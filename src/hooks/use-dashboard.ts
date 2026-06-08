'use client';

import { useQuery } from '@tanstack/react-query';
import { getJSON } from '@/lib/api/client';
import { REFETCH } from '@/lib/query-options';
import type { AgentMetrics, DashboardOverview, Range } from '@/lib/types/cp';

interface AgentMetricsResponse {
  agents: AgentMetrics[];
}

export function useDashboard(range: Range, refetchInterval: number | false = REFETCH.slow) {
  return useQuery({
    queryKey: ['dashboard', range],
    queryFn: () => getJSON<DashboardOverview>(`/api/cp/dashboard?range=${range}`),
    refetchInterval,
  });
}

export function useAgentMetrics() {
  return useQuery({
    queryKey: ['dashboard-agents'],
    queryFn: () => getJSON<AgentMetricsResponse>('/api/cp/dashboard/agents'),
    refetchInterval: REFETCH.slow,
  });
}
