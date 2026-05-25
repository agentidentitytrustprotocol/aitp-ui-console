'use client';

import { useQuery } from '@tanstack/react-query';
import { getJSON } from '@/lib/api/client';
import type { ScenarioSummary, ScenarioVersion } from '@/lib/types/playground';

interface ScenariosResponse {
  scenarios: ScenarioSummary[];
}

export function useScenarios() {
  return useQuery({
    queryKey: ['scenarios'],
    queryFn: () => getJSON<ScenariosResponse>('/api/playground/scenarios'),
  });
}

export function useScenario(ref: string | null) {
  return useQuery({
    queryKey: ['scenario', ref],
    queryFn: () => getJSON<ScenarioVersion>(`/api/playground/scenarios/${ref}`),
    enabled: !!ref,
  });
}
