'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { C } from '@/lib/colors';
import { InlineSpinner } from '@/components/shared/loading-skeleton';
import type { JSONSchema } from '@/lib/types/playground';

interface Props {
  schema: JSONSchema;
  loading?: boolean;
  onSubmit: (values: Record<string, unknown>) => void;
}

export function RunInputForm({ schema, loading, onSubmit }: Props) {
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  const initial: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(props)) {
    if (def.default !== undefined) initial[key] = def.default;
    else if (def.type === 'boolean') initial[key] = false;
    else if (def.type === 'number' || def.type === 'integer') initial[key] = 0;
    else initial[key] = '';
  }

  const [values, setValues] = useState<Record<string, unknown>>(initial);

  function update(key: string, val: unknown) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(values);
  }

  if (Object.keys(props).length === 0) {
    return (
      <form onSubmit={submit}>
        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 16 }}>
          This scenario takes no inputs.
        </div>
        <RunButton loading={loading} />
      </form>
    );
  }

  return (
    <form onSubmit={submit}>
      {Object.entries(props).map(([key, def]) => {
        const label = (
          <label
            style={{
              fontSize: 11,
              color: C.textDim,
              display: 'block',
              marginBottom: 6,
              textTransform: 'lowercase',
            }}
          >
            {key} {required.has(key) ? '*' : ''}
          </label>
        );

        const baseStyle: React.CSSProperties = {
          width: '100%',
          background: C.bg3,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: '8px 10px',
          color: C.text,
          fontSize: 13,
          outline: 'none',
        };

        let control: React.ReactNode;
        if (def.enum && def.enum.length > 0) {
          control = (
            <select
              value={String(values[key] ?? '')}
              onChange={(e) => update(key, e.target.value)}
              style={baseStyle}
            >
              {def.enum.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          );
        } else if (def.type === 'boolean') {
          control = (
            <input
              type="checkbox"
              checked={Boolean(values[key])}
              onChange={(e) => update(key, e.target.checked)}
              style={{ width: 16, height: 16, accentColor: C.teal }}
            />
          );
        } else if (def.type === 'number' || def.type === 'integer') {
          control = (
            <input
              type="number"
              value={String(values[key] ?? '')}
              onChange={(e) =>
                update(key, def.type === 'integer' ? parseInt(e.target.value, 10) : parseFloat(e.target.value))
              }
              style={baseStyle}
            />
          );
        } else {
          control = (
            <input
              type="text"
              value={String(values[key] ?? '')}
              onChange={(e) => update(key, e.target.value)}
              required={required.has(key)}
              style={baseStyle}
            />
          );
        }

        return (
          <div key={key} style={{ marginBottom: 14 }}>
            {label}
            {control}
            {def.description && (
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{def.description}</div>
            )}
            {!def.description && def.type && (
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{def.type}</div>
            )}
          </div>
        );
      })}
      <RunButton loading={loading} />
    </form>
  );
}

function RunButton({ loading }: { loading?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        width: '100%',
        background: C.teal,
        border: 'none',
        borderRadius: 6,
        padding: '10px',
        color: '#fff',
        fontSize: 13,
        fontWeight: 600,
        cursor: loading ? 'wait' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        opacity: loading ? 0.7 : 1,
        marginTop: 8,
      }}
    >
      {loading ? <InlineSpinner color="#fff" /> : <Play size={14} />}
      {loading ? 'Starting…' : 'Run Scenario'}
    </button>
  );
}
