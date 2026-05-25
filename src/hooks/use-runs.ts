'use client';

import { useQuery } from '@tanstack/react-query';
import { getJSON } from '@/lib/api/client';
import type { RunList, RunSummary } from '@/lib/types/playground';

export function useRuns() {
  const query = useQuery({
    queryKey: ['runs'],
    queryFn: () => getJSON<RunList>('/api/playground/runs'),
    refetchInterval: (q) => {
      const runs = q.state.data?.runs ?? [];
      const active = runs.some((r: RunSummary) => r.status === 'pending' || r.status === 'running');
      return active ? 3_000 : 15_000;
    },
  });
  return query;
}

export function useRunCount(): number {
  const { data } = useQuery({
    queryKey: ['runs'],
    queryFn: () => getJSON<RunList>('/api/playground/runs'),
    refetchInterval: 10_000,
    enabled: typeof window !== 'undefined',
  });
  const runs = data?.runs ?? [];
  return runs.filter((r) => r.status === 'pending' || r.status === 'running').length;
}
