'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { delJSON, postJSON } from '@/lib/api/client';
import type { EnrollmentToken, ManifestEnvelope } from '@/lib/types/cp';

export function useCreateEnrollmentToken() {
  return useMutation({
    mutationFn: (input: ManifestEnvelope) =>
      postJSON<EnrollmentToken>('/api/cp/registry/enroll', input),
  });
}

export function useDeregisterAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (aid: string) => delJSON(`/api/cp/registry/agents/${encodeURIComponent(aid)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['registry-agents'] });
      qc.invalidateQueries({ queryKey: ['registry-agent'] });
    },
  });
}
