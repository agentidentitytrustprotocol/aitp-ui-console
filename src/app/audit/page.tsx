'use client';

// useSearchParams (via useUrlState) requires dynamic rendering; the page
// is interactive client-side anyway, so this is the right default.
export const dynamic = 'force-dynamic';

import { Download, ScrollText } from 'lucide-react';
import { Card, SectionTitle } from '@/components/shared/card';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { AuditTable } from '@/components/audit/audit-table';
import { useToast } from '@/components/shared/toast';
import { useAudit } from '@/hooks/use-audit';
import { useUrlInt, useUrlState } from '@/hooks/use-url-state';
import { C } from '@/lib/colors';
import { downloadText, toCsv } from '@/lib/export';

const LIMIT_OPTIONS = [50, 100, 250, 500] as const;

export default function AuditPage() {
  const toast = useToast();
  const [actor, setActor] = useUrlState('actor');
  const [action, setAction] = useUrlState('action');
  const [limit, setLimit] = useUrlInt('limit', 100, LIMIT_OPTIONS);

  const { data, isLoading, error } = useAudit({ actor, action, limit });
  const events = data?.events ?? [];

  function exportRows(format: 'csv' | 'ndjson') {
    if (events.length === 0) {
      toast.info('Nothing to export', 'The current filter returned no rows.');
      return;
    }
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    if (format === 'csv') {
      const csv = toCsv(
        events.map((e) => ({
          ts: e.ts,
          type: e.type,
          aidA: e.aidA ?? '',
          aidB: e.aidB ?? '',
          sessionId: e.sessionId ?? '',
          runId: e.runId ?? '',
          grants: (e.grants ?? []).join('|'),
          payload: e.payload,
        })),
        [
          { key: 'ts', label: 'timestamp' },
          { key: 'type' },
          { key: 'aidA' },
          { key: 'aidB' },
          { key: 'sessionId' },
          { key: 'runId' },
          { key: 'grants' },
          { key: 'payload' },
        ],
      );
      downloadText(`aitp-audit-${stamp}.csv`, csv, 'text/csv');
    } else {
      const nd = events.map((e) => JSON.stringify(e)).join('\n');
      downloadText(`aitp-audit-${stamp}.ndjson`, nd, 'application/x-ndjson');
    }
    toast.success(`Exported ${events.length} ${events.length === 1 ? 'row' : 'rows'}`);
  }

  return (
    <div className="anim-in">
      <SectionTitle
        icon={ScrollText}
        title="Audit"
        sub="Admin and system audit trail from the Control Plane"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => exportRows('csv')}
              disabled={events.length === 0 || isLoading}
              style={exportBtnStyle}
            >
              <Download size={12} /> CSV
            </button>
            <button
              onClick={() => exportRows('ndjson')}
              disabled={events.length === 0 || isLoading}
              style={exportBtnStyle}
            >
              <Download size={12} /> NDJSON
            </button>
          </div>
        }
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
              {LIMIT_OPTIONS.map((n) => (
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

const exportBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: C.bg3,
  border: `1px solid ${C.border}`,
  color: C.textDim,
  fontSize: 11,
  padding: '5px 10px',
  borderRadius: 5,
  cursor: 'pointer',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 10, color: C.textMuted, marginBottom: 4, display: 'block' }}>
        {label}
      </span>
      {children}
    </label>
  );
}
