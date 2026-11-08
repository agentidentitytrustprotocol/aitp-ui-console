export const serverConfig = {
  playgroundUrl: process.env.PLAYGROUND_URL ?? 'http://localhost:8000',
  playgroundApiKey: process.env.PLAYGROUND_API_KEY ?? '',
  cpUrl: process.env.CP_URL ?? 'http://localhost:4000',
  cpApiKey: process.env.CP_API_KEY ?? '',
  /** The console's CP read-only key (`CP_API_KEY_CONSOLE_RO` on the CP).
   *  Read-class CP routes use it; see `src/lib/api/proxy.ts`. */
  cpReadApiKey: process.env.CP_READ_API_KEY ?? '',
};

/** Operator login. Read per request rather than captured at import so a
 *  missing value can never be cached as "configured". Both are required:
 *  if either is blank the console fails closed (503 on every route, see
 *  `src/proxy.ts`). */
export function consoleAuthConfig(): {
  password: string;
  sessionSecret: string;
} | null {
  const password = process.env.CONSOLE_PASSWORD ?? '';
  const sessionSecret = process.env.CONSOLE_SESSION_SECRET ?? '';
  if (!password || !sessionSecret) return null;
  return { password, sessionSecret };
}

/** Whether manifest verification admits an `http://localhost` or
 *  `http://127.0.0.1` `handshake_endpoint`, for a console reading a local CP.
 *  Off unless `AITP_INSECURE_LOCALHOST_DANGEROUS=1`, and never on in a
 *  production build (Vercel Production and Preview are both production
 *  builds), whatever the environment says. The SDK refuses any other
 *  plain-HTTP host even with this on. */
export function insecureLocalhostDangerous(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.AITP_INSECURE_LOCALHOST_DANGEROUS === '1'
  );
}

export const clientConfig = {
  appName: 'AITP Console',
  version: '0.1.0',
};
