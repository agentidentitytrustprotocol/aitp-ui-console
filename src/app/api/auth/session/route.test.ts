/** @jest-environment node */
import { NextRequest } from 'next/server';
import {
  OPERATOR_BASIC,
  clearConsoleAuthEnv,
  setConsoleAuthEnv,
} from '@/test/operator';
import { GET } from './route';

const URL_ = 'https://console.example.com/api/auth/session';

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(URL_, { headers });
}

beforeEach(setConsoleAuthEnv);
afterEach(() => {
  delete process.env.AITP_CONSOLE_PUBLIC_MODE;
});
afterAll(clearConsoleAuthEnv);

describe('GET /api/auth/session', () => {
  it.each([
    ['off', false],
    ['on', false],
    ['off', true],
    ['on', true],
  ] as const)(
    'flag %s, signed in %s → {publicMode, signedIn}, no-store',
    async (flag, signedIn) => {
      process.env.AITP_CONSOLE_PUBLIC_MODE = flag;
      const res = await GET(
        req(signedIn ? { authorization: OPERATOR_BASIC } : {}),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.get('Content-Type')).toBe('application/json');
      expect(await res.json()).toEqual({
        publicMode: flag === 'on',
        signedIn,
      });
    },
  );

  it('signedIn is false when console auth is not configured', async () => {
    clearConsoleAuthEnv();
    process.env.AITP_CONSOLE_PUBLIC_MODE = 'on';
    const res = await GET(req({ authorization: OPERATOR_BASIC }));
    expect(await res.json()).toEqual({ publicMode: true, signedIn: false });
  });
});
