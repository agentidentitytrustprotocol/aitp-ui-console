'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { LoadingSkeleton, InlineSpinner } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { TimeAgo } from '@/components/shared/time-ago';
import {
  useCreateTrustAnchor,
  useDeleteTrustAnchor,
  useTrustAnchors,
} from '@/hooks/use-trust';
import { C } from '@/lib/colors';

export function TrustAnchorsView() {
  const { data, isLoading, error } = useTrustAnchors();
  const create = useCreateTrustAnchor();
  const remove = useDeleteTrustAnchor();
  const [showForm, setShowForm] = useState(false);
  const [namespace, setNamespace] = useState('');
  const [issuerUrl, setIssuerUrl] = useState('');
  const [jwksUrl, setJwksUrl] = useState('');
  const [label, setLabel] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      {
        namespace: namespace || undefined,
        issuerUrl,
        jwksUrl: jwksUrl || undefined,
        label: label || undefined,
      },
      {
        onSuccess: () => {
          setNamespace('');
          setIssuerUrl('');
          setJwksUrl('');
          setLabel('');
          setShowForm(false);
        },
      },
    );
  }

  const anchors = data?.trustAnchors ?? [];

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
              placeholder="default"
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
          <Field label="Label">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
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
          <div style={{ gridColumn: '1 / span 4' }}>
            <Field label="JWKS URL (optional — pins the JWKS endpoint)">
              <input
                type="url"
                value={jwksUrl}
                onChange={(e) => setJwksUrl(e.target.value)}
                placeholder="https://idp.example.com/.well-known/jwks.json"
                style={inputStyle}
              />
            </Field>
          </div>
          {create.error && (
            <div
              style={{
                gridColumn: '1 / span 4',
                background: C.red + '15',
                border: `1px solid ${C.red}40`,
                color: C.red,
                padding: 8,
                borderRadius: 4,
                fontSize: 11,
              }}
            >
              {String(create.error)}
            </div>
          )}
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
          description="OIDC issuers added here become valid identity sources for AITP enrollment."
        />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Namespace', 'Issuer', 'Label', 'JWKS cached', 'Added', ''].map((h) => (
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
                  {a.label ?? '—'}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: C.textDim }}>
                  {a.jwksCachedAt ? <TimeAgo ts={a.jwksCachedAt} /> : 'never'}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: C.textDim }}>
                  <TimeAgo ts={a.createdAt} />
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <button
                    onClick={() => {
                      if (confirm(`Delete trust anchor "${a.label ?? a.issuerUrl}"?`)) {
                        remove.mutate(a.id);
                      }
                    }}
                    title="Delete"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: C.textMuted,
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
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
