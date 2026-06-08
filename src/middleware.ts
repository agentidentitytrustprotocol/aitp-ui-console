import { NextRequest, NextResponse } from 'next/server';

/** Reject cross-site mutation requests to the BFF proxy by checking
 *  Origin against the request Host. Browsers always send Origin on
 *  POST/PUT/PATCH/DELETE from script (CORS), and same-origin form posts
 *  match Host — so this catches CSRF-style cross-site form submissions
 *  without needing a token round-trip.
 *
 *  GETs (incl. SSE) are intentionally unguarded because they are not
 *  state-changing and EventSource cannot attach custom headers.
 *
 *  Trusted origins can be added via TRUSTED_ORIGINS (comma-separated)
 *  for environments behind a reverse proxy with a different external
 *  host than the internal Host header. */
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function trustedOrigins(): Set<string> {
  const raw = process.env.TRUSTED_ORIGINS ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function originHost(origin: string | null): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest): NextResponse {
  if (!MUTATION_METHODS.has(req.method)) return NextResponse.next();

  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  const allow = trustedOrigins();

  // No Origin header at all → not a browser (curl, server-to-server,
  // integration tests, mobile clients). CSRF requires an attacker who can
  // make a victim's *browser* submit a cross-site request, so absent
  // Origin is not a CSRF vector. Modern browsers always set Origin on
  // POST/PUT/PATCH/DELETE.
  if (!origin) return NextResponse.next();

  if (allow.has(origin)) return NextResponse.next();

  const oHost = originHost(origin);
  if (oHost && host && oHost === host) return NextResponse.next();

  return NextResponse.json(
    { error: 'Cross-site request rejected', code: 'csrf_blocked' },
    { status: 403 },
  );
}

export const config = {
  matcher: ['/api/cp/:path*', '/api/playground/:path*'],
};
