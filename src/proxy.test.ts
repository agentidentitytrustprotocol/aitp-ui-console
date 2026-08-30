/**
 * @jest-environment node
 *
 * next/server's NextRequest relies on the global Request constructor, which
 * jsdom doesn't provide the way Next expects — run this suite under the
 * node test environment, matching src/lib/api/proxy.test.ts.
 */
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

function req(
  url: string,
  method: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(new Request(url, { method, headers }));
}

describe('proxy (CSRF origin check)', () => {
  const url = 'https://console.example.com/api/cp/sessions';

  it('passes through GET requests regardless of origin', () => {
    const res = proxy(req(url, 'GET', { origin: 'https://evil.example.com' }));
    expect(res.status).toBe(200);
  });

  it('passes through mutation requests with no Origin header', () => {
    const res = proxy(req(url, 'POST'));
    expect(res.status).toBe(200);
  });

  it('passes through same-origin mutation requests', () => {
    const res = proxy(
      req(url, 'POST', {
        origin: 'https://console.example.com',
        host: 'console.example.com',
      }),
    );
    expect(res.status).toBe(200);
  });

  it('rejects cross-origin mutation requests', async () => {
    const res = proxy(
      req(url, 'POST', {
        origin: 'https://evil.example.com',
        host: 'console.example.com',
      }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'Cross-site request rejected',
      code: 'csrf_blocked',
    });
  });

  it('allows a cross-origin request whose Origin is in TRUSTED_ORIGINS', () => {
    const prev = process.env.TRUSTED_ORIGINS;
    process.env.TRUSTED_ORIGINS = 'https://trusted.example.com';
    try {
      const res = proxy(
        req(url, 'PUT', {
          origin: 'https://trusted.example.com',
          host: 'console.example.com',
        }),
      );
      expect(res.status).toBe(200);
    } finally {
      process.env.TRUSTED_ORIGINS = prev;
    }
  });

  it('rejects an opaque Origin: null (e.g. a sandboxed iframe)', async () => {
    const res = proxy(
      req(url, 'POST', {
        origin: 'null',
        host: 'console.example.com',
      }),
    );
    expect(res.status).toBe(403);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'rejects cross-origin %s requests',
    (method) => {
      const res = proxy(
        req(url, method, {
          origin: 'https://evil.example.com',
          host: 'console.example.com',
        }),
      );
      expect(res.status).toBe(403);
    },
  );
});
