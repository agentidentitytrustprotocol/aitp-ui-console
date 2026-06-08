import { NextRequest } from 'next/server';
import { proxySse } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Long-lived SSE stream. Vercel kills serverless functions at the plan
// timeout (Hobby 10s, Pro 60s by default, up to 300s on Pro with this
// override). The useSse hook on the client auto-reconnects after a
// timeout, so this just caps how often we eat a reconnect.
export const maxDuration = 300;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxySse('playground', `/runs/${encodeURIComponent(id)}/events`, req);
}
