/** @jest-environment node */
import {
  OPERATOR_BASIC,
  clearConsoleAuthEnv,
  setConsoleAuthEnv,
  TEST_SESSION_SECRET,
} from '@/test/operator';
import { SESSION_COOKIE, signSession } from '../auth/session';

const connection = jest.fn(async () => undefined);
let cookieJar: Record<string, string> = {};
let headerMap: Record<string, string> = {};

jest.mock('next/server', () => ({ connection: () => connection() }));
jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) =>
      n in cookieJar ? { name: n, value: cookieJar[n] } : undefined,
  }),
  headers: async () => ({
    get: (n: string) => headerMap[n.toLowerCase()] ?? null,
  }),
}));

import { initialSession } from './initial-session';

describe('initialSession', () => {
  const saved = process.env.AITP_CONSOLE_PUBLIC_MODE;
  beforeEach(() => {
    setConsoleAuthEnv();
    cookieJar = {};
    headerMap = {};
    connection.mockClear();
  });
  afterEach(() => {
    clearConsoleAuthEnv();
    if (saved === undefined) delete process.env.AITP_CONSOLE_PUBLIC_MODE;
    else process.env.AITP_CONSOLE_PUBLIC_MODE = saved;
  });

  it('reads at request time and reports the flag off by default', async () => {
    delete process.env.AITP_CONSOLE_PUBLIC_MODE;
    expect(await initialSession()).toEqual({
      publicMode: false,
      signedIn: false,
    });
    expect(connection).toHaveBeenCalledTimes(1);
  });

  it('flag on, valid session cookie → signed in', async () => {
    process.env.AITP_CONSOLE_PUBLIC_MODE = 'on';
    cookieJar[SESSION_COOKIE] = await signSession(TEST_SESSION_SECRET);
    expect(await initialSession()).toEqual({
      publicMode: true,
      signedIn: true,
    });
  });

  it('flag on, operator Basic → signed in', async () => {
    process.env.AITP_CONSOLE_PUBLIC_MODE = 'on';
    headerMap.authorization = OPERATOR_BASIC;
    expect((await initialSession()).signedIn).toBe(true);
  });

  it('flag on, tampered cookie → anonymous', async () => {
    process.env.AITP_CONSOLE_PUBLIC_MODE = 'on';
    cookieJar[SESSION_COOKIE] = 'v1.1.x.y';
    expect(await initialSession()).toEqual({
      publicMode: true,
      signedIn: false,
    });
  });

  it('auth not configured → never signed in', async () => {
    process.env.AITP_CONSOLE_PUBLIC_MODE = 'on';
    clearConsoleAuthEnv();
    headerMap.authorization = OPERATOR_BASIC;
    expect((await initialSession()).signedIn).toBe(false);
  });
});
