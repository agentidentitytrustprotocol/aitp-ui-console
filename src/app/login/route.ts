import { NextRequest, NextResponse } from 'next/server';
import { consoleAuthConfig } from '@/lib/config';
import { C } from '@/lib/colors';
import { clientIp, loginLimiter } from '@/lib/auth/rate-limit';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  passwordMatches,
  signSession,
  verifySession,
} from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `/login` is a route handler rather than a page so it renders outside the
 *  root layout: the sidebar and topbar poll `/api/cp/*` and
 *  `/api/playground/*`, which would only 401 before a session exists.
 *
 *  GET renders the form. POST checks the operator password and issues the
 *  session cookie: a form post gets a 303 to `next`, a JSON post
 *  (`{"password": "…"}`) gets 200 `{"ok": true}` for scripted use.
 *  `src/proxy.ts` has already applied the fail-closed and Origin checks. */

/** Only same-origin relative paths, so `next` can't bounce the operator to
 *  another site after login. */
function safeNext(raw: string | null | undefined): string {
  if (
    !raw ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.startsWith('/\\')
  ) {
    return '/dashboard';
  }
  if (raw === '/login' || raw.startsWith('/login?')) return '/dashboard';
  return raw;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function loginPage(
  next: string,
  error: string | null,
  status: number,
): NextResponse {
  const html = `<!doctype html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in · AITP Console</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: ${C.bg0}; color: ${C.text}; font-family: ui-sans-serif, system-ui, sans-serif; }
  form { width: 320px; padding: 28px; background: ${C.bg1}; border: 1px solid ${C.border}; border-radius: 10px; }
  h1 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
  p { margin: 0 0 20px; font-size: 13px; color: ${C.textDim}; }
  label { display: block; font-size: 12px; color: ${C.textDim}; margin-bottom: 6px; }
  input[type=password] { box-sizing: border-box; width: 100%; padding: 9px 10px; font-size: 14px;
    background: ${C.bg2}; color: ${C.text}; border: 1px solid ${C.borderBright}; border-radius: 6px; }
  input[type=password]:focus { outline: 2px solid ${C.teal}; outline-offset: 1px; }
  button { margin-top: 16px; width: 100%; padding: 9px; font-size: 14px; font-weight: 600; cursor: pointer;
    background: ${C.teal}; color: #fff; border: none; border-radius: 6px; }
  .error { margin: 0 0 14px; padding: 8px 10px; font-size: 13px; color: ${C.red};
    background: ${C.redDim}; border-radius: 6px; }
</style>
</head>
<body>
<form method="post" action="/login">
  <h1>AITP Console</h1>
  <p>Operator sign-in</p>
  ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
  <input type="hidden" name="next" value="${escapeHtml(next)}">
  <button type="submit">Sign in</button>
</form>
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function notConfigured(): NextResponse {
  return NextResponse.json(
    { error: 'console not configured', code: 'console_not_configured' },
    { status: 503 },
  );
}

export async function GET(req: NextRequest) {
  const auth = consoleAuthConfig();
  if (!auth) return notConfigured();
  const next = safeNext(req.nextUrl.searchParams.get('next'));
  if (
    await verifySession(
      req.cookies.get(SESSION_COOKIE)?.value,
      auth.sessionSecret,
    )
  ) {
    return NextResponse.redirect(new URL(next, req.nextUrl), 303);
  }
  return loginPage(next, null, 200);
}

export async function POST(req: NextRequest) {
  const auth = consoleAuthConfig();
  if (!auth) return notConfigured();

  const isJson = (req.headers.get('content-type') ?? '').includes(
    'application/json',
  );

  const limit = loginLimiter.hit(clientIp(req.headers));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts', code: 'rate_limited' },
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSeconds) },
      },
    );
  }

  let password = '';
  let nextRaw: string | null = null;
  try {
    if (isJson) {
      const body = (await req.json()) as { password?: unknown; next?: unknown };
      if (typeof body.password === 'string') password = body.password;
      if (typeof body.next === 'string') nextRaw = body.next;
    } else {
      const form = await req.formData();
      const p = form.get('password');
      const n = form.get('next');
      if (typeof p === 'string') password = p;
      if (typeof n === 'string') nextRaw = n;
    }
  } catch {
    // Malformed body: treated as a wrong password below.
  }
  const next = safeNext(nextRaw);

  if (!(await passwordMatches(password, auth.password))) {
    if (isJson) {
      return NextResponse.json(
        { error: 'Invalid password', code: 'invalid_credentials' },
        { status: 401 },
      );
    }
    return loginPage(next, 'Invalid password.', 401);
  }

  const res = isJson
    ? NextResponse.json({ ok: true })
    : NextResponse.redirect(new URL(next, req.nextUrl), 303);
  // `__Host-` pins the cookie to this exact host (no Domain attribute), so a
  // preview deployment's session never applies to production or vice versa.
  res.cookies.set({
    name: SESSION_COOKIE,
    value: await signSession(auth.sessionSecret),
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
