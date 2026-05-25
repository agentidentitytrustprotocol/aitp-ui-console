'use client';

import { Card } from '@/components/shared/card';
import { C } from '@/lib/colors';

interface Props {
  packs: string[];
  counts: Record<string, number>;
  selected: string;
  onSelect: (pack: string) => void;
}

export function PackTree({ packs, counts, selected, onSelect }: Props) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden', height: 'fit-content' }}>
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${C.border}`,
          fontSize: 11,
          color: C.textMuted,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        Packs
      </div>
      {packs.map((p) => (
        <button
          key={p}
          onClick={() => onSelect(p)}
          style={{
            padding: '10px 16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: selected === p ? C.teal + '15' : 'transparent',
            borderLeft: selected === p ? `2px solid ${C.teal}` : '2px solid transparent',
            border: 'none',
            borderTop: 'none',
            borderRight: 'none',
            borderBottom: 'none',
            fontSize: 13,
            color: selected === p ? C.tealBright : C.text,
            width: '100%',
            textAlign: 'left',
          }}
        >
          <span>{p}</span>
          <span style={{ fontSize: 11, color: C.textMuted }}>{counts[p] ?? 0}</span>
        </button>
      ))}
      {packs.length === 0 && (
        <div style={{ padding: 16, fontSize: 12, color: C.textMuted }}>No packs found.</div>
      )}
    </Card>
  );
}
