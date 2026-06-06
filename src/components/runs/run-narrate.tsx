'use client';

import { BookOpen } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { useRunNarrate } from '@/hooks/use-run-extras';
import { C } from '@/lib/colors';

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
  const text = (data ?? '').trim();
  if (!text) {
    return (
      <Card style={{ padding: 20 }}>
        <EmptyState
          title="No narration yet"
          description="Narration is produced after the run emits its first events."
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
          marginBottom: 14,
          color: C.text,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <BookOpen size={14} color={C.teal} /> Narrated trace
      </div>
      <pre
        className="mono"
        style={{
          fontSize: 12,
          lineHeight: 1.65,
          color: C.textDim,
          background: C.bg3,
          padding: 14,
          borderRadius: 6,
          overflowX: 'auto',
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </pre>
    </Card>
  );
}
