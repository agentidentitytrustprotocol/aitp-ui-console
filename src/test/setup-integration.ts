/** Shared bootstrap for integration tests. Skips the suite when the
 *  required env gate isn't set, so `npm run test:integration` is safe
 *  even without backends running. */

const RUN = process.env.RUN_INTEGRATION === '1';
const RUN_LLM = process.env.RUN_LLM_INTEGRATION === '1';

const CONSOLE_URL = process.env.CONSOLE_URL ?? 'http://localhost:3001';
const PG_URL = process.env.PLAYGROUND_URL ?? 'http://localhost:8000';
const CP_URL = process.env.CP_URL ?? 'http://localhost:4000';

if (!RUN) {
  console.warn(
    [
      '',
      '  ⏸  Integration tests skipped.',
      '     Set RUN_INTEGRATION=1 to enable. Required services:',
      `       console:    ${CONSOLE_URL}  (npm run dev in this repo)`,
      `       playground: ${PG_URL}  (sibling aitp-playground)`,
      `       cp:         ${CP_URL}  (sibling aitp-cp)`,
      '     Set RUN_LLM_INTEGRATION=1 to additionally run a real scenario',
      '     (this triggers an LLM call and may incur API cost).',
      '',
    ].join('\n'),
  );
}

(globalThis as unknown as { __INTEGRATION__: unknown }).__INTEGRATION__ = {
  RUN,
  RUN_LLM,
  CONSOLE_URL,
  PG_URL,
  CP_URL,
};

export {};
