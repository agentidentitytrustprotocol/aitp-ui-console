'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { AidCell } from '@/components/shared/aid-cell';
import { BoundaryBadge } from '@/components/shared/boundary-badge';
import { TimeAgo } from '@/components/shared/time-ago';
import { EmptyState } from '@/components/shared/empty-state';
import { useSessions } from '@/hooks/use-sessions';
import { C } from '@/lib/colors';
import { shortId } from '@/lib/utils';

export function ActiveSessions() {
  const { data, isLoading } = useSessions({ status: 'started', limit: 10 });
  const sessions = data?.sessions ?? [];

  return (
    <Card style={{ padding: 14, maxHeight: 360, overflow: 'auto' }}>
      <div
        style={{
          fontSize: 11,
          color: C.textMuted,
          marginBottom: 12,
          letterSpacing: '0.06em',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>ACTIVE SESSIONS</span>
        <span className="mono" style={{ color: C.blue }}>{sessions.length}</span>
      </div>
      {isLoading ? (
        <div style={{ fontSize: 11, color: C.textMuted }}>Loading…</div>
      ) : sessions.length === 0 ? (
        <EmptyState title="No active sessions" description="Handshakes in flight will appear here." />
      ) : (
        sessions.map((s) => (
          <Link
            href={`/monitor/sessions/${encodeURIComponent(s.sessionId)}`}
            key={s.sessionId}
            style={{ display: 'block', padding: '10px 12px', background: C.bg3, borderRadius: 6, marginBottom: 8 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="mono" style={{ fontSize: 10, color: C.teal }}>
                {shortId(s.sessionId, 18)}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.blue }} className="pulse" />
                <span style={{ fontSize: 10, color: C.blue }}>live</span>
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.textDim, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <AidCell aid={s.aidA} /> <ArrowRight size={10} color={C.textMuted} /> <AidCell aid={s.aidB} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <BoundaryBadge boundary={s.boundary} />
              <span style={{ fontSize: 10, color: C.textMuted }}>
                <TimeAgo ts={s.startedAt} />
              </span>
            </div>
          </Link>
        ))
      )}
    </Card>
  );
}
