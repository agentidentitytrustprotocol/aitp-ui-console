'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { C } from '@/lib/colors';

interface Props {
  value: unknown;
  name?: string;
  level?: number;
  defaultOpen?: boolean;
  highlight?: (path: string[], value: unknown) => string | null;
  path?: string[];
}

const KEY_COLOR = '#8aa9d6';
const STR_COLOR = '#22c55e';
const NUM_COLOR = '#3b82f6';
const BOOL_COLOR = '#a78bfa';
const NULL_COLOR = '#6b7280';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function JsonTree({ value, name, level = 0, defaultOpen = true, highlight, path = [] }: Props) {
  const [open, setOpen] = useState(defaultOpen || level < 2);

  if (value === null) return renderLine(name, <span style={{ color: NULL_COLOR }}>null</span>, level);
  if (typeof value === 'string') {
    const hl = highlight?.(path, value);
    return renderLine(
      name,
      <span className="mono" style={{ color: hl ?? STR_COLOR }} title={value}>
        &quot;{value}&quot;
      </span>,
      level,
    );
  }
  if (typeof value === 'number')
    return renderLine(name, <span className="mono" style={{ color: NUM_COLOR }}>{value}</span>, level);
  if (typeof value === 'boolean')
    return renderLine(name, <span className="mono" style={{ color: BOOL_COLOR }}>{String(value)}</span>, level);

  if (Array.isArray(value)) {
    return (
      <div style={{ paddingLeft: level === 0 ? 0 : 14, fontSize: 11, fontFamily: 'JetBrains Mono' }}>
        <div
          onClick={() => setOpen((o) => !o)}
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: C.text }}
        >
          {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          {name && <span style={{ color: KEY_COLOR }}>&quot;{name}&quot;: </span>}
          <span style={{ color: C.textDim }}>
            [{value.length}]
          </span>
        </div>
        {open && (
          <div style={{ borderLeft: `1px dashed ${C.border}`, marginLeft: 4, paddingLeft: 6 }}>
            {value.map((v, i) => (
              <JsonTree
                key={i}
                value={v}
                level={level + 1}
                defaultOpen={defaultOpen && level < 1}
                highlight={highlight}
                path={[...path, String(i)]}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (isObject(value)) {
    const keys = Object.keys(value);
    return (
      <div style={{ paddingLeft: level === 0 ? 0 : 14, fontSize: 11, fontFamily: 'JetBrains Mono' }}>
        <div
          onClick={() => setOpen((o) => !o)}
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: C.text }}
        >
          {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          {name && <span style={{ color: KEY_COLOR }}>&quot;{name}&quot;: </span>}
          <span style={{ color: C.textDim }}>
            {'{'}
            {keys.length}
            {'}'}
          </span>
        </div>
        {open && (
          <div style={{ borderLeft: `1px dashed ${C.border}`, marginLeft: 4, paddingLeft: 6 }}>
            {keys.map((k) => (
              <JsonTree
                key={k}
                name={k}
                value={value[k]}
                level={level + 1}
                defaultOpen={defaultOpen && level < 1}
                highlight={highlight}
                path={[...path, k]}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function renderLine(name: string | undefined, body: ReactNode, level: number) {
  return (
    <div
      style={{
        paddingLeft: level === 0 ? 0 : 14,
        fontSize: 11,
        fontFamily: 'JetBrains Mono',
        lineHeight: 1.7,
      }}
    >
      {name !== undefined && (
        <span style={{ color: KEY_COLOR }}>&quot;{name}&quot;: </span>
      )}
      {body}
    </div>
  );
}
