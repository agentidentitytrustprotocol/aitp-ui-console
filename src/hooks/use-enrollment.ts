'use client';

import { useQueryClient } from '@tanstack/react-query';
import { delJSON, postJSON } from '@/lib/api/client';
import type { EnrollmentToken, ManifestEnvelope } from '@/lib/types/cp';
import { useAdminMutation } from '@/hooks/use-console-session';

export function useCreateEnrollmentToken() {
  return useAdminMutation({
    mutationFn: (input: ManifestEnvelope) =>
      postJSON<EnrollmentToken>('/api/cp/registry/enroll', input),
  });
}

export function useDeregisterAgent() {
  const qc = useQueryClient();
  return useAdminMutation({
    mutationFn: (aid: string) => delJSON(`/api/cp/registry/agents/${encodeURIComponent(aid)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['registry-agents'] });
      qc.invalidateQueries({ queryKey: ['registry-agent'] });
    },
  });
}
