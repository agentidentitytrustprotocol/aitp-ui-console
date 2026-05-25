'use client';

import { useQuery } from '@tanstack/react-query';
import { getJSON } from '@/lib/api/client';
import type { AgentMetrics, DashboardOverview, Range } from '@/lib/types/cp';

interface AgentMetricsResponse {
  agents: AgentMetrics[];
}

export function useDashboard(range: Range) {
  return useQuery({
    queryKey: ['dashboard', range],
    queryFn: () => getJSON<DashboardOverview>(`/api/cp/dashboard?range=${range}`),
    refetchInterval: 30_000,
  });
}

export function useAgentMetrics() {
  return useQuery({
    queryKey: ['dashboard-agents'],
    queryFn: () => getJSON<AgentMetricsResponse>('/api/cp/dashboard/agents'),
    refetchInterval: 30_000,
  });
}
