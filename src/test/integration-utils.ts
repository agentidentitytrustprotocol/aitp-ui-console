/** Shared helpers for integration tests. Read env gates set by
 *  src/test/setup-integration.ts. */

interface IntegrationEnv {
  RUN: boolean;
  RUN_LLM: boolean;
  CONSOLE_URL: string;
  PG_URL: string;
  CP_URL: string;
}

function env(): IntegrationEnv {
  return (globalThis as unknown as { __INTEGRATION__: IntegrationEnv }).__INTEGRATION__;
}

/** Use as `describeIntegration(...)` instead of `describe(...)` so the
 *  whole block becomes a no-op when RUN_INTEGRATION isn't set. */
export const describeIntegration = (process.env.RUN_INTEGRATION === '1'
  ? describe
  : describe.skip) as typeof describe;

export const describeLlm = (process.env.RUN_LLM_INTEGRATION === '1'
  ? describe
  : describe.skip) as typeof describe;

export const itLlm = (process.env.RUN_LLM_INTEGRATION === '1' ? it : it.skip) as typeof it;

export function consoleUrl(): string {
  return env().CONSOLE_URL;
}

export function pgUrl(): string {
  return env().PG_URL;
}

export function cpUrl(): string {
  return env().CP_URL;
}

/** Sleep for `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Poll `predicate` until it returns truthy, or throw after `timeoutMs`. */
export async function waitUntil<T>(
  predicate: () => Promise<T | null>,
  opts: { timeoutMs: number; intervalMs?: number; description?: string },
): Promise<T> {
  const start = Date.now();
  const interval = opts.intervalMs ?? 500;
  while (Date.now() - start < opts.timeoutMs) {
    const result = await predicate();
    if (result) return result;
    await sleep(interval);
  }
  throw new Error(
    `Timed out after ${opts.timeoutMs}ms waiting for: ${opts.description ?? 'condition'}`,
  );
}

/** Stream SSE events from `url` via fetch (works in Node, unlike EventSource).
 *  Yields each parsed JSON event. Stops when the response stream ends. */
export async function* sseEvents<T = unknown>(
  url: string,
  signal?: AbortSignal,
): AsyncGenerator<T, void, void> {
  const res = await fetch(url, {
    headers: { Accept: 'text/event-stream' },
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`SSE connection to ${url} failed: ${res.status}`);
  }
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });

      // Each SSE frame is separated by a blank line.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const dataLine = frame
          .split('\n')
          .find((line) => line.startsWith('data:'));
        if (!dataLine) continue;
        const payload = dataLine.slice('data:'.length).trim();
        if (!payload) continue;
        try {
          yield JSON.parse(payload) as T;
        } catch {
          // ignore unparseable frames
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }
}
