import { NextRequest } from 'next/server';
import { proxyGet } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Returns the templates / variants for a scenario.
 *
 * Why a query-param route instead of a child of `/scenarios/[...ref]`:
 * Next.js does not allow child segments under a catch-all route.
 *
 * Pass `?ref=<pack>/<scenario>@<version>`; the proxy forwards as
 * `GET /scenarios/<pack>/<scenario>@<version>/templates`.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ref = url.searchParams.get('ref') ?? '';
  if (!ref) {
    return new Response(JSON.stringify({ error: 'ref query param required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // Encode each segment, keeping the slashes, as `scenarios/[...ref]` does:
  // a raw `?`, `#` or `%` in the ref would otherwise change the upstream URL.
  const encoded = ref.split('/').map(encodeURIComponent).join('/');
  return proxyGet('playground', `/scenarios/${encoded}/templates`, req);
}
