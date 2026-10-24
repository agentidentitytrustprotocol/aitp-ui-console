/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { POST as LOGOUT } from '../logout/route';
import { loginLimiter } from '@/lib/auth/rate-limit';
import { SESSION_COOKIE, signSession, verifySession } from '@/lib/auth/session';

const ORIGIN = 'https://console.example.com';
const PASSWORD = 'operator-password-for-tests';
const SECRET = '0123456789abcdef'.repeat(4);

function jsonLogin(password: string, ip = '203.0.113.7'): NextRequest {
  return new NextRequest(
    new Request(`${ORIGIN}/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: ORIGIN,
        'x-real-ip': ip,
      },
      body: JSON.stringify({ password }),
    }),
  );
}

function formLogin(fields: Record<string, string>): NextRequest {
  return new NextRequest(
    new Request(`${ORIGIN}/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: ORIGIN,
      },
      body: new URLSearchParams(fields).toString(),
    }),
  );
}

function sessionFrom(res: Response): string | undefined {
  const set = res.headers.get('set-cookie') ?? '';
  return new RegExp(`${SESSION_COOKIE}=([^;]*)`).exec(set)?.[1];
}

beforeEach(() => {
  process.env.CONSOLE_PASSWORD = PASSWORD;
  process.env.CONSOLE_SESSION_SECRET = SECRET;
  loginLimiter.reset();
});

afterAll(() => {
  delete process.env.CONSOLE_PASSWORD;
  delete process.env.CONSOLE_SESSION_SECRET;
});

describe('POST /login', () => {
  it('issues a signed, HttpOnly, Secure, SameSite=Strict, 12h, host-only cookie', async () => {
    const res = await POST(jsonLogin(PASSWORD));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const set = res.headers.get('set-cookie')!;
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/Secure/i);
    expect(set).toMatch(/SameSite=Strict/i);
    expect(set).toMatch(/Max-Age=43200/);
    expect(set).toMatch(/Path=\//);
    expect(set).not.toMatch(/Domain=/i);
    expect(await verifySession(sessionFrom(res), SECRET)).toBe(true);
  });

  it('rejects a wrong password with 401 and no cookie', async () => {
    const res = await POST(jsonLogin('wrong'));
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('form login redirects (303) to a same-origin `next`', async () => {
    const res = await POST(
      formLogin({ password: PASSWORD, next: '/registry?tab=a' }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/registry?tab=a`);
    expect(sessionFrom(res)).toBeTruthy();
  });

  it.each([
    'https://evil.example.com',
    '//evil.example.com',
    '/\\evil.example.com',
    'dashboard',
  ])('ignores an off-site `next` (%s)', async (next) => {
    const res = await POST(formLogin({ password: PASSWORD, next }));
    expect(res.headers.get('location')).toBe(`${ORIGIN}/dashboard`);
  });

  it('form login with a wrong password re-renders the form with 401', async () => {
    const res = await POST(formLogin({ password: 'wrong', next: '/runs' }));
    expect(res.status).toBe(401);
    const html = await res.text();
    expect(html).toContain('Invalid password.');
    expect(html).toContain('value="/runs"');
  });

  it('treats a malformed body as a wrong password', async () => {
    const r = new NextRequest(
      new Request(`${ORIGIN}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: '{not json',
      }),
    );
    expect((await POST(r)).status).toBe(401);
  });

  it('the 11th attempt in a minute from one IP is 429', async () => {
    for (let i = 0; i < 10; i++)
      expect((await POST(jsonLogin('wrong'))).status).toBe(401);
    const res = await POST(jsonLogin(PASSWORD));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    // Another IP is unaffected.
    expect((await POST(jsonLogin(PASSWORD, '198.51.100.9'))).status).toBe(200);
  });

  it('is 503 when the console is not configured', async () => {
    delete process.env.CONSOLE_SESSION_SECRET;
    expect((await POST(jsonLogin(PASSWORD))).status).toBe(503);
  });
});

describe('GET /login', () => {
  it('renders the form, carrying a safe `next`', async () => {
    const res = await GET(new NextRequest(`${ORIGIN}/login?next=/trust`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain('<form method="post" action="/login">');
    expect(html).toContain('value="/trust"');
  });

  it('escapes `next` into the form', async () => {
    const res = await GET(
      new NextRequest(
        `${ORIGIN}/login?next=${encodeURIComponent('/x"><script>')}`,
      ),
    );
    const html = await res.text();
    expect(html).not.toContain('"><script>');
  });

  it('redirects an already signed-in operator to `next`', async () => {
    const token = await signSession(SECRET);
    const res = await GET(
      new NextRequest(`${ORIGIN}/login?next=/runs`, {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/runs`);
  });

  it('is 503 when the console is not configured', async () => {
    delete process.env.CONSOLE_PASSWORD;
    expect((await GET(new NextRequest(`${ORIGIN}/login`))).status).toBe(503);
  });
});

describe('POST /logout', () => {
  it('clears the cookie and goes to /login', async () => {
    const res = await LOGOUT(
      new NextRequest(`${ORIGIN}/logout`, { method: 'POST' }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login`);
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });
});
