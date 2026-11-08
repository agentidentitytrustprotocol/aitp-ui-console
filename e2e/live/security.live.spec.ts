/** Public-console security, live: admin routes refuse anonymous callers;
 *  an operator session reaches them; no backend URL or key appears on the
 *  wire (hosts, headers, bodies) or in the client bundle. Read-only: every
 *  mutation here is anonymous and refused before it reaches a backend. */
import { expect, test } from '@playwright/test';
import { ConsoleApi } from './support/console-api';
import { apiContext, NEEDLES, ORIGIN, record, recordNetwork, scenarioPath, signIn } from './support/fixtures';
import { findLeaks } from './support/leaks';

const OPERATOR_REQUIRED = 'CONSOLE_OPERATOR_SESSION_REQUIRED';

/** Admin routes (src/lib/server/allowlist.ts `adm(...)`), as console paths.
 *  Ids are fake: an anonymous call is refused before any upstream call. */
const ADMIN_GETS = [
  '/api/playground/metrics',
  '/api/cp/audit',
  '/api/cp/metrics',
  '/api/cp/revocations',
  '/api/cp/webhooks',
  '/api/cp/webhooks/w-live-check/circuit-breaker',
];
const ADMIN_MUTATIONS: [method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string][] = [
  ['POST', '/api/playground/runs/r-live-check/cancel'],
  ['POST', '/api/playground/hosted-agents'],
  ['DELETE', '/api/playground/hosted-agents/h-live-check'],
  ['POST', '/api/playground/hosted-agents/h-live-check/invoke'],
  ['POST', '/api/playground/hosted-agents/h-live-check/resolve-and-handshake'],
  ['POST', '/api/cp/revocation/entries'],
  ['POST', '/api/cp/registry/enroll'],
  ['DELETE', '/api/cp/registry/agents/aid%3Alive-check'],
  ['POST', '/api/cp/pinned-keys'],
  ['DELETE', '/api/cp/pinned-keys'],
  ['POST', '/api/cp/trust-anchors'],
  ['PATCH', '/api/cp/trust-anchors/t-live-check'],
  ['DELETE', '/api/cp/trust-anchors/t-live-check'],
  ['POST', '/api/cp/webhooks'],
  ['PUT', '/api/cp/webhooks/w-live-check'], // route exports PUT and forwards PATCH upstream; matched by the admin `cp PATCH /api/webhooks/:id` entry
  ['DELETE', '/api/cp/webhooks/w-live-check'],
  ['POST', '/api/cp/webhooks/w-live-check/circuit-breaker'],
  ['POST', '/api/cp/webhooks/w-live-check/circuit-breaker/reset'],
];

const PAGES = ['/', '/dashboard', '/scenarios', '/runs', '/registry', '/trust', '/federation', '/monitor', '/audit', '/config'];

test.describe.configure({ mode: 'serial' });

test('anonymous session is public mode, signed out', async () => {
  const req = await apiContext(false);
  const s = await new ConsoleApi(req, ORIGIN).session();
  record('security.session.anon', { session: s });
  expect(s).toMatchObject({ publicMode: true, signedIn: false });
  await req.dispose();
});

test('admin routes are refused when signed out', async () => {
  const req = await apiContext(false);
  const api = new ConsoleApi(req, ORIGIN);
  const rows: { method: string; path: string; status: number; code: unknown }[] = [];
  for (const path of ADMIN_GETS) {
    const r = await api.get(path);
    rows.push({ method: 'GET', path, status: r.status, code: (r.body as { code?: unknown } | null)?.code });
  }
  for (const [method, path] of ADMIN_MUTATIONS) {
    const r = await req.fetch(path, { method, data: {}, headers: { Origin: ORIGIN }, maxRedirects: 0 });
    let code: unknown;
    try {
      code = ((await r.json()) as { code?: unknown }).code;
    } catch {
      code = null;
    }
    rows.push({ method, path, status: r.status(), code });
  }
  record('security.admin.anon', { rows });
  const bad = rows.filter((r) => r.status !== 403 || r.code !== OPERATOR_REQUIRED);
  expect(bad, 'every admin route answers 403 CONSOLE_OPERATOR_SESSION_REQUIRED to an anonymous caller').toEqual([]);
  await req.dispose();
});

test('an operator session reaches admin reads', async () => {
  test.skip(!process.env.CONSOLE_PASSWORD, 'no operator password');
  const req = await apiContext(true);
  const api = new ConsoleApi(req, ORIGIN);
  expect(await api.session()).toMatchObject({ signedIn: true });
  const rows: { path: string; status: number; code: unknown }[] = [];
  for (const path of ADMIN_GETS) {
    const r = await api.get(path);
    rows.push({ path, status: r.status, code: (r.body as { code?: unknown } | null)?.code });
  }
  record('security.admin.operator', { rows });
  // Not refused by the console: upstream may still answer 404 for a fake id.
  const refused = rows.filter((r) => r.status === 401 || r.code === OPERATOR_REQUIRED);
  expect(refused).toEqual([]);
  await req.dispose();
});

for (const mode of ['anonymous', 'operator'] as const) {
  test(`no backend URL or key on the network (${mode})`, async ({ browser }) => {
    test.skip(mode === 'operator' && !process.env.CONSOLE_PASSWORD, 'no operator password');
    test.skip(NEEDLES.length === 0, 'no leak needles configured (run through scripts/live/run-live.sh)');
    const ctx = await browser.newContext();
    if (mode === 'operator') await signIn(ctx);
    const net = recordNetwork(ctx);
    const page = await ctx.newPage();
    const refs = await new ConsoleApi(ctx.request, ORIGIN).scenarios();
    const paths = [...PAGES, ...(refs[0] ? [scenarioPath(refs[0])] : [])];
    const pageStatus: Record<string, number | null> = {};
    for (const p of paths) {
      const res = await page.goto(p, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => null);
      pageStatus[p] = res?.status() ?? null;
    }
    await net.settle();
    record(`security.network.${mode}`, {
      pages: pageStatus,
      requests: net.requests,
      hosts: [...net.hosts],
      findings: net.findings,
      needleLabels: NEEDLES.map((n) => n.label),
    });
    expect(net.requests).toBeGreaterThan(paths.length);
    const violations = net.findings.filter((f) => !f.byDesign);
    expect(violations, 'only the console origin (plus static font hosts) is contacted; no needle in any URL, header or body').toEqual([]);
    await ctx.close();
  });
}

test('no backend URL or key in the client bundle', async ({ browser }) => {
  test.skip(NEEDLES.length === 0, 'no leak needles configured (run through scripts/live/run-live.sh)');
  const ctx = await browser.newContext();
  const scripts = new Set<string>();
  ctx.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/_next/static/')) scripts.add(u.pathname);
  });
  const page = await ctx.newPage();
  for (const p of PAGES) await page.goto(p, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => null);
  // Also every chunk named in the served HTML (prefetch/preload included).
  for (const p of ['/', '/scenarios', '/runs']) {
    const html = await (await ctx.request.get(p)).text();
    for (const m of html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) scripts.add(m[0]);
  }
  const hits: { chunk: string; labels: string[] }[] = [];
  let bytes = 0;
  for (const chunk of scripts) {
    const r = await ctx.request.get(chunk);
    if (!r.ok()) continue;
    const text = (await r.body()).toString('utf8');
    bytes += text.length;
    const labels = findLeaks(text, NEEDLES);
    if (labels.length) hits.push({ chunk, labels });
  }
  record('security.bundle', { chunks: scripts.size, bytes, hits });
  expect(scripts.size).toBeGreaterThan(5);
  expect(hits, 'no needle or Railway domain in any /_next/static asset').toEqual([]);
  await ctx.close();
});
