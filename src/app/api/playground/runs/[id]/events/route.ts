import { NextRequest } from 'next/server';
import { proxySse } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxySse('playground', `/runs/${encodeURIComponent(id)}/events`, req);
}
