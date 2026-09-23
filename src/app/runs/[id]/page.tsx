import { RunDetail } from '@/components/runs/run-detail';

// RunDetail consumes useSearchParams via useUrlEnum; opt out of prerender.
export const dynamic = 'force-dynamic';

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runId = decodeURIComponent(id);
  // `key` on the run id, not decoration: `RunDetail` calls `useRunTimeBase`,
  // which holds a **monotonically-lowering** time base. That rule is right
  // within one run (it survives the live buffer's front-drop and the swap to
  // the persisted record) and wrong across two — a base can never rise again,
  // so a previous run's earlier start would permanently shift every offset of
  // the next run. This segment is the only place run identity is known above
  // that hook, so keying it here is what makes a navigation between two runs a
  // remount rather than a re-render. Pinned by `run-timeline.test.tsx`'s
  // "across a run-identity change" cases.
  return <RunDetail key={runId} runId={runId} />;
}
