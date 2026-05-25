'use client';

import { Card } from '@/components/shared/card';
import { CapabilityBadge } from '@/components/shared/capability-badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { C } from '@/lib/colors';
import type { RunEvent, RunResponse } from '@/lib/types/playground';

export function RunSummary({ run, events }: { run: RunResponse; events: RunEvent[] }) {
  const handshakes = events.filter((e) => e.type === 'trust.established').length;
  const llmCalls = events.filter((e) => e.type === 'llm.complete' || e.type === 'llm.started').length;
  const duration = events.length > 0 ? events[events.length - 1].ts / 1000 : 0;
  const grants = Array.from(
    new Set(events.filter((e) => e.type === 'trust.established').flatMap((e) => e.grants ?? [])),
  );

  return (
    <Card style={{ padding: 14 }}>
      <div
        style={{ fontSize: 11, color: C.textMuted, marginBottom: 12, letterSpacing: '0.06em' }}
      >
        SUMMARY
      </div>
      <Row label="Status" value={<StatusBadge status={run.status} />} />
      <Row label="Duration" value={`${duration.toFixed(1)}s`} />
      <Row label="Handshakes" value={String(handshakes)} />
      <Row label="LLM calls" value={String(Math.floor(llmCalls / 2))} />
      <Row label="Events" value={String(events.length)} />
      {grants.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>Grants established</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {grants.map((g) => (
              <CapabilityBadge key={g} cap={g} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: C.textDim }}>{label}</span>
      <span style={{ fontSize: 11, color: C.text }}>{value}</span>
    </div>
  );
}
