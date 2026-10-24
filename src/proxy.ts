import { NextRequest, NextResponse } from 'next/server';
import { consoleAuthConfig } from './lib/config';
import {
  SESSION_COOKIE,
  basicAuthMatches,
  verifySession,
} from './lib/auth/session';

/** Gate for every console route: pages, `/api/cp/*` and `/api/playground/*`.
 *
 *  In order:
 *  1. Fail closed: if CONSOLE_PASSWORD or CONSOLE_SESSION_SECRET is unset,
 *     every route returns 503.
 *  2. Authenticate: a valid signed session cookie (issued by `POST /login`)
 *     or, for scripted use, HTTP Basic with the operator password. API
 *     routes get 401; pages redirect to `/login`. `/login` itself is the
 *     only route exempt from this step.
 *  3. Origin check on mutations: POST/PUT/PATCH/DELETE must carry an
 *     `Origin` that exactly matches this deployment's origin or an entry
 *     in TRUSTED_ORIGINS. A missing or opaque (`null`) Origin is rejected,
 *     so a mutation always proves it came from a page on this origin.
 *
 *  Passing requests continue with `NextResponse.next()`, which neither
 *  reads nor buffers the response, so SSE routes stream as before.
 *
 *  TRUSTED_ORIGINS (comma-separated) is for environments behind a reverse
 *  proxy whose external origin differs from the request Host. */
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

function isApi(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function isLogin(pathname: string): boolean {
  return pathname === '/login';
}

/** The origin this request was addressed to: scheme from the URL, host from
 *  the Host header (what the browser compares its own Origin against). */
function selfOrigin(req: NextRequest): string {
  const host = req.headers.get('host') ?? req.nextUrl.host;
  return `${req.nextUrl.protocol}//${host}`;
}

function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin || origin === 'null') return false;
  if (origin === selfOrigin(req)) return true;
  return trustedOrigins().has(origin);
}

function notConfigured(req: NextRequest): NextResponse {
  if (isApi(req.nextUrl.pathname)) {
    return NextResponse.json(
      { error: 'console not configured', code: 'console_not_configured' },
      { status: 503 },
    );
  }
  return new NextResponse('console not configured', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function unauthenticated(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  if (isApi(pathname) || req.method !== 'GET') {
    return NextResponse.json(
      { error: 'Authentication required', code: 'unauthenticated' },
      { status: 401 },
    );
  }
  const login = new URL('/login', req.nextUrl);
  login.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

function crossSite(): NextResponse {
  return NextResponse.json(
    { error: 'Cross-site request rejected', code: 'csrf_blocked' },
    { status: 403 },
  );
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const auth = consoleAuthConfig();
  if (!auth) return notConfigured(req);

  if (!isLogin(req.nextUrl.pathname)) {
    const session = req.cookies.get(SESSION_COOKIE)?.value;
    const ok =
      (await verifySession(session, auth.sessionSecret)) ||
      (await basicAuthMatches(req.headers.get('authorization'), auth.password));
    if (!ok) return unauthenticated(req);
  }

  if (MUTATION_METHODS.has(req.method) && !originAllowed(req))
    return crossSite();

  return NextResponse.next();
}

export const config = {
  // Everything except build output and the favicon. `/login` is matched
  // too, so the fail-closed and Origin checks cover it; only the
  // authentication step skips it.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
