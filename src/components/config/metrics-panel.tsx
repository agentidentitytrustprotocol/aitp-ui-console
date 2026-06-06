'use client';

import { useMemo } from 'react';
import { Gauge } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { useCpMetrics, usePlaygroundMetrics } from '@/hooks/use-playground-meta';
import { C } from '@/lib/colors';

interface Counter {
  name: string;
  value: number;
  help?: string;
}

function parsePrometheus(text: string): Counter[] {
  if (!text) return [];
  const helps: Record<string, string> = {};
  const counters: Record<string, number> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('# HELP ')) {
      const rest = line.slice(7);
      const sp = rest.indexOf(' ');
      if (sp > 0) helps[rest.slice(0, sp)] = rest.slice(sp + 1);
      continue;
    }
    if (line.startsWith('#')) continue;
    // metric{label=...} value
    const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([+-]?[0-9.eE]+)$/);
    if (!m) continue;
    const name = m[1];
    const value = parseFloat(m[3]);
    counters[name] = (counters[name] ?? 0) + value;
  }
  return Object.entries(counters)
    .map(([name, value]) => ({ name, value, help: helps[name] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function MetricsPanel({ source }: { source: 'playground' | 'cp' }) {
  const playground = usePlaygroundMetrics();
  const cp = useCpMetrics();
  const query = source === 'playground' ? playground : cp;
  const counters = useMemo(() => parsePrometheus(query.data ?? ''), [query.data]);

  return (
    <Card style={{ padding: 20 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: C.text,
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Gauge size={14} color={C.teal} /> {source === 'playground' ? 'Playground' : 'CP'} metrics
        <span className="mono" style={{ fontSize: 11, color: C.textMuted, marginLeft: 'auto' }}>
          {counters.length}
        </span>
      </div>
      {query.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : query.error || !query.data ? (
        <EmptyState
          title="Metrics unavailable"
          description="The /metrics endpoint returned no parseable counters."
        />
      ) : counters.length === 0 ? (
        <EmptyState title="No counters" description="The /metrics endpoint returned no parseable counters." />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 8,
          }}
        >
          {counters.map((c) => (
            <div
              key={c.name}
              style={{
                padding: 10,
                background: C.bg3,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
              }}
              title={c.help}
            >
              <div className="mono" style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>
                {c.name}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.tealBright }}>
                {Number.isInteger(c.value) ? c.value : c.value.toFixed(3)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
