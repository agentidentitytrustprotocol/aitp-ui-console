'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { BoundaryBadge } from '@/components/shared/boundary-badge';
import { Tag } from '@/components/shared/capability-badge';
import { C } from '@/lib/colors';
import type { ScenarioSummary } from '@/lib/types/playground';

export function ScenarioCard({
  summary,
  boundary,
}: {
  summary: ScenarioSummary;
  boundary?: string;
}) {
  return (
    <Link href={`/scenarios/${summary.ref}`} style={{ display: 'block' }}>
      <Card
        style={{ padding: 18, cursor: 'pointer', transition: 'border-color .15s' }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.teal)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{summary.metadata.name}</div>
          <BoundaryBadge boundary={boundary ?? summary.metadata.pack} />
        </div>
        {summary.metadata.summary && (
          <div
            style={{
              fontSize: 12,
              color: C.textDim,
              marginBottom: 12,
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {summary.metadata.summary}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {(summary.metadata.tags ?? []).map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="mono" style={{ fontSize: 11, color: C.textMuted }}>
            v{summary.metadata.version}
          </span>
          <ArrowRight size={14} color={C.teal} />
        </div>
      </Card>
    </Link>
  );
}
