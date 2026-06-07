'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { LoadingSkeleton, InlineSpinner } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { TimeAgo } from '@/components/shared/time-ago';
import {
  useCreateTrustAnchor,
  useDeleteTrustAnchor,
  useTrustAnchors,
  useUpdateTrustAnchor,
} from '@/hooks/use-trust';
import { C } from '@/lib/colors';
import type { TrustAnchor } from '@/lib/types/cp';

type Mode = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; id: string };

function blank() {
  return { namespace: '', issuerUrl: '', jwksUrl: '', label: '' };
}

export function TrustAnchorsView() {
  const { data, isLoading, error } = useTrustAnchors();
  const create = useCreateTrustAnchor();
  const update = useUpdateTrustAnchor();
  const remove = useDeleteTrustAnchor();
  const [mode, setMode] = useState<Mode>({ kind: 'closed' });
  const [form, setForm] = useState(blank);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  function startCreate() {
    setForm(blank());
    setMode({ kind: 'create' });
  }
  function startEdit(a: TrustAnchor) {
    setForm({
      namespace: a.namespace ?? '',
      issuerUrl: a.issuerUrl,
      jwksUrl: a.jwksUrl ?? '',
      label: a.label ?? '',
    });
    setMode({ kind: 'edit', id: a.id });
  }
  function close() {
    setMode({ kind: 'closed' });
    setForm(blank());
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode.kind === 'edit') {
      update.mutate(
        {
          id: mode.id,
          issuerUrl: form.issuerUrl || undefined,
          jwksUrl: form.jwksUrl || null,
          label: form.label || null,
        },
        { onSuccess: close },
      );
      return;
    }
    create.mutate(
      {
        namespace: form.namespace || undefined,
        issuerUrl: form.issuerUrl,
        jwksUrl: form.jwksUrl || undefined,
        label: form.label || undefined,
      },
      { onSuccess: close },
    );
  }

  const anchors = data?.trustAnchors ?? [];
  const isEditing = mode.kind === 'edit';
  const formOpen = mode.kind !== 'closed';
  const pending = create.isPending || update.isPending;
  const formError = create.error ?? update.error;

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
          onClick={() => (formOpen ? close() : startCreate())}
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
          <Plus size={12} /> {formOpen ? 'Cancel' : 'Add anchor'}
        </button>
      </div>

      {formOpen && (
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
              value={form.namespace}
              onChange={(e) => setForm((f) => ({ ...f, namespace: e.target.value }))}
              placeholder="default"
              disabled={isEditing}
              title={isEditing ? 'Namespace cannot be changed after creation.' : undefined}
              style={{ ...inputStyle, opacity: isEditing ? 0.5 : 1 }}
            />
          </Field>
          <Field label="Issuer URL">
            <input
              type="url"
              value={form.issuerUrl}
              onChange={(e) => setForm((f) => ({ ...f, issuerUrl: e.target.value }))}
              required
              placeholder="https://idp.example.com"
              style={inputStyle}
            />
          </Field>
          <Field label="Label">
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="optional"
              style={inputStyle}
            />
          </Field>
          <button
            type="submit"
            disabled={pending}
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
            {pending && <InlineSpinner color="#fff" />}
            {isEditing ? 'Update' : 'Add'}
          </button>
          <div style={{ gridColumn: '1 / span 4' }}>
            <Field label="JWKS URL (optional — pins the JWKS endpoint)">
              <input
                type="url"
                value={form.jwksUrl}
                onChange={(e) => setForm((f) => ({ ...f, jwksUrl: e.target.value }))}
                placeholder="https://idp.example.com/.well-known/jwks.json"
                style={inputStyle}
              />
            </Field>
          </div>
          {formError && (
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
              {String(formError)}
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
                <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {confirmingDelete === a.id ? (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: C.red }}>Delete?</span>
                      <button
                        onClick={() => setConfirmingDelete(null)}
                        aria-label="Cancel delete"
                        style={iconButtonStyle}
                      >
                        <X size={13} />
                      </button>
                      <button
                        onClick={() =>
                          remove.mutate(a.id, { onSuccess: () => setConfirmingDelete(null) })
                        }
                        disabled={remove.isPending}
                        style={{
                          background: C.red,
                          border: 'none',
                          color: '#fff',
                          fontSize: 11,
                          padding: '3px 10px',
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                      >
                        Confirm
                      </button>
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      <button
                        onClick={() => startEdit(a)}
                        title="Edit"
                        aria-label={`Edit trust anchor ${a.label ?? a.issuerUrl}`}
                        style={iconButtonStyle}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setConfirmingDelete(a.id)}
                        title="Delete"
                        aria-label={`Delete trust anchor ${a.label ?? a.issuerUrl}`}
                        style={iconButtonStyle}
                      >
                        <Trash2 size={13} />
                      </button>
                    </span>
                  )}
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

const iconButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: C.textMuted,
  padding: 4,
  borderRadius: 3,
  display: 'inline-flex',
  alignItems: 'center',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
