import { ScenarioDetail } from '@/components/scenarios/scenario-detail';

export default async function ScenarioDetailPage({
  params,
}: {
  params: Promise<{ ref: string[] }>;
}) {
  const { ref } = await params;
  const decoded = ref.map(decodeURIComponent).join('/');
  return <ScenarioDetail ref={decoded} />;
}
