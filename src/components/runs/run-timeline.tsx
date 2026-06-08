'use client';

import { useEffect, useRef, useState } from 'react';
import { EventCard } from './event-cards';
import { EmptyState } from '@/components/shared/empty-state';
import { Radio } from 'lucide-react';
import { C } from '@/lib/colors';
import type { RunEvent } from '@/lib/types/playground';

interface Props {
  events: RunEvent[];
  active: boolean;
  connected: boolean;
}

export function RunTimeline({ events, active, connected }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!autoScroll || !active) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [events.length, autoScroll, active]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setAutoScroll(atBottom);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: C.text,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>Event timeline</span>
        {active && (
          <span
            role="status"
            aria-live="polite"
            aria-label={`timeline stream: ${connected ? 'streaming' : 'reconnecting'}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textDim }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: connected ? C.green : C.red,
              }}
              className={connected ? 'pulse' : ''}
            />
            {connected ? 'streaming' : 'reconnecting'}
            {!autoScroll && (
              <button
                onClick={() => {
                  setAutoScroll(true);
                  scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
                }}
                style={{
                  background: C.teal + '20',
                  border: `1px solid ${C.teal}40`,
                  color: C.tealBright,
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontSize: 10,
                  cursor: 'pointer',
                }}
              >
                follow
              </button>
            )}
          </span>
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', paddingRight: 4 }}
      >
        {events.length === 0 ? (
          <EmptyState
            icon={Radio}
            title={active ? 'Waiting for first event…' : 'No events recorded'}
            description={active ? 'Streaming from the playground.' : 'This run has no recorded events.'}
          />
        ) : (
          events.map((evt, i) => <EventCard key={`${evt.type}-${evt.ts}-${i}`} evt={evt} />)
        )}
      </div>
    </div>
  );
}
