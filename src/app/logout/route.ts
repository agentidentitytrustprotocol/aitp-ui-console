import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Clears the session cookie. POST only, behind the proxy's auth and
 *  Origin checks, so a cross-site page can't sign the operator out. */
export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.nextUrl), 303);
  res.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return res;
}
