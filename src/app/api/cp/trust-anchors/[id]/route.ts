import { NextRequest } from 'next/server';
import { proxyDelete, proxyGet, proxyPatch } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyGet('cp', `/api/trust-anchors/${encodeURIComponent(id)}`, req);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyPatch('cp', `/api/trust-anchors/${encodeURIComponent(id)}`, req);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyDelete('cp', `/api/trust-anchors/${encodeURIComponent(id)}`, req);
}
