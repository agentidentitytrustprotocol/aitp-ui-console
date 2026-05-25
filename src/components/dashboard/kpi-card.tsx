import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { C } from '@/lib/colors';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  color?: string;
}

export function KPICard({ label, value, sub, icon: Icon, color = C.teal }: Props) {
  return (
    <Card style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              color: C.textDim,
              marginBottom: 8,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.text, lineHeight: 1 }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>{sub}</div>}
        </div>
        <div
          style={{
            background: color + '15',
            border: `1px solid ${color}30`,
            borderRadius: 8,
            padding: 10,
            flexShrink: 0,
          }}
        >
          <Icon size={18} color={color} />
        </div>
      </div>
    </Card>
  );
}
