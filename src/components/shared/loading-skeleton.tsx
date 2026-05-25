import { C } from '@/lib/colors';

export function LoadingSkeleton({ rows = 5, height = 36 }: { rows?: number; height?: number }) {
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height,
            background: C.bg3,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            opacity: 1 - i * 0.12,
          }}
        />
      ))}
    </div>
  );
}

export function InlineSpinner({ color = C.tealBright }: { color?: string }) {
  return (
    <span
      className="spin"
      style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        border: `2px solid ${color}40`,
        borderTopColor: color,
        borderRadius: '50%',
      }}
    />
  );
}
