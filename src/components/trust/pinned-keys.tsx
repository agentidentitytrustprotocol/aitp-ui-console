'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSkeleton, InlineSpinner } from '@/components/shared/loading-skeleton';
import { TimeAgo } from '@/components/shared/time-ago';
import { AidCell } from '@/components/shared/aid-cell';
import { useCreatePinnedKey, usePinnedKeys } from '@/hooks/use-trust';
import { C } from '@/lib/colors';
import { shortId } from '@/lib/utils';

export function PinnedKeysView() {
  const { data, isLoading, error } = usePinnedKeys();
  const create = useCreatePinnedKey();
  const [showForm, setShowForm] = useState(false);
  const [namespace, setNamespace] = useState('');
  const [aid, setAid] = useState('');
  const [spki, setSpki] = useState('');
  const [algorithm, setAlgorithm] = useState('');
  const [pem, setPem] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      {
        namespace,
        aid,
        spkiFingerprint: spki,
        algorithm: algorithm || undefined,
        publicKeyPem: pem || undefined,
      },
      {
        onSuccess: () => {
          setNamespace('');
          setAid('');
          setSpki('');
          setAlgorithm('');
          setPem('');
          setShowForm(false);
        },
      },
    );
  }

  const keys = data?.keys ?? [];

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
          Pinned SPKI keys
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
              required
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
          <Field label="Algorithm">
            <input
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value)}
              placeholder="ed25519"
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
            <Field label="SPKI fingerprint (sha256 hex)">
              <input
                value={spki}
                onChange={(e) => setSpki(e.target.value)}
                required
                placeholder="a1b2c3..."
                style={{ ...inputStyle, fontFamily: 'JetBrains Mono' }}
              />
            </Field>
          </div>
          <div style={{ gridColumn: '1 / span 4' }}>
            <Field label="Public key PEM (optional)">
              <textarea
                value={pem}
                onChange={(e) => setPem(e.target.value)}
                rows={4}
                spellCheck={false}
                style={{ ...inputStyle, fontFamily: 'JetBrains Mono', resize: 'vertical' }}
              />
            </Field>
          </div>
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
          description="Pinned keys lock specific SPKIs to AIDs, bypassing dynamic discovery."
        />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Namespace', 'AID', 'Algorithm', 'SPKI', 'Pinned'].map((h) => (
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
            {keys.map((k) => (
              <tr key={k.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                <td style={{ padding: '10px 14px' }}>
                  <span className="mono" style={{ fontSize: 11, color: C.teal }}>
                    {k.namespace}
                  </span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <AidCell aid={k.aid} />
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: C.textDim }}>
                  {k.algorithm ?? '—'}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <span
                    className="mono"
                    style={{ fontSize: 10, color: C.amber }}
                    title={k.spkiFingerprint}
                  >
                    {shortId(k.spkiFingerprint, 20)}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: C.textDim }}>
                  <TimeAgo ts={k.createdAt} />
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
