'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Play, AlertTriangle } from 'lucide-react';
import { C } from '@/lib/colors';
import { InlineSpinner } from '@/components/shared/loading-skeleton';
import type {
  AgentSpec,
  FaultInjection,
  JSONSchema,
  ScenarioTemplate,
} from '@/lib/types/playground';

export interface RunFormSubmission {
  inputs: Record<string, unknown>;
  template?: string;
  variant?: string;
  fault_injection?: FaultInjection;
}

interface Props {
  schema: JSONSchema;
  templates?: ScenarioTemplate[];
  agents?: AgentSpec[];
  loading?: boolean;
  onSubmit: (s: RunFormSubmission) => void;
}

export function RunInputForm({ schema, templates, agents, loading, onSubmit }: Props) {
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  // Derive initial values from the schema. Recompute when `schema`
  // changes so that switching scenarios resets the form.
  const initial = useMemo(() => {
    const next: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(props)) {
      if (def.default !== undefined) next[key] = def.default;
      else if (def.type === 'boolean') next[key] = false;
      else if (def.type === 'number' || def.type === 'integer') next[key] = 0;
      else next[key] = '';
    }
    return next;
    // The schema reference is the parent's responsibility; depending on
    // it directly is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [templateId, setTemplateId] = useState<string>('');
  const [variantId, setVariantId] = useState<string>('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [manifest404, setManifest404] = useState<string[]>([]);
  const [peerOffline, setPeerOffline] = useState<string[]>([]);

  // Reset stateful fields when the underlying schema reference changes
  // (i.e. the parent switched scenarios).
  useEffect(() => {
    setValues(initial);
    setTemplateId('');
    setVariantId('');
    setManifest404([]);
    setPeerOffline([]);
  }, [initial]);

  const variants = useMemo(() => {
    if (!templateId || !templates) return [];
    return templates.find((t) => t.id === templateId)?.variants ?? [];
  }, [templateId, templates]);

  function update(key: string, val: unknown) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function toggleAgentIn(
    aid: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) {
    setter((prev) => (prev.includes(aid) ? prev.filter((a) => a !== aid) : [...prev, aid]));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fi: FaultInjection = {};
    if (manifest404.length > 0) fi.manifest_404 = manifest404;
    if (peerOffline.length > 0) fi.peer_offline = peerOffline;
    onSubmit({
      inputs: values,
      template: templateId || undefined,
      variant: variantId || undefined,
      fault_injection: Object.keys(fi).length > 0 ? fi : undefined,
    });
  }

  const baseInput: React.CSSProperties = {
    width: '100%',
    background: C.bg3,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: '8px 10px',
    color: C.text,
    fontSize: 13,
    outline: 'none',
  };

  const noInputs = Object.keys(props).length === 0;

  return (
    <form onSubmit={submit}>
      {templates && templates.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Label>Template</Label>
          <select
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setVariantId('');
            }}
            style={baseInput}
          >
            <option value="">— default —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name ?? t.id}
              </option>
            ))}
          </select>
        </div>
      )}

      {variants.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Label>Variant</Label>
          <select value={variantId} onChange={(e) => setVariantId(e.target.value)} style={baseInput}>
            <option value="">— pick a variant —</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name ?? v.id}
              </option>
            ))}
          </select>
        </div>
      )}

      {noInputs && (
        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 16 }}>
          This scenario takes no inputs.
        </div>
      )}

      {Object.entries(props).map(([key, def]) => {
        let control: React.ReactNode;
        if (def.enum && def.enum.length > 0) {
          control = (
            <select
              value={String(values[key] ?? '')}
              onChange={(e) => update(key, e.target.value)}
              style={baseInput}
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
                update(
                  key,
                  def.type === 'integer' ? parseInt(e.target.value, 10) : parseFloat(e.target.value),
                )
              }
              style={baseInput}
            />
          );
        } else {
          control = (
            <input
              type="text"
              value={String(values[key] ?? '')}
              onChange={(e) => update(key, e.target.value)}
              required={required.has(key)}
              style={baseInput}
            />
          );
        }

        return (
          <div key={key} style={{ marginBottom: 14 }}>
            <Label>{key} {required.has(key) ? '*' : ''}</Label>
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

      {agents && agents.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            style={{
              background: 'none',
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '6px 10px',
              color: C.textDim,
              fontSize: 11,
              cursor: 'pointer',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              justifyContent: 'space-between',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={11} color={C.amber} />
              Advanced — fault injection
              {(manifest404.length > 0 || peerOffline.length > 0) && (
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    color: C.amber,
                    background: C.amber + '15',
                    padding: '1px 5px',
                    borderRadius: 3,
                  }}
                >
                  {manifest404.length + peerOffline.length} fault
                  {manifest404.length + peerOffline.length === 1 ? '' : 's'}
                </span>
              )}
            </span>
            <ChevronDown
              size={12}
              style={{ transform: advancedOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
            />
          </button>
          {advancedOpen && (
            <div
              style={{
                marginTop: 8,
                padding: 12,
                background: C.bg3,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
              }}
            >
              <FaultGroup
                label="manifest_404"
                description="Force a 404 when fetching this agent's AITP manifest."
                agents={agents}
                selected={manifest404}
                onToggle={(aid) => toggleAgentIn(aid, setManifest404)}
              />
              <FaultGroup
                label="peer_offline"
                description="Refuse all handshake attempts from this agent."
                agents={agents}
                selected={peerOffline}
                onToggle={(aid) => toggleAgentIn(aid, setPeerOffline)}
              />
            </div>
          )}
        </div>
      )}

      <RunButton loading={loading} />
    </form>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        fontSize: 11,
        color: C.textDim,
        display: 'block',
        marginBottom: 6,
        textTransform: 'lowercase',
      }}
    >
      {children}
    </label>
  );
}

function FaultGroup({
  label,
  description,
  agents,
  selected,
  onToggle,
}: {
  label: string;
  description: string;
  agents: AgentSpec[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="mono" style={{ fontSize: 11, color: C.amber, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>{description}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {agents.map((a) => {
          const on = selected.includes(a.id);
          return (
            <button
              type="button"
              key={a.id}
              onClick={() => onToggle(a.id)}
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 4,
                background: on ? C.amber + '25' : C.bg2,
                color: on ? C.amber : C.textDim,
                border: `1px solid ${on ? C.amber + '50' : C.border}`,
                cursor: 'pointer',
                fontFamily: 'JetBrains Mono',
              }}
            >
              {a.id}
            </button>
          );
        })}
      </div>
    </div>
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
