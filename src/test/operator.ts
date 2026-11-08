/** Test fixture: operator credentials for exercising the route helpers,
 *  which authorize every upstream call (`src/lib/server/access.ts`). */

export const TEST_CONSOLE_PASSWORD = 'test-operator-password-0123456789';
export const TEST_SESSION_SECRET = 'test-session-secret-0123456789abcdef';

/** HTTP Basic for the test operator (any username works). */
export const OPERATOR_BASIC = `Basic ${Buffer.from(
  `op:${TEST_CONSOLE_PASSWORD}`,
).toString('base64')}`;

/** Configure console auth in `process.env`. */
export function setConsoleAuthEnv(): void {
  process.env.CONSOLE_PASSWORD = TEST_CONSOLE_PASSWORD;
  process.env.CONSOLE_SESSION_SECRET = TEST_SESSION_SECRET;
}

export function clearConsoleAuthEnv(): void {
  delete process.env.CONSOLE_PASSWORD;
  delete process.env.CONSOLE_SESSION_SECRET;
}
