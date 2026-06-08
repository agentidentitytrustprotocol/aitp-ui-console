import { AgentTable } from '@/components/registry/agent-table';

// AgentTable consumes useSearchParams via useUrlState; opt out of prerender.
export const dynamic = 'force-dynamic';

export default function RegistryPage() {
  return <AgentTable />;
}
