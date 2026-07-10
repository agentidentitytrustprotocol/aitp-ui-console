'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { delJSON, getJSON, postJSON } from '@/lib/api/client';
import { REFETCH } from '@/lib/query-options';
import type {
  HostedAgent,
  HostedAgentList,
  HostHandshakeRequest,
  HostHandshakeResult,
  HostInvokeRequest,
  HostInvokeResult,
  HostRequest,
} from '@/lib/types/playground';

const KEY = ['hosted-agents'];

/** List hosted agents. Their status doesn't churn like runs, so poll at the
 *  ordinary list cadence. */
export function useHostedAgents() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => getJSON<HostedAgentList>('/api/playground/hosted-agents'),
    refetchInterval: REFETCH.list,
  });
}

export function useHostAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: HostRequest) =>
      postJSON<HostedAgent>('/api/playground/hosted-agents', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useStopHostedAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      delJSON(`/api/playground/hosted-agents/${encodeURIComponent(id)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useResolveAndHandshake() {
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: HostHandshakeRequest }) =>
      postJSON<HostHandshakeResult>(
        `/api/playground/hosted-agents/${encodeURIComponent(id)}/resolve-and-handshake`,
        body,
      ),
  });
}

export function useInvokeHosted() {
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: HostInvokeRequest }) =>
      postJSON<HostInvokeResult>(
        `/api/playground/hosted-agents/${encodeURIComponent(id)}/invoke`,
        body,
      ),
  });
}
