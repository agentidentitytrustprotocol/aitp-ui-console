'use client';

import Link from 'next/link';
import { Card } from '@/components/shared/card';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { StatusBadge } from '@/components/shared/status-badge';
import { BoundaryBadge } from '@/components/shared/boundary-badge';
import { CapabilityBadge } from '@/components/shared/capability-badge';
import { AidCell } from '@/components/shared/aid-cell';
import { useRunCpSessions } from '@/hooks/use-run-extras';
import { C } from '@/lib/colors';
import { shortId } from '@/lib/utils';

export function RunCpSessions({ runId }: { runId: string }) {
  const { data, isLoading, error } = useRunCpSessions(runId);

  if (isLoading) return <LoadingSkeleton rows={4} />;
  if (error) {
    return (
      <Card style={{ padding: 20 }}>
        <EmptyState
          title="CP sessions unavailable"
          description="The playground couldn't fetch handshake sessions for this run."
        />
      </Card>
    );
  }
  if (data && data.cp_enabled === false) {
    return (
      <Card style={{ padding: 20 }}>
        <EmptyState
          title="Control Plane not wired up"
          description="Set CP_BASE_URL on the playground to populate this view."
        />
      </Card>
    );
  }
  const sessions = data?.sessions ?? [];
  if (sessions.length === 0) {
    return (
      <Card style={{ padding: 20 }}>
        <EmptyState
          title="No handshake sessions"
          description="No CP-correlated handshake sessions were recorded for this run."
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
        CP sessions · {sessions.length}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['Session', 'Initiator', 'Responder', 'Status', 'Grants', 'Boundary'].map((h) => (
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
          {sessions.map((s) => (
            <tr key={s.sessionId} style={{ borderBottom: `1px solid ${C.border}20` }}>
              <td style={{ padding: '10px 14px' }}>
                <Link
                  href={`/monitor/sessions/${encodeURIComponent(s.sessionId)}`}
                  className="mono"
                  style={{ fontSize: 10, color: C.teal }}
                >
                  {shortId(s.sessionId, 12)}
                </Link>
              </td>
              <td style={{ padding: '10px 14px' }}>
                <AidCell aid={s.aidA} />
              </td>
              <td style={{ padding: '10px 14px' }}>
                <AidCell aid={s.aidB} />
              </td>
              <td style={{ padding: '10px 14px' }}>
                <StatusBadge status={s.status} />
              </td>
              <td style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {s.grants.map((g) => (
                    <CapabilityBadge key={g} cap={g} />
                  ))}
                </div>
              </td>
              <td style={{ padding: '10px 14px' }}>
                <BoundaryBadge boundary={s.boundary} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
