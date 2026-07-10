import { NextRequest } from 'next/server';
import { proxyGet, proxyPost } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return proxyGet('playground', '/hosted-agents', req);
}

export async function POST(req: NextRequest) {
  return proxyPost('playground', '/hosted-agents', req);
}
