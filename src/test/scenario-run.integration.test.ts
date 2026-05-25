/**
 * @jest-environment node
 *
 * Triggers a real scenario run through the console proxy, follows the SSE
 * event stream, and asserts the run reaches a terminal state. This will
 * call the configured LLM provider in the playground and may incur cost.
 *
 * Run with:
 *   RUN_INTEGRATION=1 RUN_LLM_INTEGRATION=1 npm run test:integration
 *
 * Optional:
 *   SCENARIO_REF=intra-org/research-and-write@1.0.0   (default)
 */
import { consoleUrl, describeLlm, sseEvents, waitUntil } from './integration-utils';

const SCENARIO = process.env.SCENARIO_REF ?? 'intra-org/research-and-write@1.0.0';
const RUN_TIMEOUT_MS = Number(process.env.LLM_RUN_TIMEOUT_MS ?? 240_000);

interface RunCreated {
  run_id: string;
  status: string;
  scenario_ref: string;
}

interface RunResponse {
  run_id: string;
  status: string;
  outputs: Record<string, unknown>;
  events: Array<{ type: string }>;
  error: string | null;
}

describeLlm('scenario run — end to end through the console proxy', () => {
  it(`runs ${SCENARIO} to completion and emits the expected event milestones`, async () => {
    // 1) Trigger the run.
    const triggerRes = await fetch(`${consoleUrl()}/api/playground/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario_ref: SCENARIO,
        inputs: { topic: 'AITP integration test' },
      }),
    });
    expect(triggerRes.status).toBeLessThan(300);
    const trigger = (await triggerRes.json()) as RunCreated;
    expect(trigger.run_id).toBeTruthy();
    expect(trigger.scenario_ref).toBe(SCENARIO);

    // 2) Follow the SSE event stream. We expect, in order:
    //      run.started → agent.spawning → agent.ready → trust.established
    //      → step.complete → run.complete
    const seen = new Set<string>();
    const controller = new AbortController();
    const milestones = [
      'run.started',
      'agent.spawning',
      'agent.ready',
      'trust.established',
      'step.complete',
      'run.complete',
    ];

    const streamPromise = (async () => {
      try {
        for await (const evt of sseEvents<{ type: string }>(
          `${consoleUrl()}/api/playground/runs/${encodeURIComponent(trigger.run_id)}/events`,
          controller.signal,
        )) {
          seen.add(evt.type);
          if (evt.type === 'run.complete' || evt.type === 'run.failed') {
            controller.abort();
            return;
          }
        }
      } catch {
        // AbortError is expected when we stop early
      }
    })();

    // 3) Race: SSE finishes naturally OR poll status until terminal.
    await Promise.race([
      streamPromise,
      waitUntil(
        async () => {
          const res = await fetch(
            `${consoleUrl()}/api/playground/runs/${encodeURIComponent(trigger.run_id)}/status`,
          );
          if (!res.ok) return null;
          const status = (await res.json()) as { status: string };
          return ['success', 'failed', 'cancelled', 'complete'].includes(status.status)
            ? status
            : null;
        },
        { timeoutMs: RUN_TIMEOUT_MS, intervalMs: 2_000, description: 'run to reach terminal state' },
      ),
    ]);

    controller.abort();

    // 4) Fetch the final run snapshot and assert.
    const finalRes = await fetch(
      `${consoleUrl()}/api/playground/runs/${encodeURIComponent(trigger.run_id)}`,
    );
    expect(finalRes.status).toBe(200);
    const final = (await finalRes.json()) as RunResponse;

    if (final.status === 'failed') {
      throw new Error(`scenario run failed: ${final.error ?? 'unknown error'}`);
    }
    expect(['success', 'complete']).toContain(final.status);
    expect(final.events.length).toBeGreaterThan(0);

    // 5) The SSE timeline should have surfaced the major lifecycle events.
    for (const m of milestones) {
      expect(seen.has(m)).toBe(true);
    }
  });
});
