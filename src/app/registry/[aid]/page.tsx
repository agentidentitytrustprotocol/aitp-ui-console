import { AgentDetail } from '@/components/registry/agent-detail';

export default async function RegistryAgentPage({
  params,
}: {
  params: Promise<{ aid: string }>;
}) {
  const { aid } = await params;
  return <AgentDetail aid={decodeURIComponent(aid)} />;
}
