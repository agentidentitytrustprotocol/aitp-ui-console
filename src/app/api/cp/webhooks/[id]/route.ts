import { NextRequest } from 'next/server';
import { proxyDelete, proxyPatch } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPatch('cp', `/api/webhooks/${encodeURIComponent(id)}`, req);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyDelete('cp', `/api/webhooks/${encodeURIComponent(id)}`, req);
}
