'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { C } from '@/lib/colors';

interface Props {
  data: Array<{ capability: string; count: number }>;
}

export function CapabilitiesBar({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
        <XAxis type="number" tick={{ fontSize: 9, fill: C.textMuted }} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="capability"
          tick={{ fontSize: 9, fill: C.textDim, fontFamily: 'JetBrains Mono' }}
          tickLine={false}
          axisLine={false}
          width={92}
        />
        <Tooltip
          contentStyle={{
            background: C.bg3,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            fontSize: 11,
          }}
        />
        <Bar dataKey="count" fill={C.amber} radius={[0, 3, 3, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}
