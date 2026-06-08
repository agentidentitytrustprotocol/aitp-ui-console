import { C } from '@/lib/colors';

const STATUS_CONFIG: Record<string, [string, string]> = {
  active: [C.green, '●'],
  expired: [C.yellow, '◌'],
  deregistered: [C.textMuted, '✕'],
  complete: [C.green, '✓'],
  started: [C.blue, '⟳'],
  failed: [C.red, '✕'],
  pending: [C.textMuted, '○'],
  running: [C.blue, '⟳'],
  success: [C.green, '✓'],
  cancelled: [C.textMuted, '–'],
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const key = status ?? 'pending';
  const [color, icon] = STATUS_CONFIG[key] ?? [C.textMuted, '?'];
  const pulsing = key === 'running' || key === 'started';

  return (
    <span
      role="status"
      aria-label={`status: ${key}`}
      style={{
        fontSize: 11,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <span
        aria-hidden="true"
        className={pulsing ? 'pulse' : ''}
        style={{ display: 'inline-block' }}
      >
        {icon}
      </span>
      {key}
    </span>
  );
}
