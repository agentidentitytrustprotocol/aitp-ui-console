'use client';

import { Cpu } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { AidCell } from '@/components/shared/aid-cell';
import { usePlaygroundAgents } from '@/hooks/use-playground-meta';
import { C } from '@/lib/colors';

export function ProcessList() {
  const { data, isLoading, error } = usePlaygroundAgents();
  const agents = data?.agents ?? [];

  return (
    <Card style={{ padding: 20 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: C.text,
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Cpu size={14} color={C.teal} /> Running playground processes
        <span className="mono" style={{ fontSize: 11, color: C.textMuted, marginLeft: 'auto' }}>
          {agents.length}
        </span>
      </div>
      {isLoading ? (
        <LoadingSkeleton rows={2} />
      ) : error ? (
        <EmptyState title="Process list unavailable" description="Playground /agents call failed." />
      ) : agents.length === 0 ? (
        <EmptyState title="No agents running" description="The playground has no live agent processes." />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Agent', 'Run', 'AID', 'Port', 'PID', 'Status', 'Exit'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  style={{
                    padding: '6px 10px',
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
            {agents.map((a) => (
              <tr key={`${a.run_id}:${a.agent_id}`} style={{ borderBottom: `1px solid ${C.border}20` }}>
                <td style={{ padding: '7px 10px' }}>
                  <span className="mono" style={{ fontSize: 11, color: C.text }}>
                    {a.agent_id}
                  </span>
                </td>
                <td style={{ padding: '7px 10px' }}>
                  <span className="mono" style={{ fontSize: 11, color: C.teal }}>
                    {a.run_id.slice(0, 10)}
                  </span>
                </td>
                <td style={{ padding: '7px 10px' }}>
                  <AidCell aid={a.aid || null} />
                </td>
                <td style={{ padding: '7px 10px' }}>
                  <span className="mono" style={{ fontSize: 11, color: C.textDim }}>
                    {a.port}
                  </span>
                </td>
                <td style={{ padding: '7px 10px' }}>
                  <span className="mono" style={{ fontSize: 11, color: C.textMuted }}>
                    {a.pid ?? '—'}
                  </span>
                </td>
                <td style={{ padding: '7px 10px', fontSize: 11, color: C.textDim }}>
                  {a.status}
                </td>
                <td style={{ padding: '7px 10px' }}>
                  <span className="mono" style={{ fontSize: 11, color: C.textMuted }}>
                    {a.exit_code ?? '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
