'use client';

import { useState } from 'react';
import { CheckCircle, Copy } from 'lucide-react';
import { C } from '@/lib/colors';
import { formatAid } from '@/lib/utils';

interface Props {
  aid: string | null | undefined;
  short?: boolean;
  headLen?: number;
  tailLen?: number;
  color?: string;
}

export function AidCell({ aid, short = true, headLen = 8, tailLen = 4, color }: Props) {
  const [copied, setCopied] = useState(false);

  if (!aid) {
    return <span style={{ fontSize: 11, color: C.textMuted }}>—</span>;
  }

  const display = short ? formatAid(aid, headLen, tailLen) : aid;

  return (
    <span
      className="mono"
      title={aid}
      style={{
        fontSize: 11,
        color: color ?? C.tealBright,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(aid);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
    >
      {display}
      {copied ? <CheckCircle size={10} color={C.green} /> : <Copy size={10} color={C.textMuted} />}
    </span>
  );
}
