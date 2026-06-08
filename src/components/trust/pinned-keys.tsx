'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSkeleton, InlineSpinner } from '@/components/shared/loading-skeleton';
import { TimeAgo } from '@/components/shared/time-ago';
import { AidCell } from '@/components/shared/aid-cell';
import { useCreatePinnedKey, useDeletePinnedKey, usePinnedKeys } from '@/hooks/use-trust';
import { useToast } from '@/components/shared/toast';
import { C } from '@/lib/colors';
import { shortId } from '@/lib/utils';

const ED25519_PUBKEY_B64URL = /^[A-Za-z0-9_-]{43}$/;

export function PinnedKeysView() {
  const toast = useToast();
  const { data, isLoading, error } = usePinnedKeys();
  const create = useCreatePinnedKey();
  const remove = useDeletePinnedKey();
  const [showForm, setShowForm] = useState(false);
  const [namespace, setNamespace] = useState('');
  const [aid, setAid] = useState('');
  const [pubkey, setPubkey] = useState('');
  const [label, setLabel] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    if (!ED25519_PUBKEY_B64URL.test(pubkey)) {
      setValidationError('pubkey must be a 43-char base64url Ed25519 public key');
      return;
    }
    create.mutate(
      {
        namespace: namespace || undefined,
        aid,
        pubkey,
        label: label || undefined,
        expiresAt: expiresAt || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Key pinned', aid);
          setNamespace('');
          setAid('');
          setPubkey('');
          setLabel('');
          setExpiresAt('');
          setShowForm(false);
        },
        onError: (err) => toast.error('Failed to pin key', String(err)),
      },
    );
  }

  const keys = data?.pinnedKeys ?? [];

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
          Pinned Ed25519 keys
          <span className="mono" style={{ fontSize: 11, color: C.textMuted, marginLeft: 8 }}>
            {keys.length}
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
          <Plus size={12} /> {showForm ? 'Cancel' : 'Pin key'}
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
          <Field label="AID">
            <input
              value={aid}
              onChange={(e) => setAid(e.target.value)}
              required
              placeholder="aid:pubkey:..."
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
            Pin
          </button>
          <div style={{ gridColumn: '1 / span 4' }}>
            <Field label="Public key (43-char base64url Ed25519)">
              <input
                value={pubkey}
                onChange={(e) => setPubkey(e.target.value)}
                required
                spellCheck={false}
                placeholder="MCowBQYDK2VwAyEA…"
                style={{ ...inputStyle, fontFamily: 'JetBrains Mono' }}
              />
            </Field>
          </div>
          <div style={{ gridColumn: '1 / span 4' }}>
            <Field label="Expires at (optional ISO-8601)">
              <input
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                placeholder="2026-12-31T00:00:00Z"
                style={inputStyle}
              />
            </Field>
          </div>
          {(validationError || create.error) && (
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
              {validationError ?? String(create.error)}
            </div>
          )}
        </form>
      )}

      {isLoading ? (
        <div style={{ padding: 20 }}>
          <LoadingSkeleton rows={3} />
        </div>
      ) : error ? (
        <EmptyState title="Couldn't load pinned keys" description="Check Control Plane connection." />
      ) : keys.length === 0 ? (
        <EmptyState
          title="No keys pinned"
          description="Pinned keys lock specific Ed25519 public keys to AIDs, bypassing dynamic discovery."
        />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Namespace', 'AID', 'Pubkey', 'Label', 'Expires', 'Pinned', ''].map((h) => (
                <th
                  key={h}
                  scope="col"
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
            {keys.map((k) => (
              <tr
                key={`${k.namespace}:${k.aid}`}
                style={{ borderBottom: `1px solid ${C.border}20` }}
              >
                <td style={{ padding: '10px 14px' }}>
                  <span className="mono" style={{ fontSize: 11, color: C.teal }}>
                    {k.namespace}
                  </span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <AidCell aid={k.aid} />
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <span
                    className="mono"
                    style={{ fontSize: 10, color: C.amber }}
                    title={k.pubkey}
                  >
                    {shortId(k.pubkey, 16)}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: C.textDim }}>
                  {k.label ?? '—'}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: C.textDim }}>
                  {k.expiresAt ? <TimeAgo ts={k.expiresAt} /> : '—'}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: C.textDim }}>
                  <TimeAgo ts={k.createdAt} />
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <button
                    onClick={() => {
                      if (
                        !confirm(`Unpin ${k.aid} in namespace "${k.namespace}"?`)
                      ) return;
                      remove.mutate(
                        { namespace: k.namespace, aid: k.aid },
                        {
                          onSuccess: () => toast.success('Key unpinned', k.aid),
                          onError: (err) =>
                            toast.error('Failed to unpin key', String(err)),
                        },
                      );
                    }}
                    title="Unpin"
                    aria-label={`Unpin ${k.aid} in namespace ${k.namespace}`}
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
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 10, color: C.textMuted, marginBottom: 4, display: 'block' }}>
        {label}
      </span>
      {children}
    </label>
  );
}
