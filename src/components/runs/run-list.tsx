'use client';

import Link from 'next/link';
import { ArrowRight, List } from 'lucide-react';
import { Card, SectionTitle } from '@/components/shared/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { useRuns } from '@/hooks/use-runs';
import { C } from '@/lib/colors';
import { shortId } from '@/lib/utils';

function formatCreatedAt(ts: number | null): string {
  if (!ts) return '—';
  const ms = ts < 1e12 ? ts * 1000 : ts;
  return new Date(ms).toLocaleString();
}

export function RunList() {
  const { data, isLoading, error } = useRuns();
  const runs = data?.runs ?? [];

  const active = runs.filter((r) => r.status === 'pending' || r.status === 'running').length;

  return (
    <div className="anim-in">
      <SectionTitle
        icon={List}
        title="Runs"
        sub={
          runs.length === 0
            ? 'No runs yet'
            : `${runs.length} run${runs.length === 1 ? '' : 's'} · ${active} in flight`
        }
      />
      <Card>
        {isLoading ? (
          <LoadingSkeleton rows={5} />
        ) : error ? (
          <EmptyState title="Couldn't load runs" description="Check the Playground connection in Config." />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={List}
            title="No runs yet"
            description="Trigger a scenario from the Scenarios tab to see runs here."
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Run ID', 'Scenario', 'Status', 'Events', 'Started', ''].map((h) => (
                  <th
                    key={h}
                    scope="col"
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
              {runs.map((r) => (
                <tr
                  key={r.run_id}
                  style={{ borderBottom: `1px solid ${C.border}30`, transition: 'background .1s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.bg3)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <Link
                      href={`/runs/${encodeURIComponent(r.run_id)}`}
                      className="mono"
                      style={{ fontSize: 12, color: C.teal }}
                    >
                      {shortId(r.run_id, 12)}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: C.text }}>
                    {r.scenario_ref ?? '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <StatusBadge status={r.status} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span className="mono" style={{ fontSize: 12, color: C.textDim }}>
                      {r.event_count}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: C.textDim }}>
                    {formatCreatedAt(r.created_at)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Link href={`/runs/${encodeURIComponent(r.run_id)}`}>
                      <ArrowRight size={14} color={C.textMuted} />
                    </Link>
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
