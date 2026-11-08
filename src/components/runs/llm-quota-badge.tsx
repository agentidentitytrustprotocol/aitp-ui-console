'use client';

import { AlertTriangle } from 'lucide-react';
import { C } from '@/lib/colors';
import { quotaBadgeText, type LlmQuotaInfo } from '@/lib/llm-quota';

/** Says, in visible text, that a run's LLM calls went to the mock because
 *  of the quota. A live region (`role="status"`), never a tooltip: the
 *  reason must be readable without hovering. `compact` is the short chip
 *  for list rows: visible text only and no live region, so a table of
 *  flagged runs doesn't announce every row. */
export function LlmQuotaBadge({
  quota,
  compact = false,
}: {
  quota: LlmQuotaInfo;
  compact?: boolean;
}) {
  return (
    <span
      role={compact ? undefined : 'status'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: compact ? '1px 6px' : '4px 8px',
        borderRadius: 4,
        border: `1px solid ${C.amber}`,
        background: C.amberDim,
        color: C.amber,
        fontSize: compact ? 10 : 11,
        lineHeight: 1.4,
      }}
    >
      <AlertTriangle
        size={compact ? 10 : 12}
        color={C.amber}
        aria-hidden="true"
      />
      <span>
        {compact ? 'LLM quota: mock responses' : quotaBadgeText(quota)}
      </span>
    </span>
  );
}
