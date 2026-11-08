import type { Needle } from './env';

/** Shapes that mean "a backend address reached the browser", whatever the
 *  configured hostnames are: Railway public and private domains. */
const GENERIC: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: 'railway-public-domain', re: /[a-z0-9-]+\.up\.railway\.app/i },
  { label: 'railway-private-domain', re: /[a-z0-9-]+\.railway\.internal/i },
];

/** Every way a needle may be spelled in a body: as-is, URL-encoded, and
 *  JSON-escaped (`/` → `\/`). */
function spellings(value: string): string[] {
  const s = new Set([value, encodeURIComponent(value), value.replace(/\//g, '\\/')]);
  return [...s];
}

/** Labels of the needles (and generic backend shapes) found in `text`.
 *  Returns labels only, never a matched value, so the result is safe to
 *  print and to put in an assertion message. */
export function findLeaks(text: string, needles: readonly Needle[]): string[] {
  const hits = new Set<string>();
  for (const n of needles) {
    if (spellings(n.value).some((v) => text.includes(v))) hits.add(n.label);
  }
  for (const g of GENERIC) if (g.re.test(text)) hits.add(g.label);
  return [...hits].sort();
}

/** Needles derived from a backend base URL: its origin and its bare host.
 *  The host alone also catches `wss://host`, `//host` and logs. */
export function urlNeedles(label: string, raw: string | undefined): Needle[] {
  if (!raw) return [];
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return [];
  }
  const out: Needle[] = [{ label: `${label}-origin`, value: u.origin }];
  if (u.hostname.length >= 8) out.push({ label: `${label}-host`, value: u.hostname });
  return out;
}

export interface NetworkFinding {
  kind: 'foreign-host' | 'leak';
  where: string;
  labels?: string[];
  /** Set when the finding is a documented, by-design exposure (not a failure). */
  byDesign?: string;
}

/** Static third-party hosts the console loads on purpose (src/app/globals.css
 *  imports Google Fonts). Never a backend. */
export const STATIC_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

/** Documented exposures (internal_docs/RAILWAY-DOMAINS.md § Remaining
 *  exposure): AITP manifests are signed protocol documents that carry the
 *  issuer's public `handshake_endpoint`, so the console relays them unchanged.
 *  Only URL labels are exempt on these routes; a key is never exempt. */
const MANIFEST_ROUTE = /^\/api\/cp\/(well-known\/aitp-manifest|registry\/agents\/[^/]+\/manifest)\b/;
const URL_LABEL = /^(CP_URL|PLAYGROUND_URL)-(origin|host)$|^railway-public-domain$/;
export function byDesign(f: NetworkFinding): string | undefined {
  if (f.kind === 'foreign-host') return STATIC_HOSTS.has(f.where.split(' ')[1]?.split('/')[0] ?? '') ? 'static third-party asset host' : undefined;
  const path = f.where.split(' ')[1] ?? '';
  if (/\[response body\]$/.test(f.where) && MANIFEST_ROUTE.test(path) && (f.labels ?? []).every((l) => URL_LABEL.test(l)))
    return 'signed AITP manifest carries its public handshake_endpoint (RAILWAY-DOMAINS.md)';
  return undefined;
}
