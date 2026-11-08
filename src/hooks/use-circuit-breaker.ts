'use client';

import { useQueryClient } from '@tanstack/react-query';
import { postJSON } from '@/lib/api/client';
import type { WebhookCircuitBreaker } from '@/lib/types/cp';
import { useAdminMutation } from '@/hooks/use-console-session';

export function useResetCircuitBreaker() {
  const qc = useQueryClient();
  return useAdminMutation({
    mutationFn: (id: string) =>
      postJSON<WebhookCircuitBreaker>(
        `/api/cp/webhooks/${encodeURIComponent(id)}/circuit-breaker/reset`,
        {},
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}
