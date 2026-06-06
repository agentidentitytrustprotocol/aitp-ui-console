import { NextRequest } from 'next/server';
import { proxyGet, proxyPost } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyGet('cp', `/api/webhooks/${encodeURIComponent(id)}/circuit-breaker`, req);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPost('cp', `/api/webhooks/${encodeURIComponent(id)}/circuit-breaker`, req);
}
