'use client';

import { Card } from '@/components/shared/card';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { StatusBadge } from '@/components/shared/status-badge';
import { useRunDeliveries } from '@/hooks/use-run-extras';
import { C } from '@/lib/colors';
import { shortId } from '@/lib/utils';

export function RunDeliveries({ runId }: { runId: string }) {
  const { data, isLoading, error } = useRunDeliveries(runId);

  if (isLoading) return <LoadingSkeleton rows={4} />;
  if (error) {
    return (
      <Card style={{ padding: 20 }}>
        <EmptyState
          title="Deliveries unavailable"
          description="The playground couldn't fetch webhook deliveries for this run."
        />
      </Card>
    );
  }
  const deliveries = data?.deliveries ?? [];
  if (deliveries.length === 0) {
    return (
      <Card style={{ padding: 20 }}>
        <EmptyState
          title="No webhook deliveries"
          description="No CP webhook deliveries were triggered by this run."
        />
      </Card>
    );
  }

  return (
    <Card style={{ overflow: 'hidden' }}>
      <div
        style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${C.border}`,
          fontSize: 13,
          fontWeight: 600,
          color: C.text,
        }}
      >
        Webhook deliveries · {deliveries.length}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['Event', 'URL', 'Status', 'Attempts', 'Signature', 'Delivered'].map((h) => (
              <th
                key={h}
                style={{
                  padding: '8px 14px',
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
          {deliveries.map((d) => (
            <tr key={d.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
              <td style={{ padding: '10px 14px' }}>
                <span className="mono" style={{ fontSize: 11, color: C.amber }}>
                  {d.eventType}
                </span>
              </td>
              <td
                style={{
                  padding: '10px 14px',
                  fontSize: 11,
                  color: C.textDim,
                  maxWidth: 360,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={d.url}
              >
                {d.url}
              </td>
              <td style={{ padding: '10px 14px' }}>
                <StatusBadge status={d.status} />
                {d.responseStatus !== undefined && d.responseStatus !== null && (
                  <span
                    className="mono"
                    style={{ fontSize: 10, color: C.textMuted, marginLeft: 6 }}
                  >
                    {d.responseStatus}
                  </span>
                )}
              </td>
              <td style={{ padding: '10px 14px', fontSize: 11, color: C.textDim }}>{d.attempts}</td>
              <td style={{ padding: '10px 14px' }}>
                {d.signature ? (
                  <span className="mono" style={{ fontSize: 10, color: C.teal }} title={d.signature}>
                    sha256={shortId(d.signature.replace(/^sha256=/, ''), 12)}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: C.textMuted }}>—</span>
                )}
              </td>
              <td
                style={{
                  padding: '10px 14px',
                  fontSize: 11,
                  color: C.textDim,
                }}
              >
                {d.deliveredAt ? new Date(d.deliveredAt).toLocaleTimeString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
