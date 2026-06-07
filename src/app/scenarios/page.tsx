'use client';

import { useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Card, SectionTitle } from '@/components/shared/card';
import { PackTree } from '@/components/scenarios/pack-tree';
import { ScenarioCard } from '@/components/scenarios/scenario-card';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { useScenarios } from '@/hooks/use-scenarios';
import { C } from '@/lib/colors';

const PACK_BOUNDARY: Record<string, string> = {
  'intra-org': 'intra_org',
  'cross-org': 'cross_org',
  'cross-cloud': 'cross_cloud',
};

export default function ScenariosPage() {
  const { data, isLoading, error } = useScenarios();
  const scenarios = useMemo(() => data?.scenarios ?? [], [data?.scenarios]);

  const packs = useMemo(
    () => Array.from(new Set(scenarios.map((s) => s.metadata.pack))).sort(),
    [scenarios],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of scenarios) c[s.metadata.pack] = (c[s.metadata.pack] ?? 0) + 1;
    return c;
  }, [scenarios]);

  const [selected, setSelected] = useState<string | null>(null);

  // Auto-select first pack once data arrives.
  const activePack = selected ?? packs[0] ?? '';
  const filtered = scenarios.filter((s) => s.metadata.pack === activePack);

  return (
    <div className="anim-in" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
      <PackTree packs={packs} counts={counts} selected={activePack} onSelect={setSelected} />
      <div>
        <SectionTitle
          icon={BookOpen}
          title="Scenarios"
          sub={activePack ? `${filtered.length} scenario${filtered.length === 1 ? '' : 's'} in ${activePack}` : 'No pack selected'}
        />
        {isLoading ? (
          <LoadingSkeleton rows={4} />
        ) : error ? (
          <Card style={{ padding: 20 }}>
            <EmptyState title="Couldn't load scenarios" description="Check the Playground URL in Config." />
          </Card>
        ) : filtered.length === 0 ? (
          <Card style={{ padding: 20 }}>
            <EmptyState
              icon={BookOpen}
              title="No scenarios in this pack"
              description="Scenarios will appear here once the playground discovers them."
            />
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {filtered.map((s) => (
              <ScenarioCard key={s.ref} summary={s} boundary={PACK_BOUNDARY[s.metadata.pack]} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
