import { NextRequest } from 'next/server';
import { proxyGet } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `GET /api/revocation/issuers`: the issuers that have at least one entry,
 *  with their counts (admin key only). */
export async function GET(req: NextRequest) {
  return proxyGet('cp', '/api/revocation/issuers', req);
}
