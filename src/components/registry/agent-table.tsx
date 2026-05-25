'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Layers, Search } from 'lucide-react';
import { Card, SectionTitle } from '@/components/shared/card';
import { AidCell } from '@/components/shared/aid-cell';
import { BoundaryBadge } from '@/components/shared/boundary-badge';
import { CapabilityBadge } from '@/components/shared/capability-badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { TimeAgo } from '@/components/shared/time-ago';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { useRegistry } from '@/hooks/use-registry';
import { C } from '@/lib/colors';
import type { Agent } from '@/lib/types/cp';

const STATUS_FILTERS = ['all', 'active', 'expired', 'deregistered'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

interface AgentRow extends Agent {
  boundary?: string;
}

export function AgentTable() {
  const { data, isLoading, error } = useRegistry();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const agents = (data?.agents ?? []) as AgentRow[];
  const filtered = agents.filter((a) => {
    if (status !== 'all' && a.status !== status) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !a.displayName.toLowerCase().includes(q) &&
        !a.aid.toLowerCase().includes(q) &&
        !a.offeredCaps.some((c) => c.toLowerCase().includes(q))
      ) {
        return false;
      }
    }
    return true;
  });

  const activeCount = agents.filter((a) => a.status === 'active').length;

  return (
    <div className="anim-in">
      <SectionTitle
        icon={Layers}
        title="Registry"
        sub={`${activeCount} active agent${activeCount === 1 ? '' : 's'}`}
        right={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                gap: 2,
                background: C.bg3,
                padding: 3,
                borderRadius: 6,
                border: `1px solid ${C.border}`,
              }}
            >
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    background: status === s ? C.teal : 'transparent',
                    color: status === s ? '#fff' : C.textDim,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <Search
                size={13}
                color={C.textMuted}
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agents or capabilities…"
                style={{
                  background: C.bg2,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: '7px 12px 7px 30px',
                  color: C.text,
                  fontSize: 12,
                  outline: 'none',
                  width: 260,
                }}
              />
            </div>
          </div>
        }
      />

      <Card>
        {isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : error ? (
          <EmptyState title="Couldn't reach the registry" description="Check the Control Plane URL in Config." />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No agents match"
            description={search ? 'Try a different search term or status filter.' : 'No agents are registered yet.'}
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['AID', 'Name', 'Capabilities', 'Status', 'Boundary', 'Last seen'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 16px',
                      textAlign: 'left',
                      fontSize: 11,
                      color: C.textMuted,
                      fontWeight: 500,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.aid}
                  style={{ borderBottom: `1px solid ${C.border}30`, cursor: 'pointer', transition: 'background .1s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.bg3)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <Link href={`/registry/${encodeURIComponent(a.aid)}`}>
                      <AidCell aid={a.aid} />
                    </Link>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: C.text, fontWeight: 500 }}>
                    <Link
                      href={`/registry/${encodeURIComponent(a.aid)}`}
                      style={{ color: 'inherit' }}
                    >
                      {a.displayName}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {a.offeredCaps.map((c) => (
                        <CapabilityBadge key={c} cap={c} />
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <StatusBadge status={a.status} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <BoundaryBadge boundary={a.boundary} />
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
    </div>
  );
}
