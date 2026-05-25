import { NextRequest } from 'next/server';
import { proxyGet } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ aid: string }> }) {
  const { aid } = await params;
  return proxyGet('cp', `/api/registry/agents/${encodeURIComponent(aid)}`, req);
}
