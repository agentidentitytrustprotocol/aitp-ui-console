'use client';

import Link from 'next/link';
import { Card } from '@/components/shared/card';
import { AidCell } from '@/components/shared/aid-cell';
import { CapabilityBadge } from '@/components/shared/capability-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { TimeAgo } from '@/components/shared/time-ago';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { useAgentMetrics } from '@/hooks/use-dashboard';
import { useRegistry } from '@/hooks/use-registry';
import { C } from '@/lib/colors';
import { Users } from 'lucide-react';

export function AgentActivity() {
  const metrics = useAgentMetrics();
  const registry = useRegistry();

  if (metrics.isLoading) {
    return (
      <Card>
        <Header />
        <LoadingSkeleton rows={4} />
      </Card>
    );
  }

  const agents = metrics.data?.agents ?? [];
  const capsByAid = new Map((registry.data?.agents ?? []).map((a) => [a.aid, a.offeredCaps]));

  return (
    <Card>
      <Header />
      {agents.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No agent activity yet"
          description="Agents will appear here as they handshake and invoke capabilities."
        />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Agent', 'Capabilities', 'Sessions (init)', 'Sessions (resp)', 'Invocations', 'Last seen'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  style={{
                    padding: '10px 16px',
                    textAlign: 'left',
                    fontSize: 11,
                    color: C.textMuted,
                    fontWeight: 500,
                    letterSpacing: '0.04em',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.aid} style={{ borderBottom: `1px solid ${C.border}30` }}>
                <td style={{ padding: '12px 16px' }}>
                  <Link href={`/registry/${encodeURIComponent(a.aid)}`} style={{ display: 'block' }}>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{a.displayName}</div>
                    <AidCell aid={a.aid} />
                  </Link>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(capsByAid.get(a.aid) ?? []).slice(0, 3).map((c) => (
                      <CapabilityBadge key={c} cap={c} />
                    ))}
                  </div>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span className="mono" style={{ fontSize: 13, color: C.text }}>
                    {a.handshakesAsInitiator}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span className="mono" style={{ fontSize: 13, color: C.text }}>
                    {a.handshakesAsResponder}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span className="mono" style={{ fontSize: 13, color: C.amber }}>
                    {a.capabilityInvocations}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: C.textDim }}>
                  <TimeAgo ts={a.lastSeenAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function Header() {
  return (
    <div
      style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${C.border}`,
        fontSize: 13,
        fontWeight: 500,
        color: C.text,
      }}
    >
      Agent activity
    </div>
  );
}
