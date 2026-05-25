'use client';

import { useQuery } from '@tanstack/react-query';
import { Lock, Shield } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { getJSON } from '@/lib/api/client';
import { C } from '@/lib/colors';
import type { ManifestEnvelope, RevocationList } from '@/lib/types/cp';

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
  const manifest = useQuery({
    queryKey: ['cp-manifest'],
    queryFn: () => getJSON<ManifestEnvelope>('/api/cp/well-known/aitp-manifest'),
    refetchInterval: 60_000,
  });

  const revocation = useQuery({
    queryKey: ['cp-revocation'],
    queryFn: () => getJSON<RevocationList>('/api/cp/well-known/aitp-revocation-list'),
    refetchInterval: 60_000,
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

      {manifest.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : manifest.error || !manifest.data ? (
        <EmptyState
          title="CP manifest unavailable"
          description="Couldn't load /.well-known/aitp-manifest from the Control Plane."
        />
      ) : (
        <div style={{ padding: 14, background: C.bg3, borderRadius: 8, marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6, letterSpacing: '0.06em' }}>
            AID
          </div>
          <div
            className="mono"
            style={{ fontSize: 11, color: C.tealBright, wordBreak: 'break-all', lineHeight: 1.6 }}
          >
            {manifest.data.manifest?.aid ?? '—'}
          </div>
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
      )}

      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: C.text,
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Lock size={12} color={C.textDim} /> Revocation list
      </div>
      <div style={{ padding: 12, background: C.bg3, borderRadius: 6 }}>
        {revocation.isLoading ? (
          <div style={{ fontSize: 11, color: C.textMuted }}>Loading…</div>
        ) : revocation.error || !revocation.data ? (
          <div style={{ fontSize: 11, color: C.textMuted }}>Revocation list unavailable.</div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>
              <span style={{ color: revocation.data.entries.length === 0 ? C.green : C.amber }}>
                {revocation.data.entries.length} {revocation.data.entries.length === 1 ? 'entry' : 'entries'}
              </span>{' '}
              · expires {expiresIn(revocation.data.expiresAt)}
              {revocation.data.signedBy && ' · signed by CP'}
            </div>
            <div className="mono" style={{ fontSize: 10, color: C.textMuted }}>
              RFC-AITP-0008 compliant · empty list is a meaningful assertion
            </div>
          </>
        )}
      </div>

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
          The CP issues no TCTs in v1. Its revocation list is always empty.
          This becomes meaningful in v1.1 when the CP gains AITP auth capability.
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
