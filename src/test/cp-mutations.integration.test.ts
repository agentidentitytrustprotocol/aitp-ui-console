/**
 * @jest-environment node
 *
 * End-to-end CP write flows through the console's BFF proxies. Exercises
 * the webhook lifecycle — the one CRUD surface that is safe to create and
 * tear down repeatedly without polluting registry/trust state.
 *
 * Requires the same setup as proxies.integration.test.ts:
 *   - npm run dev (console on :3001)
 *   - sibling aitp-cp running on :4000
 *
 * Run with: RUN_INTEGRATION=1 npm run test:integration
 *
 * The suite cleans up after itself (afterAll deletes the webhook it
 * created), and the target URL is a reserved-by-RFC .invalid domain so
 * the CP can never deliver to a real host.
 */
import { consoleUrl, describeIntegration } from './integration-utils';

interface WebhookShape {
  id: string;
  url: string;
  events: string[];
  active: boolean;
}

async function jsonFetch(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

describeIntegration('CP write flows — webhook lifecycle', () => {
  const hookUrl = 'https://console-integration-test.invalid/aitp-hook';
  let created: WebhookShape | null = null;

  afterAll(async () => {
    if (created) {
      await fetch(`${consoleUrl()}/api/cp/webhooks/${encodeURIComponent(created.id)}`, {
        method: 'DELETE',
      });
    }
  });

  it('POST /api/cp/webhooks creates a subscription', async () => {
    const { status, body } = await jsonFetch(`${consoleUrl()}/api/cp/webhooks`, {
      method: 'POST',
      body: JSON.stringify({ url: hookUrl, events: ['handshake.complete'], active: true }),
    });
    expect([200, 201]).toContain(status);
    const hook = body as WebhookShape;
    expect(hook.id).toBeTruthy();
    expect(hook.url).toBe(hookUrl);
    created = hook;
  });

  it('PUT /api/cp/webhooks/[id] updates the subscription', async () => {
    expect(created).toBeTruthy();
    const { status, body } = await jsonFetch(
      `${consoleUrl()}/api/cp/webhooks/${encodeURIComponent(created!.id)}`,
      { method: 'PUT', body: JSON.stringify({ active: false }) },
    );
    expect(status).toBe(200);
    expect((body as WebhookShape).active).toBe(false);
  });

  it('GET /api/cp/webhooks/[id]/circuit-breaker reports breaker state', async () => {
    expect(created).toBeTruthy();
    const { status, body } = await jsonFetch(
      `${consoleUrl()}/api/cp/webhooks/${encodeURIComponent(created!.id)}/circuit-breaker`,
    );
    expect(status).toBe(200);
    const breaker = body as { state?: string; circuitBreaker?: { state?: string } };
    const state = breaker.state ?? breaker.circuitBreaker?.state;
    expect(['closed', 'open', 'half-open']).toContain(state);
  });

  it('POST .../circuit-breaker/reset succeeds on a fresh breaker', async () => {
    expect(created).toBeTruthy();
    const { status } = await jsonFetch(
      `${consoleUrl()}/api/cp/webhooks/${encodeURIComponent(created!.id)}/circuit-breaker/reset`,
      { method: 'POST', body: '{}' },
    );
    expect(status).toBeLessThan(500);
  });

  it('DELETE /api/cp/webhooks/[id] removes the subscription', async () => {
    expect(created).toBeTruthy();
    const id = created!.id;
    const { status } = await jsonFetch(
      `${consoleUrl()}/api/cp/webhooks/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
    expect([200, 204]).toContain(status);
    created = null;

    // The list no longer contains it.
    const { body } = await jsonFetch(`${consoleUrl()}/api/cp/webhooks`);
    const list = (body as { webhooks?: WebhookShape[] }).webhooks ?? [];
    expect(list.find((w) => w.id === id)).toBeUndefined();
  });
});
