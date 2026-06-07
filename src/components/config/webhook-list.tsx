'use client';

import { useState } from 'react';
import { Activity, RefreshCw, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/shared/card';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { WebhookForm } from './webhook-form';
import { useDeleteWebhook, useUpdateWebhook, useWebhooks } from '@/hooks/use-webhooks';
import { useResetCircuitBreaker } from '@/hooks/use-circuit-breaker';
import { getJSON } from '@/lib/api/client';
import { C } from '@/lib/colors';
import type { CircuitBreakerState, WebhookCircuitBreaker } from '@/lib/types/cp';

function breakerColor(state?: CircuitBreakerState): string {
  switch (state) {
    case 'open':
      return C.red;
    case 'half_open':
      return C.amber;
    case 'closed':
    default:
      return C.green;
  }
}

function breakerLabel(state?: CircuitBreakerState): string {
  if (state === 'open') return 'open';
  if (state === 'half_open') return 'half-open';
  return 'closed';
}

/** The webhook list endpoint does NOT embed the circuit breaker
 *  snapshot — it has to be fetched per id. This is rendered as a
 *  collapsed pill that fetches on first expand. */
function BreakerPill({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const reset = useResetCircuitBreaker();
  const q = useQuery({
    queryKey: ['cp-breaker', id],
    queryFn: () =>
      getJSON<WebhookCircuitBreaker>(
        `/api/cp/webhooks/${encodeURIComponent(id)}/circuit-breaker`,
      ),
    enabled: open,
    refetchInterval: open ? 5_000 : false,
  });
  const state = q.data?.state;
  const color = breakerColor(state);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Show / refresh breaker state"
        style={{
          fontSize: 10,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '1px 6px',
          borderRadius: 3,
          background: open ? color + '20' : C.bg2,
          color: open ? color : C.textDim,
          border: `1px solid ${open ? color + '40' : C.border}`,
          cursor: 'pointer',
        }}
      >
        <Activity size={9} />
        {!open
          ? 'breaker'
          : q.isLoading
          ? 'loading…'
          : q.error
          ? 'breaker?'
          : `breaker ${breakerLabel(state)} · failures ${q.data?.failures ?? 0}`}
      </button>
      {open && state && state !== 'closed' && (
        <button
          onClick={() => reset.mutate(id)}
          disabled={reset.isPending}
          title="Reset circuit breaker"
          style={{
            background: 'none',
            border: `1px solid ${C.border}`,
            borderRadius: 3,
            padding: '1px 6px',
            fontSize: 10,
            color: C.textDim,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <RefreshCw size={9} />
          reset
        </button>
      )}
    </span>
  );
}

export function WebhookList() {
  const { data, isLoading, error } = useWebhooks();
  const update = useUpdateWebhook();
  const remove = useDeleteWebhook();
  const [showForm, setShowForm] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const webhooks = data?.webhooks ?? [];

  return (
    <Card style={{ padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 16 }}>Webhooks</div>

      {createdSecret && (
        <div
          style={{
            padding: 12,
            background: C.green + '15',
            border: `1px solid ${C.green}40`,
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 11, color: C.green, marginBottom: 4 }}>
            Copy this webhook secret now — it won&apos;t be shown again.
          </div>
          <div
            className="mono"
            style={{ fontSize: 11, color: C.text, wordBreak: 'break-all', marginBottom: 6 }}
          >
            {createdSecret}
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(createdSecret);
              setCreatedSecret(null);
            }}
            style={{
              background: C.green,
              border: 'none',
              color: '#fff',
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Copy & dismiss
          </button>
        </div>
      )}

      {isLoading ? (
        <LoadingSkeleton rows={2} />
      ) : error ? (
        <EmptyState title="Couldn't load webhooks" description="Check the Control Plane connection." />
      ) : webhooks.length === 0 ? (
        <EmptyState title="No webhooks yet" description="Forward CP events to external services." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {webhooks.map((w) => (
            <div
              key={w.id}
              style={{
                padding: 14,
                background: C.bg3,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: C.text,
                    marginBottom: 5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {w.url}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {w.events.map((t) => (
                    <span
                      key={t}
                      className="mono"
                      style={{
                        fontSize: 9,
                        padding: '1px 5px',
                        borderRadius: 3,
                        background: C.bg2,
                        color: C.textDim,
                        border: `1px solid ${C.border}`,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                  <BreakerPill id={w.id} />
                </div>
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={w.active}
                  onChange={(e) => update.mutate({ id: w.id, active: e.target.checked })}
                  style={{ accentColor: C.teal }}
                />
                <span style={{ color: w.active ? C.green : C.textMuted }}>
                  {w.active ? 'active' : 'paused'}
                </span>
              </label>
              <button
                onClick={() => {
                  if (confirm(`Delete webhook for ${w.url}?`)) remove.mutate(w.id);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setShowForm(true)}
        style={{
          width: '100%',
          marginTop: 12,
          background: C.bg3,
          border: `1px dashed ${C.borderBright}`,
          borderRadius: 6,
          padding: 9,
          color: C.textDim,
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        + Add webhook
      </button>

      {showForm && (
        <WebhookForm
          onClose={() => setShowForm(false)}
          onCreated={(secret) => setCreatedSecret(secret)}
        />
      )}
    </Card>
  );
}
