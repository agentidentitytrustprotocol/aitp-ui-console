'use client';

import { useQuery } from '@tanstack/react-query';
import { getJSON } from '@/lib/api/client';
import type { RunResponse } from '@/lib/types/playground';

export function useRun(runId: string | null, opts?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: ['run', runId],
    queryFn: () => getJSON<RunResponse>(`/api/playground/runs/${encodeURIComponent(runId!)}`),
    enabled: !!runId,
    refetchInterval: opts?.refetchInterval ?? false,
  });
}
