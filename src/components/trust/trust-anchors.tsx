'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { TimeAgo } from '@/components/shared/time-ago';
import { InlineSpinner } from '@/components/shared/loading-skeleton';
import { useCreateTrustAnchor, useTrustAnchors } from '@/hooks/use-trust';
import { C } from '@/lib/colors';

export function TrustAnchorsView() {
  const { data, isLoading, error } = useTrustAnchors();
  const create = useCreateTrustAnchor();
  const [showForm, setShowForm] = useState(false);
  const [namespace, setNamespace] = useState('');
  const [issuerUrl, setIssuerUrl] = useState('');
  const [displayName, setDisplayName] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      { namespace, issuerUrl, displayName: displayName || undefined },
      {
        onSuccess: () => {
          setNamespace('');
          setIssuerUrl('');
          setDisplayName('');
          setShowForm(false);
        },
      },
    );
  }

  const anchors = data?.anchors ?? [];

  return (
    <Card style={{ padding: 0 }}>
      <div
        style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
          OIDC trust anchors
          <span className="mono" style={{ fontSize: 11, color: C.textMuted, marginLeft: 8 }}>
            {anchors.length}
          </span>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          style={{
            background: C.teal,
            border: 'none',
            color: '#fff',
            fontSize: 11,
            padding: '5px 10px',
            borderRadius: 5,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Plus size={12} /> {showForm ? 'Cancel' : 'Add anchor'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          style={{
            padding: 14,
            background: C.bg3,
            borderBottom: `1px solid ${C.border}`,
            display: 'grid',
            gridTemplateColumns: '1fr 2fr 1fr auto',
            gap: 8,
            alignItems: 'end',
          }}
        >
          <Field label="Namespace">
            <input
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              required
              placeholder="acme-corp"
              style={inputStyle}
            />
          </Field>
          <Field label="Issuer URL">
            <input
              type="url"
              value={issuerUrl}
              onChange={(e) => setIssuerUrl(e.target.value)}
              required
              placeholder="https://idp.example.com"
              style={inputStyle}
            />
          </Field>
          <Field label="Display name">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="optional"
              style={inputStyle}
            />
          </Field>
          <button
            type="submit"
            disabled={create.isPending}
            style={{
              background: C.teal,
              border: 'none',
              color: '#fff',
              fontSize: 12,
              padding: '8px 14px',
              borderRadius: 5,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {create.isPending && <InlineSpinner color="#fff" />}
            Add
          </button>
        </form>
      )}

      {isLoading ? (
        <div style={{ padding: 20 }}>
          <LoadingSkeleton rows={3} />
        </div>
      ) : error ? (
        <EmptyState title="Couldn't load trust anchors" description="Check Control Plane connection." />
      ) : anchors.length === 0 ? (
        <EmptyState
          title="No trust anchors registered"
          description="OIDC issuers add here become valid identity sources for AITP enrollment."
        />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Namespace', 'Issuer', 'Display name', 'JWKS cached', 'Added'].map((h) => (
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
            {anchors.map((a) => (
              <tr key={a.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                <td style={{ padding: '10px 14px' }}>
                  <span className="mono" style={{ fontSize: 11, color: C.teal }}>
                    {a.namespace}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: C.textDim }} title={a.issuerUrl}>
                  {a.issuerUrl.replace(/^https?:\/\//, '')}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: C.text }}>
                  {a.displayName ?? '—'}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: C.textDim }}>
                  {a.jwksCachedAt ? <TimeAgo ts={a.jwksCachedAt} /> : 'never'}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: C.textDim }}>
                  <TimeAgo ts={a.createdAt} />
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
