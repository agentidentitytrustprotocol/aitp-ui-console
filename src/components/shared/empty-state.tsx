import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { C } from '@/lib/colors';

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: '48px 20px',
        textAlign: 'center',
        color: C.textMuted,
      }}
    >
      <Icon size={28} color={C.textMuted} style={{ margin: '0 auto 12px' }} />
      <div style={{ fontSize: 13, color: C.textDim, marginBottom: 4 }}>{title}</div>
      {description && (
        <div style={{ fontSize: 11, color: C.textMuted, maxWidth: 360, margin: '0 auto' }}>
          {description}
        </div>
      )}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}
