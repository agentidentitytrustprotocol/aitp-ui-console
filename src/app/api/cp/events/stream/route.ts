import { NextRequest } from 'next/server';
import { proxySse } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return proxySse('cp', '/api/events/stream', req);
}
