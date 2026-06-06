'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJSON, postJSON } from '@/lib/api/client';
import type {
  Delegation,
  PinnedKey,
  RevocationEntry,
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
  anchors: TrustAnchor[];
}

interface PinnedKeysResponse {
  keys: PinnedKey[];
}

interface RevocationEntriesResponse {
  entries: RevocationEntry[];
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
    mutationFn: (input: { namespace: string; issuerUrl: string; displayName?: string }) =>
      postJSON<TrustAnchor>('/api/cp/trust-anchors', input),
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
      namespace: string;
      aid: string;
      spkiFingerprint: string;
      publicKeyPem?: string;
      algorithm?: string;
    }) => postJSON<PinnedKey>('/api/cp/pinned-keys', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cp-pinned-keys'] }),
  });
}

export function useRevocationEntries() {
  return useQuery({
    queryKey: ['cp-revocation-entries'],
    queryFn: () => getJSON<RevocationEntriesResponse>('/api/cp/revocation/entries'),
    refetchInterval: 30_000,
  });
}

export function useCreateRevocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { jti: string; reason?: string }) =>
      postJSON<RevocationEntry>('/api/cp/revocation/entries', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cp-revocation-entries'] });
      qc.invalidateQueries({ queryKey: ['cp-delegations'] });
      qc.invalidateQueries({ queryKey: ['cp-tcts'] });
    },
  });
}
