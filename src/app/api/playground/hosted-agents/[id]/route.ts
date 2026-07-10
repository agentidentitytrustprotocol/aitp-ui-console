import { NextRequest } from 'next/server';
import { proxyDelete, proxyGet } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyGet('playground', `/hosted-agents/${encodeURIComponent(id)}`, req);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyDelete('playground', `/hosted-agents/${encodeURIComponent(id)}`, req);
}
