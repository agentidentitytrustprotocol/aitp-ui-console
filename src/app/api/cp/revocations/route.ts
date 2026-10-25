import { NextRequest } from 'next/server';
import { proxyGet } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `GET /api/revocations?iss=<aid>`: one issuer's entries, as the CP relays
 *  them for that issuer to sign. The CP signs no revocation list itself. */
export async function GET(req: NextRequest) {
  return proxyGet('cp', '/api/revocations', req);
}
