import { NextRequest, NextResponse } from 'next/server';
import { consoleAuthConfig } from './lib/config';
import {
  SESSION_COOKIE,
  basicAuthMatches,
  verifySession,
} from './lib/auth/session';
import { createRateLimiter } from './lib/auth/rate-limit';
import { clientIp, rateLimitKey, UNKNOWN_IP } from './lib/server/client-ip';
import { isPublicMode } from './lib/server/public-mode';

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
 *  Public mode (`AITP_CONSOLE_PUBLIC_MODE=on`) changes steps 1 and 2 only:
 *  pages, `/api/cp/*`, `/api/playground/*` and `/api/auth/session` pass
 *  without a session (and without a configured password); every other
 *  route still needs both. The route handler then decides per upstream
 *  route (`src/lib/server/access.ts`): this gate never classifies paths.
 *  A wrong or garbled `Authorization` header on an open route is treated
 *  as anonymous, and charged against a Basic-failure limiter (same policy
 *  as `/login`) so the open routes can't be used to guess the password.
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

/** Routes that, in public mode, pass this gate without a session. */
function openInPublicMode(pathname: string): boolean {
  if (!isApi(pathname)) return !isLogin(pathname) && pathname !== '/logout';
  return (
    pathname.startsWith('/api/cp/') ||
    pathname.startsWith('/api/playground/') ||
    pathname === '/api/auth/session'
  );
}

/** Wrong Basic credentials on a public-mode open route. Its own instance:
 *  the edge and `/login` are separate bundles. */
const basicFailureLimiter = createRateLimiter(10, 60_000);
const unknownIpBasicFailureLimiter = createRateLimiter(50, 60_000);

function tooManyBasicFailures(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    {
      error: 'Too many failed sign-in attempts',
      code: 'CONSOLE_RATE_LIMITED',
      retryAfterSeconds,
    },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const auth = consoleAuthConfig();
  const { pathname } = req.nextUrl;
  const open = isPublicMode() && openInPublicMode(pathname);

  if (!auth && !open) return notConfigured(req);

  if (!isLogin(pathname)) {
    const session = req.cookies.get(SESSION_COOKIE)?.value;
    const authorization = req.headers.get('authorization');
    const ok =
      !!auth &&
      ((await verifySession(session, auth.sessionSecret)) ||
        (await basicAuthMatches(authorization, auth.password)));
    if (!ok && !open) return unauthenticated(req);
    if (!ok && authorization) {
      const key = rateLimitKey(clientIp(req.headers));
      const hit = (
        key === UNKNOWN_IP ? unknownIpBasicFailureLimiter : basicFailureLimiter
      ).hit(key);
      if (!hit.allowed) return tooManyBasicFailures(hit.retryAfterSeconds);
    }
  }

  if (MUTATION_METHODS.has(req.method) && !originAllowed(req))
    return crossSite();

  return NextResponse.next();
}

/** Test hook. */
export function resetBasicFailureLimiter(): void {
  basicFailureLimiter.reset();
  unknownIpBasicFailureLimiter.reset();
}

export const config = {
  // Everything except build output and the favicon. `/login` is matched
  // too, so the fail-closed and Origin checks cover it; only the
  // authentication step skips it.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
