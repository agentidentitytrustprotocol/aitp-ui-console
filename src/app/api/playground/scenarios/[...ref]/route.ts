import { NextRequest } from 'next/server';
import { proxyGet } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ ref: string[] }> }) {
  const { ref } = await params;
  const path = `/scenarios/${ref.map(encodeURIComponent).join('/')}`;
  return proxyGet('playground', path, req);
}
