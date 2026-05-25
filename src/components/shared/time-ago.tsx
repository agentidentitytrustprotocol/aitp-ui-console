'use client';

import { useEffect, useState } from 'react';
import { timeAgo } from '@/lib/utils';

export function TimeAgo({ ts, intervalMs = 1_000 }: { ts: string | number | Date | null | undefined; intervalMs?: number }) {
  const [, tick] = useState(0);

  useEffect(() => {
    const handle = setInterval(() => tick((n) => n + 1), intervalMs);
    return () => clearInterval(handle);
  }, [intervalMs]);

  return <>{timeAgo(ts)}</>;
}
