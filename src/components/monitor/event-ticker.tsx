'use client';

import { useState } from 'react';
import { Search, X, Eye } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { EventRow } from './event-row';
import { EmptyState } from '@/components/shared/empty-state';
import { useCpEvents } from '@/hooks/use-cp-events';
import { C, eventColor } from '@/lib/colors';
import type { CpEvent } from '@/lib/types/cp';
import { ActiveSessions } from './session-list';

export function EventTicker() {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<CpEvent | null>(null);

  const { events, connected, state } = useCpEvents({ maxBuffer: 200 });

  const filtered = events.filter((e) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      e.type.toLowerCase().includes(q) ||
      e.aidA?.toLowerCase().includes(q) ||
      e.aidB?.toLowerCase().includes(q) ||
      e.sessionId?.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, height: '100%' }}>
      <Card style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={13}
              color={C.textMuted}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by type, AID, or session…"
              style={{
                width: '100%',
                background: C.bg3,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: '6px 10px 6px 30px',
                color: C.text,
                fontSize: 12,
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textDim }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background:
                  state === 'connected'
                    ? C.green
                    : state === 'at-capacity'
                    ? C.amber
                    : C.red,
              }}
              className={state === 'connected' ? 'pulse' : ''}
            />
            {state === 'connected'
              ? 'connected'
              : state === 'at-capacity'
              ? 'CP at capacity'
              : state === 'reconnecting'
              ? 'reconnecting…'
              : 'disconnected'}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <EmptyState
              title={connected ? 'Waiting for events…' : 'Not connected'}
              description={connected ? 'New CP events will appear here in real time.' : 'Trying to reconnect to /api/cp/events/stream'}
            />
          ) : (
            filtered.map((e) => (
              <EventRow
                key={`${e.id}-${e.ts}`}
                event={e}
                selected={selected?.id === e.id}
                onClick={() => setSelected(e)}
              />
            ))
          )}
        </div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
        {selected ? (
          <Card style={{ padding: 16, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} className="anim-in">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <span className="mono" style={{ fontSize: 11, color: eventColor(selected.type) }}>
                {selected.type}
              </span>
              <button
                onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted }}
              >
                <X size={14} />
              </button>
            </div>
            <pre
              className="mono"
              style={{
                fontSize: 11,
                color: C.textDim,
                lineHeight: 1.7,
                background: C.bg3,
                padding: 12,
                borderRadius: 6,
                overflow: 'auto',
                flex: 1,
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {JSON.stringify(selected, null, 2)}
            </pre>
          </Card>
        ) : (
          <Card style={{ padding: 16, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: C.textMuted }}>
              <Eye size={24} style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 12 }}>Click an event to inspect</div>
            </div>
          </Card>
        )}
        <ActiveSessions />
      </div>
    </div>
  );
}
