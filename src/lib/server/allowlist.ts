/** The one place that classifies an upstream call: which (service, method,
 *  upstream path) anonymous visitors may reach in public mode, which limit
 *  it spends, and which control-plane key it uses.
 *
 *  Matching runs on the upstream path the route handler built (after URL
 *  dot-segment resolution), keyed on the HTTP method the helper actually
 *  sends, never on a browser path or a handler's export name. Anything
 *  unmatched is admin: an omission fails closed. */

export type Service = 'playground' | 'cp';
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Access = 'public' | 'admin';
export type LimitClass = 'read' | 'launch' | 'stream';
/** `read`: CP read-allowlisted route; `admin`: CP admin key; `none`: keyless
 *  CP route (no Authorization header) or a playground route. */
export type CpKey = 'read' | 'admin' | 'none';

export interface AllowEntry {
  service: Service;
  method: Method;
  /** `/runs/:id`; `:ref*` is a catch-all of one or more segments. */
  template: string;
  access: Access;
  limit: LimitClass;
  cpKey: CpKey;
  note?: string;
}

const pub = (
  service: Service,
  method: Method,
  template: string,
  limit: LimitClass = 'read',
  cpKey: CpKey = service === 'cp' ? 'read' : 'none',
  note?: string,
): AllowEntry => ({
  service,
  method,
  template,
  access: 'public',
  limit,
  cpKey,
  note,
});

const adm = (
  service: Service,
  method: Method,
  template: string,
  note?: string,
): AllowEntry => ({
  service,
  method,
  template,
  access: 'admin',
  limit: 'read',
  cpKey: service === 'cp' ? 'admin' : 'none',
  note,
});

/** Snapshot of the control plane's read-key allowlist
 *  (`aitp-control-plane/src/proxy.ts:70-92` @ cd8079c). A read-only key
 *  outside this list gets `403 READ_ONLY_KEY`. If the CP changes it, update
 *  this list in the same change; the allowlist test pins every `cpKey:'read'`
 *  entry against it. */
export const CP_READ_ALLOWLIST_SNAPSHOT: readonly string[] = [
  '/api/dashboard/agents',
  '/api/dashboard/overview',
  '/api/delegations',
  '/api/events/history',
  '/api/events/stream',
  '/api/pinned-keys',
  '/api/registry/agents',
  '/api/registry/agents/:id',
  '/api/registry/agents/:id/manifest',
  '/api/revocation/issuers',
  '/api/sessions',
  '/api/sessions/:id',
  '/api/sessions/:id/replay',
  '/api/sessions/:id/export',
  '/api/tcts',
  '/api/trust-anchors',
  '/api/trust-anchors/:id',
  '/api/trust-anchors/:id/jwks',
];

export const ALLOWLIST: readonly AllowEntry[] = [
  // ── Playground: public reads ──────────────────────────────────────────
  pub('playground', 'GET', '/healthz'),
  pub('playground', 'GET', '/capabilities'),
  pub('playground', 'GET', '/agents'),
  pub('playground', 'GET', '/packs'),
  pub('playground', 'GET', '/scenarios'),
  pub('playground', 'GET', '/scenarios/:ref*/templates'),
  pub('playground', 'GET', '/scenarios/:ref*'),
  pub('playground', 'GET', '/runs'),
  pub('playground', 'GET', '/runs/:id'),
  pub('playground', 'GET', '/runs/:id/status'),
  pub('playground', 'GET', '/runs/:id/narrate'),
  pub('playground', 'GET', '/runs/:id/cp-audit'),
  pub('playground', 'GET', '/runs/:id/cp-sessions'),
  pub(
    'playground',
    'GET',
    '/runs/:id/cp-deliveries',
    'read',
    'none',
    'playground strips the run secret from the webhook block (runs.py:327)',
  ),
  pub('playground', 'GET', '/hosted-agents'),
  pub('playground', 'GET', '/hosted-agents/:id'),
  // ── Playground: SSE and launch ────────────────────────────────────────
  pub('playground', 'GET', '/runs/:id/events', 'stream'),
  pub('playground', 'POST', '/runs', 'launch', 'none', 'returns 202'),
  // ── Playground: admin ─────────────────────────────────────────────────
  adm('playground', 'GET', '/metrics'),
  adm('playground', 'POST', '/runs/:id/cancel'),
  adm('playground', 'POST', '/hosted-agents'),
  adm('playground', 'DELETE', '/hosted-agents/:id'),
  adm(
    'playground',
    'POST',
    '/hosted-agents/:id/invoke',
    'spends LLM budget outside run limits',
  ),
  adm('playground', 'POST', '/hosted-agents/:id/resolve-and-handshake'),

  // ── CP: keyless public ────────────────────────────────────────────────
  pub('cp', 'GET', '/api/health', 'read', 'none'),
  pub('cp', 'GET', '/api/readyz', 'read', 'none'),
  pub('cp', 'GET', '/.well-known/aitp-manifest', 'read', 'none'),
  // ── CP: read-key public reads ─────────────────────────────────────────
  pub('cp', 'GET', '/api/dashboard/overview'),
  pub('cp', 'GET', '/api/dashboard/agents'),
  pub('cp', 'GET', '/api/delegations'),
  pub('cp', 'GET', '/api/events/history'),
  pub('cp', 'GET', '/api/pinned-keys'),
  pub('cp', 'GET', '/api/registry/agents'),
  pub('cp', 'GET', '/api/registry/agents/:id'),
  pub('cp', 'GET', '/api/registry/agents/:id/manifest'),
  pub('cp', 'GET', '/api/revocation/issuers'),
  pub('cp', 'GET', '/api/sessions'),
  pub('cp', 'GET', '/api/sessions/:id'),
  pub('cp', 'GET', '/api/sessions/:id/replay'),
  pub('cp', 'GET', '/api/sessions/:id/export'),
  pub('cp', 'GET', '/api/tcts'),
  pub('cp', 'GET', '/api/trust-anchors'),
  pub('cp', 'GET', '/api/trust-anchors/:id'),
  pub('cp', 'GET', '/api/events/stream', 'stream'),
  // ── CP: admin ─────────────────────────────────────────────────────────
  adm('cp', 'GET', '/api/audit'),
  adm('cp', 'GET', '/api/metrics'),
  adm('cp', 'GET', '/api/revocations'),
  adm('cp', 'POST', '/api/revocation/entries'),
  adm('cp', 'POST', '/api/registry/enroll'),
  adm('cp', 'DELETE', '/api/registry/agents/:id'),
  adm('cp', 'POST', '/api/pinned-keys'),
  adm('cp', 'DELETE', '/api/pinned-keys'),
  adm('cp', 'POST', '/api/trust-anchors'),
  adm('cp', 'PATCH', '/api/trust-anchors/:id'),
  adm('cp', 'DELETE', '/api/trust-anchors/:id'),
  adm('cp', 'GET', '/api/webhooks'),
  adm('cp', 'POST', '/api/webhooks'),
  adm('cp', 'PATCH', '/api/webhooks/:id'),
  adm('cp', 'DELETE', '/api/webhooks/:id'),
  adm('cp', 'GET', '/api/webhooks/:id/circuit-breaker'),
  adm('cp', 'POST', '/api/webhooks/:id/circuit-breaker'),
  adm('cp', 'POST', '/api/webhooks/:id/circuit-breaker/reset'),
];

const SEGMENT = /^[A-Za-z0-9._~%:@+=-]+$/;

/** One encoded path segment is safe to match a `:param` iff it uses only
 *  unreserved/sub-delim characters, isn't a dot segment (raw or encoded),
 *  and its decoded value has no separator or control character. */
export function safeSegment(seg: string): boolean {
  if (!SEGMENT.test(seg)) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(seg);
  } catch {
    return false;
  }
  if (decoded === '.' || decoded === '..') return false;
  if (/[/\\\u0000-\u001f\u007f]/.test(decoded)) return false;
  return true;
}

function matchTemplate(template: string, path: string): boolean {
  const t = template.split('/').slice(1);
  const p = path.split('/').slice(1);
  let i = 0;
  for (let j = 0; j < t.length; j++) {
    const part = t[j];
    if (part.endsWith('*')) {
      // Catch-all: consume as many segments as possible while leaving
      // enough for the remaining literal template parts.
      const rest = t.length - j - 1;
      const take = p.length - i - rest;
      if (take < 1) return false;
      for (let k = 0; k < take; k++) if (!safeSegment(p[i + k])) return false;
      i += take;
      continue;
    }
    if (i >= p.length) return false;
    if (part.startsWith(':')) {
      if (!safeSegment(p[i])) return false;
    } else if (part !== p[i]) {
      return false;
    }
    i++;
  }
  return i === p.length;
}

/** Resolve dot segments the way `fetch` will, then strip any query/hash. */
export function canonicalPath(path: string): string {
  return new URL(path, 'http://upstream.invalid').pathname;
}

export function matchRoute(
  service: Service,
  method: string,
  path: string,
): AllowEntry | null {
  const m = method.toUpperCase();
  const pathname = canonicalPath(path);
  for (const e of ALLOWLIST) {
    if (
      e.service === service &&
      e.method === m &&
      matchTemplate(e.template, pathname)
    )
      return e;
  }
  return null;
}
