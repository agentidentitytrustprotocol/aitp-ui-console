'use client';

import { useState } from 'react';
import { Ban } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSkeleton, InlineSpinner } from '@/components/shared/loading-skeleton';
import { TimeAgo } from '@/components/shared/time-ago';
import { useCreateRevocation, useRevocationList } from '@/hooks/use-trust';
import { C } from '@/lib/colors';

export function RevocationView() {
  const { data, isLoading, error } = useRevocationList();
  const create = useCreateRevocation();
  const [jti, setJti] = useState('');
  const [reason, setReason] = useState('');
  const [confirmStep, setConfirmStep] = useState(false);

  function reset() {
    setJti('');
    setReason('');
    setConfirmStep(false);
  }

  function startConfirm(e: React.FormEvent) {
    e.preventDefault();
    setConfirmStep(true);
  }

  function actuallyRevoke() {
    create.mutate(
      { jti, reason: reason || undefined },
      {
        onSuccess: reset,
      },
    );
  }

  const entries = data?.entries ?? [];

  return (
    <Card style={{ padding: 0 }}>
      <div
        style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${C.border}`,
          fontSize: 13,
          fontWeight: 600,
          color: C.text,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Ban size={14} color={C.red} /> Revocation list
        <span className="mono" style={{ fontSize: 11, color: C.textMuted, marginLeft: 'auto' }}>
          {entries.length}
        </span>
      </div>

      <form
        onSubmit={startConfirm}
        style={{
          padding: 14,
          background: C.bg3,
          borderBottom: `1px solid ${C.border}`,
          display: 'grid',
          gridTemplateColumns: '2fr 2fr auto',
          gap: 8,
          alignItems: 'end',
        }}
      >
        <Field label="JTI to revoke">
          <input
            value={jti}
            onChange={(e) => setJti(e.target.value)}
            required
            placeholder="UUID of a TCT or delegation"
            style={{ ...inputStyle, fontFamily: 'JetBrains Mono' }}
          />
        </Field>
        <Field label="Reason (optional, ≤500 chars)">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="key-compromise / unenrolled / …"
            style={inputStyle}
          />
        </Field>
        <button
          type="submit"
          disabled={!jti || create.isPending}
          style={{
            background: C.red,
            border: 'none',
            color: '#fff',
            fontSize: 12,
            padding: '8px 14px',
            borderRadius: 5,
            cursor: jti ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            opacity: jti ? 1 : 0.5,
          }}
        >
          <Ban size={12} /> Revoke
        </button>
      </form>

      {confirmStep && (
        <div
          style={{
            padding: 14,
            background: C.red + '12',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div style={{ fontSize: 12, color: C.red, fontWeight: 600, marginBottom: 6 }}>
            Confirm revocation
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 10, lineHeight: 1.6 }}>
            Revoking <span className="mono" style={{ color: C.red }}>{jti}</span> propagates to any
            downstream delegation that includes this jti. The operation is logged in the admin
            audit trail and cannot be reversed.
          </div>
          {create.error && (
            <div
              style={{
                background: C.red + '20',
                border: `1px solid ${C.red}40`,
                color: C.red,
                padding: 8,
                borderRadius: 4,
                fontSize: 11,
                marginBottom: 10,
              }}
            >
              {String(create.error)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setConfirmStep(false)}
              style={{
                background: 'none',
                border: `1px solid ${C.border}`,
                borderRadius: 5,
                padding: '6px 12px',
                color: C.textDim,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={actuallyRevoke}
              disabled={create.isPending}
              style={{
                background: C.red,
                border: 'none',
                borderRadius: 5,
                padding: '6px 12px',
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {create.isPending && <InlineSpinner color="#fff" />}
              Yes, revoke
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div style={{ padding: 20 }}>
          <LoadingSkeleton rows={3} />
        </div>
      ) : error ? (
        <EmptyState title="Couldn't load revocation list" description="Check Control Plane connection." />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No revocations"
          description="An empty revocation list is a meaningful assertion under RFC-AITP-0008."
        />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['JTI', 'Reason', 'Revoked at'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '8px 14px',
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
            {entries.map((e) => (
              <tr key={e.jti} style={{ borderBottom: `1px solid ${C.border}20` }}>
                <td style={{ padding: '10px 14px' }}>
                  <span className="mono" style={{ fontSize: 10, color: C.red }} title={e.jti}>
                    {e.jti}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: C.textDim }}>
                  {e.reason ?? '—'}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: C.textDim }}>
                  <TimeAgo ts={e.revokedAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: C.bg2,
  border: `1px solid ${C.border}`,
  borderRadius: 5,
  padding: '6px 9px',
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
