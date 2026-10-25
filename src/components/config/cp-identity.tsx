'use client';

import { useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { useHydrated } from '@/hooks/use-hydrated';
import { getJSON } from '@/lib/api/client';
import { C } from '@/lib/colors';
import { REFETCH } from '@/lib/query-options';
import { manifestVerdictBadge } from '@/lib/verification-display';
import type { VerifiedManifestEnvelope } from '@/lib/types/cp';

function expiresIn(expiresAt: number | string | undefined): string {
  if (expiresAt === undefined) return '—';
  const ts = typeof expiresAt === 'number' ? expiresAt * 1000 : new Date(expiresAt).getTime();
  const diff = ts - Date.now();
  if (diff < 0) return 'expired';
  const hr = Math.floor(diff / 3_600_000);
  const min = Math.floor((diff % 3_600_000) / 60_000);
  if (hr > 0) return `in ${hr}h ${min}m`;
  return `in ${min}m`;
}

export function CpIdentityCard() {
  // The query below starts fetching immediately and can resolve before
  // hydration finishes, so the client's first render can already jump past
  // the loading branch straight to content/empty-state while the server
  // (which always captures the pre-fetch state) rendered the skeleton --
  // an element-tree mismatch, not just a text one. Force the loading
  // branch until hydrated so the first client render always matches SSR.
  // See use-hydrated.ts / ConnectionPanel for the same race.
  const hydrated = useHydrated();

  const manifest = useQuery({
    queryKey: ['cp-manifest'],
    queryFn: () => getJSON<VerifiedManifestEnvelope>('/api/cp/well-known/aitp-manifest'),
    refetchInterval: REFETCH.veryslow,
  });

  return (
    <Card style={{ padding: 20 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: C.text,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Shield size={15} color={C.teal} /> CP Identity
      </div>

      {!hydrated || manifest.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : manifest.error || !manifest.data ? (
        <EmptyState
          title="CP manifest unavailable"
          description="Couldn't load /.well-known/aitp-manifest from the Control Plane."
        />
      ) : (
        (() => {
          const badge = manifestVerdictBadge(manifest.data._verification);
          return (
            <div style={{ padding: 14, background: C.bg3, borderRadius: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6, letterSpacing: '0.06em' }}>
                AID
              </div>
              <div
                className="mono"
                style={{ fontSize: 11, color: badge.aidColor, wordBreak: 'break-all', lineHeight: 1.6 }}
              >
                {manifest.data.manifest?.aid ?? '—'}
              </div>
              <div style={{ fontSize: 10, color: badge.color, marginTop: 4 }}>{badge.text}</div>
              <Row label="Display name" value={manifest.data.manifest?.display_name ?? '—'} />
              <Row label="Endpoint" value={manifest.data.manifest?.handshake_endpoint ?? '—'} />
              <Row label="Expires" value={expiresIn(manifest.data.manifest?.expires_at)} />
              <Row
                label="Capabilities"
                value={
                  (manifest.data.manifest?.offered_capabilities?.length ?? 0) === 0
                    ? 'none (registry + audit only)'
                    : manifest.data.manifest!.offered_capabilities!.join(', ')
                }
              />
            </div>
          );
        })()
      )}

      <div
        style={{
          marginTop: 14,
          padding: 12,
          background: C.teal + '10',
          border: `1px solid ${C.teal}25`,
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 11, color: C.teal, fontWeight: 500, marginBottom: 4 }}>Note</div>
        <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>
          The CP signs no revocation list. It records entries per issuer and each
          issuer signs and serves its own list (RFC-AITP-0008 §1.5): see Trust → Revocation.
        </div>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
      <span style={{ fontSize: 11, color: C.textDim }}>{label}</span>
      <span style={{ fontSize: 11, color: C.text, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  );
}
