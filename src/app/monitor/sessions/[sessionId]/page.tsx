import { SessionTrace } from '@/components/monitor/session-trace';

export default async function MonitorSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <SessionTrace sessionId={decodeURIComponent(sessionId)} />;
}
