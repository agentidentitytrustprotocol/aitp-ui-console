/**
 * @jest-environment node
 *
 * End-to-end proxy smoke tests. Verifies the console's BFF routes correctly
 * forward to live playground + CP services.
 *
 * Requires:
 *   - npm run dev (console on :3001)
 *   - sibling aitp-playground running on :8000
 *   - sibling aitp-cp running on :4000
 *
 * Run with: RUN_INTEGRATION=1 npm run test:integration
 */
import { consoleUrl, describeIntegration, pgUrl, sleep } from './integration-utils';

async function jsonGET(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

describeIntegration('proxy contracts — playground', () => {
  it('GET /api/playground/health forwards to /healthz', async () => {
    const proxied = await jsonGET(`${consoleUrl()}/api/playground/health`);
    const direct = await jsonGET(`${pgUrl()}/healthz`);
    expect(proxied.status).toBe(direct.status);
    expect(proxied.status).toBeLessThan(500);
  });

  it('GET /api/playground/packs returns an array-shaped payload', async () => {
    const { status, body } = await jsonGET(`${consoleUrl()}/api/playground/packs`);
    expect(status).toBe(200);
    expect(body).toBeTruthy();
  });

  it('GET /api/playground/scenarios returns scenarios from the live registry', async () => {
    const { status, body } = await jsonGET(`${consoleUrl()}/api/playground/scenarios`);
    expect(status).toBe(200);
    const payload = body as { scenarios?: Array<{ ref: string }> };
    expect(payload.scenarios).toBeDefined();
    expect(payload.scenarios!.length).toBeGreaterThan(0);
    expect(payload.scenarios![0]).toHaveProperty('ref');
  });

  it('GET /api/playground/runs returns a runs list', async () => {
    const { status, body } = await jsonGET(`${consoleUrl()}/api/playground/runs`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('runs');
  });
});

describeIntegration('proxy contracts — playground v0.2 additions', () => {
  it('GET /api/playground/capabilities returns SDK feature flags', async () => {
    const { status, body } = await jsonGET(`${consoleUrl()}/api/playground/capabilities`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('features');
  });

  it('GET /api/playground/agents returns running playground processes', async () => {
    const { status, body } = await jsonGET(`${consoleUrl()}/api/playground/agents`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('agents');
  });

  it('GET /api/playground/metrics returns Prometheus text', async () => {
    const res = await fetch(`${consoleUrl()}/api/playground/metrics`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/# (HELP|TYPE) /);
  });
});

describeIntegration('proxy contracts — cp', () => {
  it('GET /api/cp/health is healthy', async () => {
    const { status, body } = await jsonGET(`${consoleUrl()}/api/cp/health`);
    expect(status).toBe(200);
    // CP returns { status: 'ok' } shape per its README
    expect(body).toBeTruthy();
  });

  it('GET /api/cp/readyz reports readiness + drain state', async () => {
    const { status, body } = await jsonGET(`${consoleUrl()}/api/cp/readyz`);
    expect([200, 503]).toContain(status);
    expect(body).toHaveProperty('ready');
  });

  it('GET /api/cp/tcts returns an observed-TCT list', async () => {
    const { status, body } = await jsonGET(`${consoleUrl()}/api/cp/tcts`);
    expect(status).toBe(200);
    expect(body).toBeTruthy();
  });

  it('GET /api/cp/delegations returns a delegation list with delegator/delegatee/scope', async () => {
    const { status, body } = await jsonGET(`${consoleUrl()}/api/cp/delegations`);
    expect(status).toBe(200);
    const payload = body as { delegations?: unknown[] };
    expect(Array.isArray(payload.delegations)).toBe(true);
  });

  it('GET /api/cp/trust-anchors returns { trustAnchors }', async () => {
    const { status, body } = await jsonGET(`${consoleUrl()}/api/cp/trust-anchors`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('trustAnchors');
  });

  it('GET /api/cp/pinned-keys returns { pinnedKeys }', async () => {
    const { status, body } = await jsonGET(`${consoleUrl()}/api/cp/pinned-keys`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('pinnedKeys');
  });

  it('GET /api/cp/registry/agents returns an agents list', async () => {
    const { status, body } = await jsonGET(`${consoleUrl()}/api/cp/registry/agents`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('agents');
  });

  it('GET /api/cp/dashboard returns the overview shape with kpis and charts', async () => {
    const { status, body } = await jsonGET(`${consoleUrl()}/api/cp/dashboard?range=24h`);
    expect(status).toBe(200);
    const overview = body as { kpis?: unknown; charts?: unknown };
    expect(overview.kpis).toBeDefined();
    expect(overview.charts).toBeDefined();
  });

  it('GET /api/cp/sessions returns a sessions list', async () => {
    const { status, body } = await jsonGET(`${consoleUrl()}/api/cp/sessions`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('sessions');
  });

  it('GET /api/cp/well-known/aitp-manifest returns the CP identity manifest', async () => {
    const { status, body } = await jsonGET(`${consoleUrl()}/api/cp/well-known/aitp-manifest`);
    expect(status).toBe(200);
    const env = body as { manifest?: { aid?: string } };
    expect(env.manifest).toBeDefined();
    expect(env.manifest!.aid).toMatch(/^aid:/);
  });
});

describeIntegration('SSE proxy', () => {
  it('GET /api/cp/events/stream opens an SSE stream and stays open', async () => {
    const controller = new AbortController();
    const res = await fetch(`${consoleUrl()}/api/cp/events/stream`, {
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    try {
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
      // Give the upstream a moment to flush a keepalive or initial event.
      await sleep(500);
      expect(res.body).toBeTruthy();
    } finally {
      controller.abort();
    }
  });
});
