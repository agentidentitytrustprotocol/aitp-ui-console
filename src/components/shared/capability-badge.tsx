import { C } from '@/lib/colors';

export function CapabilityBadge({ cap }: { cap: string }) {
  return (
    <span
      className="mono"
      style={{
        fontSize: 10,
        padding: '1px 6px',
        borderRadius: 3,
        background: C.amber + '15',
        color: C.amber,
        border: `1px solid ${C.amber}30`,
      }}
    >
      {cap}
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mono"
      style={{
        fontSize: 10,
        padding: '1px 6px',
        borderRadius: 3,
        background: C.bg3,
        color: C.textDim,
        border: `1px solid ${C.border}`,
      }}
    >
      {children}
    </span>
  );
}
