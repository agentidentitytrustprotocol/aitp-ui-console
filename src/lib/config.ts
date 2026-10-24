export const serverConfig = {
  playgroundUrl: process.env.PLAYGROUND_URL ?? 'http://localhost:8000',
  playgroundApiKey: process.env.PLAYGROUND_API_KEY ?? '',
  cpUrl: process.env.CP_URL ?? 'http://localhost:4000',
  cpApiKey: process.env.CP_API_KEY ?? '',
  // Pins the CP's identity for Tier-2 revocation-snapshot verification
  // (see plans/cp-signed-artifact-verification.md, Phase 4). Not a
  // secret -- an AID is a public key -- but it stays server-side because
  // the verdict, not the pin, is what the browser needs. Blank means
  // Tier 1 (self-consistency only): the same name and meaning as the
  // playground's CP_AID (revocation_refresh.py).
  cpAid: process.env.CP_AID ?? '',
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

export const clientConfig = {
  appName: 'AITP Console',
  version: '0.1.0',
};
