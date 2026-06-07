'use client';

import { useQuery } from '@tanstack/react-query';
import { getJSON } from '@/lib/api/client';
import { REFETCH } from '@/lib/query-options';
import type { RunList, RunSummary } from '@/lib/types/playground';

export function useRuns() {
  const query = useQuery({
    queryKey: ['runs'],
    queryFn: () => getJSON<RunList>('/api/playground/runs'),
    refetchInterval: (q) => {
      const runs = q.state.data?.runs ?? [];
      const active = runs.some((r: RunSummary) => r.status === 'pending' || r.status === 'running');
      return active ? REFETCH.runActive : REFETCH.list;
    },
  });
  return query;
}

export function useRunCount(): number {
  const { data } = useQuery({
    queryKey: ['runs'],
    queryFn: () => getJSON<RunList>('/api/playground/runs'),
    refetchInterval: REFETCH.health,
    enabled: typeof window !== 'undefined',
  });
  const runs = data?.runs ?? [];
  return runs.filter((r) => r.status === 'pending' || r.status === 'running').length;
}
