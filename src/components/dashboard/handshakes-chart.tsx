'use client';

import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { C } from '@/lib/colors';

interface Props {
  data: Array<{ bucket: string; count: number }>;
}

export function HandshakesChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="hs-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={C.teal} stopOpacity={0.3} />
            <stop offset="95%" stopColor={C.teal} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
        <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: C.textMuted }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10, fill: C.textMuted }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{
            background: C.bg3,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            fontSize: 12,
          }}
          labelStyle={{ color: C.textDim }}
          itemStyle={{ color: C.tealBright }}
        />
        <Area type="monotone" dataKey="count" stroke={C.teal} strokeWidth={2} fill="url(#hs-gradient)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
