import { NextRequest } from 'next/server';
import { proxyGet, proxyPost } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return proxyGet('playground', '/runs', req);
}

export async function POST(req: NextRequest) {
  return proxyPost('playground', '/runs', req);
}
