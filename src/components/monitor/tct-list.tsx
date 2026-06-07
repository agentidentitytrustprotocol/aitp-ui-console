'use client';

import { useState } from 'react';
import { Card } from '@/components/shared/card';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { AidCell } from '@/components/shared/aid-cell';
import { CapabilityBadge } from '@/components/shared/capability-badge';
import { TimeAgo } from '@/components/shared/time-ago';
import { useTcts } from '@/hooks/use-trust';
import { C } from '@/lib/colors';
import { shortId } from '@/lib/utils';
import type { Tct } from '@/lib/types/cp';

export function TctList() {
  const [issuer, setIssuer] = useState('');
  const [capability, setCapability] = useState('');
  const { data, isLoading, error } = useTcts({
    issuer: issuer || undefined,
    capability: capability || undefined,
  });
  const tcts = data?.tcts ?? [];
  const [selected, setSelected] = useState<Tct | null>(null);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: 14,
            borderBottom: `1px solid ${C.border}`,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
          }}
        >
          <input
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            placeholder="Filter by issuer AID…"
            style={inputStyle}
          />
          <input
            value={capability}
            onChange={(e) => setCapability(e.target.value)}
            placeholder="Filter by capability…"
            style={inputStyle}
          />
        </div>
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <LoadingSkeleton rows={5} />
          </div>
        ) : error ? (
          <EmptyState title="Couldn't load TCTs" description="Check the Control Plane connection." />
        ) : tcts.length === 0 ? (
          <EmptyState
            title="No TCTs observed"
            description="Observed TCTs are recorded on first capability invocation."
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['JTI', 'Issuer', 'Subject', 'Audience', 'Grants', 'Status', 'Expires'].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    style={{
                      padding: '8px 12px',
                      fontSize: 10,
                      color: C.textMuted,
                      textAlign: 'left',
                      fontWeight: 500,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tcts.map((t) => {
                const sel = selected?.jti === t.jti;
                return (
                  <tr
                    key={t.jti}
                    onClick={() => setSelected(t)}
                    style={{
                      borderBottom: `1px solid ${C.border}20`,
                      cursor: 'pointer',
                      background: sel ? C.bg3 : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        className="mono"
                        style={{ fontSize: 10, color: t.revoked ? C.red : C.teal }}
                      >
                        {shortId(t.jti, 14)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <AidCell aid={t.issuer} />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <AidCell aid={t.subject} />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <AidCell aid={t.audience} />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {(t.grants ?? []).map((g) => (
                          <CapabilityBadge key={g} cap={g} />
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          fontSize: 10,
                          color: t.revoked ? C.red : C.green,
                          fontWeight: 500,
                        }}
                      >
                        {t.revoked ? 'revoked' : 'active'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 11, color: C.textDim }}>
                      <TimeAgo ts={t.expiresAt} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card style={{ padding: 16, height: 'fit-content' }}>
        {selected ? (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>
              TCT detail
            </div>
            <pre
              className="mono"
              style={{
                fontSize: 11,
                color: C.textDim,
                background: C.bg3,
                padding: 10,
                borderRadius: 5,
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.6,
              }}
            >
              {JSON.stringify(selected, null, 2)}
            </pre>
          </>
        ) : (
          <div style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', padding: 20 }}>
            Click a TCT to inspect.
          </div>
        )}
      </Card>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: C.bg3,
  border: `1px solid ${C.border}`,
  borderRadius: 5,
  padding: '6px 9px',
  color: C.text,
  fontSize: 12,
  outline: 'none',
};
