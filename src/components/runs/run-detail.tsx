'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/shared/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { AgentStatusGrid } from './agent-status-grid';
import { RunTimeline } from './run-timeline';
import { RunSummary } from './run-summary';
import { useRun } from '@/hooks/use-run';
import { useRunEvents } from '@/hooks/use-run-events';
import { postJSON } from '@/lib/api/client';
import { C } from '@/lib/colors';
import type { RunEvent } from '@/lib/types/playground';

const TERMINAL = new Set(['success', 'failed', 'cancelled', 'complete']);

export function RunDetail({ runId }: { runId: string }) {
  const qc = useQueryClient();
  const run = useRun(runId, { refetchInterval: 5_000 });

  const active = run.data ? !TERMINAL.has(run.data.status) : true;
  const live = useRunEvents(active ? runId : null);

  // Combine persisted events from /runs/:id with live SSE events. SSE is the
  // source of truth while the run is active; once terminal, we trust the
  // canonical event list returned by GET /runs/:id.
  const events: RunEvent[] = useMemo(() => {
    if (!active && run.data?.events) return run.data.events;
    if (live.events.length > 0) return live.events;
    return run.data?.events ?? [];
  }, [active, live.events, run.data?.events]);

  const cancel = useMutation({
    mutationFn: () => postJSON(`/api/playground/runs/${encodeURIComponent(runId)}/cancel`, {}),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['run', runId] });
      qc.invalidateQueries({ queryKey: ['runs'] });
    },
  });

  return (
    <div className="anim-in">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <Link
          href="/runs"
          style={{
            color: C.textDim,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
          }}
        >
          <ArrowLeft size={14} /> All runs
        </Link>
        <span className="mono" style={{ fontSize: 12, color: C.teal }}>
          {runId}
        </span>
        {run.data && <StatusBadge status={run.data.status} />}
        {run.data?.scenario_ref && (
          <span style={{ fontSize: 12, color: C.textDim }} className="mono">
            {run.data.scenario_ref}
          </span>
        )}
        {active && (
          <button
            onClick={() => cancel.mutate()}
            disabled={cancel.isPending}
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 6,
              border: `1px solid ${C.red}50`,
              background: C.red + '15',
              color: C.red,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <X size={12} /> Cancel
          </button>
        )}
      </div>

      {run.isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : run.error || !run.data ? (
        <Card style={{ padding: 20 }}>
          <EmptyState title="Run not found" description={runId} />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <AgentStatusGrid events={events} />
            <RunSummary run={run.data} events={events} />
            {run.data.error && (
              <Card style={{ padding: 14, borderLeft: `3px solid ${C.red}` }}>
                <div style={{ fontSize: 11, color: C.red, fontWeight: 600, marginBottom: 6 }}>ERROR</div>
                <div style={{ fontSize: 11, color: C.textDim, wordBreak: 'break-word' }}>
                  {run.data.error}
                </div>
              </Card>
            )}
          </div>
          <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', minHeight: 320 }}>
            <RunTimeline events={events} active={active} connected={live.connected} />
          </Card>
        </div>
      )}
    </div>
  );
}
