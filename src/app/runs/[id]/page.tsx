import { RunDetail } from '@/components/runs/run-detail';

// RunDetail consumes useSearchParams via useUrlEnum; opt out of prerender.
export const dynamic = 'force-dynamic';

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunDetail runId={decodeURIComponent(id)} />;
}
