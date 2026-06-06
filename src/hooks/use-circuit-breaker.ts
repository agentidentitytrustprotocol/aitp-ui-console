'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postJSON } from '@/lib/api/client';
import type { WebhookCircuitBreaker } from '@/lib/types/cp';

export function useResetCircuitBreaker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      postJSON<WebhookCircuitBreaker>(
        `/api/cp/webhooks/${encodeURIComponent(id)}/circuit-breaker/reset`,
        {},
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}
