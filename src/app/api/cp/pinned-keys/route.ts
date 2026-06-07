import { NextRequest } from 'next/server';
import { proxyDelete, proxyGet, proxyPost } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return proxyGet('cp', '/api/pinned-keys', req);
}

export async function POST(req: NextRequest) {
  return proxyPost('cp', '/api/pinned-keys', req);
}

/** Backend keys pinned entries by (namespace, aid) — the DELETE takes
 *  these as query params on the collection URL, not a path segment. */
export async function DELETE(req: NextRequest) {
  return proxyDelete('cp', '/api/pinned-keys', req);
}
