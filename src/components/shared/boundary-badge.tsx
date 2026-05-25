import { C, boundaryColor } from '@/lib/colors';

const LABELS: Record<string, string> = {
  intra_org: 'intra-org',
  cross_org: 'cross-org',
  cross_cloud: 'cross-cloud',
};

export function BoundaryBadge({ boundary }: { boundary: string | null | undefined }) {
  if (!boundary) {
    return (
      <span
        className="mono"
        style={{
          fontSize: 10,
          padding: '2px 7px',
          borderRadius: 3,
          background: C.textMuted + '20',
          color: C.textMuted,
          border: `1px solid ${C.textMuted}40`,
        }}
      >
        —
      </span>
    );
  }
  const color = boundaryColor(boundary);
  const label = LABELS[boundary] ?? boundary;

  return (
    <span
      className="mono"
      style={{
        fontSize: 10,
        padding: '2px 7px',
        borderRadius: 3,
        background: color + '20',
        color,
        border: `1px solid ${color}40`,
        letterSpacing: '0.05em',
      }}
    >
      {label}
    </span>
  );
}
