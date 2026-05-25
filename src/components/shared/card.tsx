import type { CSSProperties, ReactNode } from 'react';
import { C } from '@/lib/colors';

export function Card({
  children,
  style = {},
  className,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  onClick?: () => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={className}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        background: C.bg2,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  icon: Icon,
  title,
  sub,
  right,
}: {
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {Icon && <Icon size={18} color={C.teal} />}
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.text }}>{title}</div>
          {sub && <div style={{ fontSize: 12, color: C.textDim, marginTop: 1 }}>{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}
