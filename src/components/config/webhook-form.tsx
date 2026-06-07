'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { InlineSpinner } from '@/components/shared/loading-skeleton';
import { C } from '@/lib/colors';
import { useCreateWebhook } from '@/hooks/use-webhooks';

const EVENT_TYPES = [
  'agent.registered',
  'agent.deregistered',
  'agent.expired',
  'handshake.complete',
  'handshake.failed',
  'tct.revoked',
];

export function WebhookForm({ onClose, onCreated }: { onClose: () => void; onCreated?: (secret: string) => void }) {
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['handshake.complete']);
  const [active, setActive] = useState(true);

  const create = useCreateWebhook();

  function toggleEvent(t: string) {
    setEvents((prev) => (prev.includes(t) ? prev.filter((e) => e !== t) : [...prev, t]));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    create.mutate(
      { url, events, active },
      {
        onSuccess: (w) => {
          if (w.secret) onCreated?.(w.secret);
          onClose();
        },
      },
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000c',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20,
      }}
      onClick={onClose}
    >
      <Card
        style={{ padding: 20, maxWidth: 480, width: '100%' }}
        onClick={() => undefined}
      >
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>New webhook</div>
          <button
            onClick={onClose}
            aria-label="Close webhook form"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}
          >
            <X size={16} />
          </button>
        </div>
        <form onSubmit={submit} onClick={(e) => e.stopPropagation()}>
          <label style={{ fontSize: 11, color: C.textDim, display: 'block', marginBottom: 6 }}>URL</label>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://my-service.example.com/hooks"
            style={{
              width: '100%',
              background: C.bg3,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '8px 10px',
              color: C.text,
              fontSize: 13,
              outline: 'none',
              marginBottom: 16,
            }}
          />

          <label style={{ fontSize: 11, color: C.textDim, display: 'block', marginBottom: 6 }}>
            Event types
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {EVENT_TYPES.map((t) => {
              const on = events.includes(t);
              return (
                <button
                  type="button"
                  key={t}
                  onClick={() => toggleEvent(t)}
                  style={{
                    fontSize: 11,
                    padding: '4px 10px',
                    borderRadius: 4,
                    background: on ? C.teal + '20' : C.bg3,
                    color: on ? C.tealBright : C.textDim,
                    border: `1px solid ${on ? C.teal + '40' : C.border}`,
                    cursor: 'pointer',
                    fontFamily: 'JetBrains Mono',
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>

          <label
            style={{ fontSize: 12, color: C.textDim, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}
          >
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              style={{ accentColor: C.teal }}
            />
            Active
          </label>

          {create.error && (
            <div
              style={{
                background: C.red + '15',
                border: `1px solid ${C.red}40`,
                color: C.red,
                padding: 10,
                borderRadius: 6,
                fontSize: 11,
                marginBottom: 12,
              }}
            >
              {String(create.error)}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: '8px 14px',
                color: C.textDim,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending || !url || events.length === 0}
              style={{
                background: C.teal,
                border: 'none',
                borderRadius: 6,
                padding: '8px 14px',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: create.isPending ? 0.7 : 1,
              }}
            >
              {create.isPending && <InlineSpinner color="#fff" />}
              Create
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
