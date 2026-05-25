import { NextRequest } from 'next/server';
import { proxyGet } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return proxyGet('cp', '/api/audit', req);
}
