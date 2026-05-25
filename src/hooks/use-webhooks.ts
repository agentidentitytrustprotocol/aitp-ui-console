'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { delJSON, getJSON, postJSON, putJSON } from '@/lib/api/client';
import type { Webhook } from '@/lib/types/cp';

interface WebhooksResponse {
  webhooks: Webhook[];
}

export function useWebhooks() {
  return useQuery({
    queryKey: ['webhooks'],
    queryFn: () => getJSON<WebhooksResponse>('/api/cp/webhooks'),
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { url: string; events: string[]; active: boolean }) =>
      postJSON<Webhook>('/api/cp/webhooks', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; active?: boolean; events?: string[]; url?: string }) => {
      const { id, ...body } = input;
      return putJSON<Webhook>(`/api/cp/webhooks/${encodeURIComponent(id)}`, body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => delJSON(`/api/cp/webhooks/${encodeURIComponent(id)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}
