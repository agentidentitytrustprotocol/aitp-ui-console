'use client';

import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { Card, SectionTitle } from '@/components/shared/card';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { AuditTable } from '@/components/audit/audit-table';
import { useAudit } from '@/hooks/use-audit';
import { C } from '@/lib/colors';

export default function AuditPage() {
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [limit, setLimit] = useState(100);

  const { data, isLoading, error } = useAudit({ actor, action, limit });
  const events = data?.events ?? [];

  return (
    <div className="anim-in">
      <SectionTitle
        icon={ScrollText}
        title="Audit"
        sub="Admin and system audit trail from the Control Plane"
      />

      <Card style={{ padding: 14, marginBottom: 14 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 100px',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <Field label="Actor">
            <input
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder="aid or admin user"
              style={inputStyle}
            />
          </Field>
          <Field label="Action">
            <input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="agent.register, webhook.created, revocation.added…"
              style={inputStyle}
            />
          </Field>
          <Field label="Limit">
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              style={inputStyle}
            >
              {[50, 100, 250, 500].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <LoadingSkeleton rows={6} />
          </div>
        ) : error ? (
          <EmptyState title="Couldn't load audit log" description="Check the Control Plane connection." />
        ) : events.length === 0 ? (
          <EmptyState
            title="No audit entries"
            description="No matching entries. Try widening filters or increasing the limit."
          />
        ) : (
          <AuditTable events={events} />
        )}
      </Card>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: C.bg3,
  border: `1px solid ${C.border}`,
  borderRadius: 5,
  padding: '7px 10px',
  color: C.text,
  fontSize: 12,
  outline: 'none',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
