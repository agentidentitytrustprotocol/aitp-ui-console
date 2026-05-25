'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { AidCell } from '@/components/shared/aid-cell';
import { BoundaryBadge } from '@/components/shared/boundary-badge';
import { CapabilityBadge } from '@/components/shared/capability-badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { TimeAgo } from '@/components/shared/time-ago';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { ManifestViewer } from './manifest-viewer';
import { useAgent } from '@/hooks/use-registry';
import { useSessions } from '@/hooks/use-sessions';
import { C } from '@/lib/colors';
import { shortId } from '@/lib/utils';

export function AgentDetail({ aid }: { aid: string }) {
  const { data: agent, isLoading, error } = useAgent(aid);
  const sessions = useSessions({ aid, limit: 10 });

  return (
    <div className="anim-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Link
          href="/registry"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: C.textDim,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
          }}
        >
          <ArrowLeft size={14} /> Registry
        </Link>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : error || !agent ? (
        <Card style={{ padding: 20 }}>
          <EmptyState title="Agent not found" description={aid} />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background:
                      agent.status === 'active'
                        ? C.green
                        : agent.status === 'expired'
                        ? C.yellow
                        : C.textMuted,
                  }}
                />
                <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
                  {agent.displayName}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>AID</div>
                <div
                  className="mono"
                  style={{ fontSize: 11, color: C.tealBright, wordBreak: 'break-all', lineHeight: 1.5 }}
                >
                  {agent.aid}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Row label="Status" value={<StatusBadge status={agent.status} />} />
                <Row label="Registered" value={<TimeAgo ts={agent.registeredAt} />} />
                <Row label="Last seen" value={<TimeAgo ts={agent.lastSeenAt} />} />
                <Row
                  label="Endpoint"
                  value={
                    <a
                      href={agent.handshakeEndpoint}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: C.blue, fontSize: 11 }}
                    >
                      {agent.handshakeEndpoint.replace(/^https?:\/\//, '')}
                    </a>
                  }
                />
              </div>
            </Card>

            <Card style={{ padding: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  color: C.textMuted,
                  marginBottom: 10,
                  letterSpacing: '0.06em',
                }}
              >
                CAPABILITIES
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {agent.offeredCaps.length === 0 ? (
                  <span style={{ fontSize: 11, color: C.textMuted }}>none</span>
                ) : (
                  agent.offeredCaps.map((c) => <CapabilityBadge key={c} cap={c} />)
                )}
              </div>
            </Card>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ManifestViewer aid={agent.aid} />

            <Card>
              <div
                style={{
                  padding: '14px 18px',
                  borderBottom: `1px solid ${C.border}`,
                  fontSize: 13,
                  fontWeight: 500,
                  color: C.text,
                }}
              >
                Recent sessions
              </div>
              {sessions.isLoading ? (
                <LoadingSkeleton rows={3} />
              ) : (sessions.data?.sessions ?? []).length === 0 ? (
                <EmptyState title="No sessions yet" />
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {['Session', 'Peer', 'Role', 'Status', 'Grants', 'Boundary'].map((h) => (
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
                    {(sessions.data?.sessions ?? []).map((s) => {
                      const isInitiator = s.aidA === agent.aid;
                      const peer = isInitiator ? s.aidB : s.aidA;
                      return (
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
                            <AidCell aid={peer} />
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 11, color: C.textDim }}>
                            {isInitiator ? 'initiator' : 'responder'}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <StatusBadge status={s.status} />
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', gap: 3 }}>
                              {s.grants.map((g) => (
                                <CapabilityBadge key={g} cap={g} />
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <BoundaryBadge boundary={s.boundary} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: C.textDim }}>{label}</span>
      <span style={{ fontSize: 11, color: C.text, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
