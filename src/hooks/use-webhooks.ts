'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { delJSON, getJSON, postJSON, putJSON } from '@/lib/api/client';
import type { Webhook } from '@/lib/types/cp';
import { useAdminMutation, useOperatorAccess } from '@/hooks/use-console-session';

interface WebhooksResponse {
  webhooks: Webhook[];
}

/** Admin-class: fetched only with an operator session. */
export function useWebhooks() {
  const { canAdmin } = useOperatorAccess();
  return useQuery({
    queryKey: ['webhooks'],
    enabled: canAdmin,
    queryFn: () => getJSON<WebhooksResponse>('/api/cp/webhooks'),
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useAdminMutation({
    mutationFn: (input: { url: string; events: string[]; active: boolean }) =>
      postJSON<Webhook>('/api/cp/webhooks', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useAdminMutation({
    mutationFn: (input: { id: string; active?: boolean; events?: string[]; url?: string }) => {
      const { id, ...body } = input;
      return putJSON<Webhook>(`/api/cp/webhooks/${encodeURIComponent(id)}`, body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useAdminMutation({
    mutationFn: (id: string) => delJSON(`/api/cp/webhooks/${encodeURIComponent(id)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}
