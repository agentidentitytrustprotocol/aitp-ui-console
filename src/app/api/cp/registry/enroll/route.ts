import { NextRequest } from 'next/server';
import { proxyPost } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return proxyPost('cp', '/api/registry/enroll', req);
}
