'use client';

import { Card } from '@/components/shared/card';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { AuditTable } from '@/components/audit/audit-table';
import { useRunCpAudit } from '@/hooks/use-run-extras';
import { C } from '@/lib/colors';

export function RunCpAudit({ runId }: { runId: string }) {
  const { data, isLoading, error } = useRunCpAudit(runId);

  if (isLoading) return <LoadingSkeleton rows={5} />;
  if (error) {
    return (
      <Card style={{ padding: 20 }}>
        <EmptyState
          title="CP audit unavailable"
          description="The playground couldn't fetch audit entries for this run."
        />
      </Card>
    );
  }
  if (data && data.cp_enabled === false) {
    return (
      <Card style={{ padding: 20 }}>
        <EmptyState
          title="Control Plane not wired up"
          description="The playground has no CP_BASE_URL configured. Set CP_BASE_URL on the playground to populate this view."
        />
      </Card>
    );
  }
  const events = data?.events ?? [];
  if (events.length === 0) {
    return (
      <Card style={{ padding: 20 }}>
        <EmptyState title="No CP audit events" description="No CP audit entries recorded for this run." />
      </Card>
    );
  }

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${C.border}`,
          fontSize: 13,
          fontWeight: 600,
          color: C.text,
        }}
      >
        CP audit · {events.length} {events.length === 1 ? 'entry' : 'entries'}
      </div>
      <AuditTable events={events} />
    </Card>
  );
}
