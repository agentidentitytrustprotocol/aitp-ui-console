'use client';

import { BookOpen } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { useRunNarrate } from '@/hooks/use-run-extras';
import { C } from '@/lib/colors';

function formatOffset(ms: number): string {
  if (ms < 1_000) return `+${ms}ms`;
  if (ms < 60_000) return `+${(ms / 1_000).toFixed(1)}s`;
  return `+${(ms / 60_000).toFixed(1)}m`;
}

export function RunNarrate({ runId }: { runId: string }) {
  const { data, isLoading, error } = useRunNarrate(runId);

  if (isLoading) return <LoadingSkeleton rows={5} />;
  if (error) {
    return (
      <Card style={{ padding: 20 }}>
        <EmptyState
          title="Narration unavailable"
          description="The playground couldn't render a narrated trace for this run."
        />
      </Card>
    );
  }
  const entries = data?.entries ?? [];
  if (entries.length === 0) {
    return (
      <Card style={{ padding: 20 }}>
        <EmptyState
          title="No narration yet"
          description="Narration entries appear after the run produces its first events."
        />
      </Card>
    );
  }

  return (
    <Card style={{ padding: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          color: C.text,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <BookOpen size={14} color={C.teal} /> Narrated trace
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {entries.map((e, i) => (
          <div
            key={`${e.at}-${i}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr',
              gap: 10,
              padding: '10px 0',
              borderBottom: i === entries.length - 1 ? 'none' : `1px solid ${C.border}30`,
            }}
          >
            <div
              className="mono"
              style={{ fontSize: 10, color: C.textMuted, paddingTop: 3, whiteSpace: 'nowrap' }}
            >
              {formatOffset(e.at)}
            </div>
            <div>
              <div style={{ fontSize: 13, color: C.text, marginBottom: 4, lineHeight: 1.45 }}>
                {e.headline}
              </div>
              {e.detail && (
                <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.55 }}>{e.detail}</div>
              )}
              {e.refs?.step_id && (
                <div
                  className="mono"
                  style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}
                >
                  step: {e.refs.step_id}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
