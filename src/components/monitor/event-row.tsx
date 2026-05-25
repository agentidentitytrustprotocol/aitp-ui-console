'use client';

import { ArrowRight } from 'lucide-react';
import { C, eventColor } from '@/lib/colors';
import type { AuditEvent } from '@/lib/types/cp';
import { shortId } from '@/lib/utils';

interface Props {
  event: AuditEvent;
  selected?: boolean;
  onClick?: () => void;
}

export function EventRow({ event, selected, onClick }: Props) {
  const color = eventColor(event.type);
  const ts = event.ts ? new Date(event.ts).toLocaleTimeString() : '—';

  return (
    <div
      onClick={onClick}
      className="ticker-in"
      style={{
        display: 'grid',
        gridTemplateColumns: '90px 200px 1fr',
        gap: 12,
        padding: '10px 16px',
        borderBottom: `1px solid ${C.border}20`,
        cursor: 'pointer',
        transition: 'background .1s',
        background: selected ? C.bg3 : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = C.bg3;
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent';
      }}
    >
      <span className="mono" style={{ fontSize: 11, color: C.textMuted }}>
        {ts}
      </span>
      <span className="mono" style={{ fontSize: 11, color, padding: '1px 0' }}>
        {event.type}
      </span>
      <span
        style={{
          fontSize: 11,
          color: C.textDim,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {event.aidA && (
          <span className="mono" style={{ color: C.teal }}>
            {shortId(event.aidA.replace('aid:pubkey:', ''), 12)}
          </span>
        )}
        {event.aidB && (
          <>
            <ArrowRight size={10} color={C.textMuted} />
            <span className="mono" style={{ color: C.teal }}>
              {shortId(event.aidB.replace('aid:pubkey:', ''), 12)}
            </span>
          </>
        )}
        {event.grants && event.grants.length > 0 && (
          <span style={{ marginLeft: 8, color: C.amber }}>[{event.grants.join(', ')}]</span>
        )}
        {event.sessionId && !event.aidB && (
          <span className="mono" style={{ color: C.purple }}>
            session:{shortId(event.sessionId, 8)}
          </span>
        )}
      </span>
    </div>
  );
}
