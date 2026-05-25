import { NextRequest } from 'next/server';
import { proxyGet, proxyPost } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return proxyGet('cp', '/api/webhooks', req);
}

export async function POST(req: NextRequest) {
  return proxyPost('cp', '/api/webhooks', req);
}
