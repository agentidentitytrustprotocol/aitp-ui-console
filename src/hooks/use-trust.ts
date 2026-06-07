'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { delJSON, getJSON, postJSON } from '@/lib/api/client';
import type {
  Delegation,
  PinnedKey,
  RevocationList,
  Tct,
  TrustAnchor,
} from '@/lib/types/cp';

interface TctsResponse {
  tcts: Tct[];
  total?: number;
}

interface DelegationsResponse {
  delegations: Delegation[];
}

interface TrustAnchorsResponse {
  trustAnchors: TrustAnchor[];
}

interface PinnedKeysResponse {
  pinnedKeys: PinnedKey[];
}

export function useTcts(params?: { issuer?: string; subject?: string; capability?: string }) {
  const qs = params
    ? `?${new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => !!v)) as Record<string, string>,
      ).toString()}`
    : '';
  return useQuery({
    queryKey: ['cp-tcts', qs],
    queryFn: () => getJSON<TctsResponse>(`/api/cp/tcts${qs}`),
    refetchInterval: 30_000,
  });
}

export function useDelegations() {
  return useQuery({
    queryKey: ['cp-delegations'],
    queryFn: () => getJSON<DelegationsResponse>('/api/cp/delegations'),
    refetchInterval: 30_000,
  });
}

export function useTrustAnchors() {
  return useQuery({
    queryKey: ['cp-trust-anchors'],
    queryFn: () => getJSON<TrustAnchorsResponse>('/api/cp/trust-anchors'),
  });
}

export function useCreateTrustAnchor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { namespace?: string; issuerUrl: string; jwksUrl?: string; label?: string }) =>
      postJSON<TrustAnchor>('/api/cp/trust-anchors', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cp-trust-anchors'] }),
  });
}

async function patchJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export function useUpdateTrustAnchor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      issuerUrl?: string;
      jwksUrl?: string | null;
      label?: string | null;
    }) => {
      const { id, ...patch } = input;
      return patchJSON<TrustAnchor>(`/api/cp/trust-anchors/${encodeURIComponent(id)}`, patch);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cp-trust-anchors'] }),
  });
}

export function useDeleteTrustAnchor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => delJSON(`/api/cp/trust-anchors/${encodeURIComponent(id)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cp-trust-anchors'] }),
  });
}

export function usePinnedKeys() {
  return useQuery({
    queryKey: ['cp-pinned-keys'],
    queryFn: () => getJSON<PinnedKeysResponse>('/api/cp/pinned-keys'),
  });
}

export function useCreatePinnedKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      namespace?: string;
      aid: string;
      pubkey: string;
      label?: string;
      expiresAt?: string;
    }) => postJSON<PinnedKey>('/api/cp/pinned-keys', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cp-pinned-keys'] }),
  });
}

export function useDeletePinnedKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ namespace, aid }: { namespace: string; aid: string }) => {
      const qs = `?namespace=${encodeURIComponent(namespace)}&aid=${encodeURIComponent(aid)}`;
      return delJSON(`/api/cp/pinned-keys${qs}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cp-pinned-keys'] }),
  });
}

/** The CP `/api/revocation/entries` route is POST-only. The list of
 *  revoked jtis lives in the signed well-known revocation list, which
 *  the console already proxies. */
export function useRevocationList() {
  return useQuery({
    queryKey: ['cp-revocation-list'],
    queryFn: () => getJSON<RevocationList>('/api/cp/well-known/aitp-revocation-list'),
    refetchInterval: 60_000,
  });
}

export function useCreateRevocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { jti: string; reason?: string }) =>
      postJSON<{ jti: string; revokedAt: string; reason: string | null }>(
        '/api/cp/revocation/entries',
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cp-revocation-list'] });
      qc.invalidateQueries({ queryKey: ['cp-delegations'] });
      qc.invalidateQueries({ queryKey: ['cp-tcts'] });
    },
  });
}
