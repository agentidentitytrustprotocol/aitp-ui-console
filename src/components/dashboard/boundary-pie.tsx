'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { C, boundaryColor } from '@/lib/colors';

interface Props {
  data: Array<{ boundary: string; count: number }>;
}

export function BoundaryPie({ data }: Props) {
  const total = data.reduce((acc, d) => acc + d.count, 0);
  const withColor = data.map((d) => ({
    name: d.boundary,
    value: d.count,
    pct: total ? Math.round((d.count / total) * 100) : 0,
    color: boundaryColor(d.boundary),
  }));

  return (
    <>
      <ResponsiveContainer width="100%" height={140}>
        <PieChart>
          <Pie data={withColor} cx="50%" cy="50%" innerRadius={40} outerRadius={62} dataKey="value" paddingAngle={3}>
            {withColor.map((e, i) => (
              <Cell key={i} fill={e.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: C.bg3,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: C.textDim }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {withColor.map((d) => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
            <span style={{ color: C.textDim, flex: 1 }}>{d.name.replace('_', '-')}</span>
            <span className="mono" style={{ color: C.text }}>
              {d.pct}%
            </span>
          </div>
        ))}
        {withColor.length === 0 && (
          <span style={{ fontSize: 11, color: C.textMuted, textAlign: 'center' }}>no data</span>
        )}
      </div>
    </>
  );
}
