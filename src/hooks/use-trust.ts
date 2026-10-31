'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { delJSON, getJSON, patchJSON, postJSON } from '@/lib/api/client';
import { REFETCH } from '@/lib/query-options';
import type {
  Delegation,
  IssuerRevocations,
  PinnedKey,
  RevocationIssuers,
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

export function useTcts(params?: {
  issuer?: string;
  subject?: string;
  capability?: string;
  limit?: number;
}) {
  const qs = params
    ? `?${new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => !!v)
            .map(([k, v]) => [k, String(v)]),
        ),
      ).toString()}`
    : '';
  return useQuery({
    queryKey: ['cp-tcts', qs],
    queryFn: () => getJSON<TctsResponse>(`/api/cp/tcts${qs}`),
    refetchInterval: REFETCH.slow,
  });
}

export function useDelegations() {
  return useQuery({
    queryKey: ['cp-delegations'],
    queryFn: () => getJSON<DelegationsResponse>('/api/cp/delegations'),
    refetchInterval: REFETCH.slow,
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

/** The CP's largest page. One page keeps the read exact: an issuer that
 *  gains its first entry between two page requests shifts later pages. */
export const REVOCATION_ISSUERS_LIMIT = 1000;

/** The issuers that have revocation entries, with their counts. */
export function useRevocationIssuers() {
  return useQuery({
    queryKey: ['cp-revocation-issuers'],
    queryFn: () =>
      getJSON<RevocationIssuers>(
        `/api/cp/revocation/issuers?limit=${REVOCATION_ISSUERS_LIMIT}`,
      ),
    refetchInterval: REFETCH.slow,
  });
}

/** One query per issuer AID. Only issuers for which `isOpen` is true are
 *  fetched: each is a separate proxied request. */
export function useIssuerRevocations(issuers: string[], isOpen: (iss: string) => boolean = () => true) {
  return useQueries({
    queries: issuers.map((iss) => ({
      queryKey: ['cp-revocations', iss],
      queryFn: () =>
        getJSON<IssuerRevocations>(`/api/cp/revocations?iss=${encodeURIComponent(iss)}`),
      enabled: isOpen(iss),
      refetchInterval: REFETCH.slow,
    })),
  });
}

export function useCreateRevocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { jti: string; iss: string; reason?: string }) =>
      postJSON<{ jti: string; revokedAt: string; reason: string | null }>(
        '/api/cp/revocation/entries',
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cp-revocation-issuers'] });
      qc.invalidateQueries({ queryKey: ['cp-revocations'] });
      qc.invalidateQueries({ queryKey: ['cp-delegations'] });
      qc.invalidateQueries({ queryKey: ['cp-tcts'] });
    },
  });
}
