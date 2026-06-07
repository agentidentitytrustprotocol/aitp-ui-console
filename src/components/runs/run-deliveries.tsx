'use client';

import { Card } from '@/components/shared/card';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { useRunDeliveries } from '@/hooks/use-run-extras';
import { C } from '@/lib/colors';

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

export function RunDeliveries({ runId }: { runId: string }) {
  const { data, isLoading, error } = useRunDeliveries(runId);

  if (isLoading) return <LoadingSkeleton rows={4} />;
  if (error) {
    return (
      <Card style={{ padding: 20 }}>
        <EmptyState
          title="Deliveries unavailable"
          description="The playground couldn't fetch CP webhook deliveries for this run."
        />
      </Card>
    );
  }

  const deliveries = data?.deliveries ?? [];
  const subscribed = data?.subscribed === true;
  const webhookUrl = asString(data?.webhook?.url);

  if (!subscribed && deliveries.length === 0) {
    return (
      <Card style={{ padding: 20 }}>
        <EmptyState
          title="No CP webhook subscription"
          description="This run is not subscribed to CP webhook deliveries."
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
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span>CP deliveries · {deliveries.length}</span>
        {webhookUrl && (
          <span
            className="mono"
            style={{
              fontSize: 11,
              color: C.textDim,
              marginLeft: 'auto',
              maxWidth: 360,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={webhookUrl}
          >
            → {webhookUrl}
          </span>
        )}
      </div>
      {deliveries.length === 0 ? (
        <EmptyState
          title="No deliveries yet"
          description="CP fans audit events out via subscription; deliveries appear here as they arrive."
        />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['When', 'Event type', 'JTI', 'Step', 'Detail'].map((h) => (
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
            {deliveries.map((d, i) => {
              const ts = asNumber(d.ts);
              const eventType =
                asString(d.event_type) ?? asString(d.type) ?? '—';
              const jti = asString(d.jti);
              const stepId = asString(d.step_id);
              return (
                <tr
                  key={asString(d.id) ?? `${eventType}-${ts ?? i}`}
                  style={{ borderBottom: `1px solid ${C.border}20` }}
                >
                  <td style={{ padding: '10px 14px' }}>
                    <span className="mono" style={{ fontSize: 11, color: C.textMuted }}>
                      {ts !== null ? `+${(ts / 1000).toFixed(1)}s` : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span className="mono" style={{ fontSize: 11, color: C.amber }}>
                      {eventType}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {jti ? (
                      <span className="mono" style={{ fontSize: 10, color: C.teal }} title={jti}>
                        {jti.slice(0, 14)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: C.textMuted }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: C.textDim }}>
                    {stepId ?? '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      className="mono"
                      style={{
                        fontSize: 10,
                        color: C.textMuted,
                        maxWidth: 360,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'inline-block',
                      }}
                      title={JSON.stringify(d)}
                    >
                      {JSON.stringify(d).slice(0, 60)}…
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
