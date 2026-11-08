import { isIP } from 'node:net';

/** The caller's IP, from a header only the platform can set.
 *
 *  On Vercel (`VERCEL=1`), in order: `x-real-ip`, the first
 *  `x-vercel-forwarded-for` entry, then the RIGHTMOST `x-forwarded-for`
 *  entry (the one Vercel's edge appended; anything to its left is
 *  client-supplied and spoofable). Off Vercel, only the header an operator
 *  names in `CONSOLE_CLIENT_IP_HEADER` is trusted (rightmost entry);
 *  without it the IP is `unknown`, never a guess from a spoofable header.
 *
 *  Every value must parse as an IP. An IPv6 zone (`%eth0`) and brackets are
 *  stripped, and an IPv4-mapped IPv6 address is reported as plain IPv4. */
export const UNKNOWN_IP = 'unknown';

export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw.trim();
  if (!v) return null;
  if (v.startsWith('[')) {
    const end = v.indexOf(']');
    if (end < 0) return null;
    v = v.slice(1, end);
  }
  const zone = v.indexOf('%');
  if (zone >= 0) v = v.slice(0, zone);
  const kind = isIP(v);
  if (kind === 4) return v;
  if (kind === 6) {
    const lower = v.toLowerCase();
    const h = hextets(lower);
    if (h.slice(0, 5).every((x) => x === '0000') && h[5] === 'ffff') {
      const hi = parseInt(h[6], 16);
      const lo = parseInt(h[7], 16);
      return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    }
    return lower;
  }
  return null;
}

function rightmost(value: string | null): string | null {
  if (!value) return null;
  const parts = value.split(',');
  return normalizeIp(parts[parts.length - 1]);
}

function first(value: string | null): string | null {
  if (!value) return null;
  return normalizeIp(value.split(',')[0]);
}

export function clientIp(
  headers: Headers,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  if (env.VERCEL === '1') {
    return (
      normalizeIp(headers.get('x-real-ip')) ??
      first(headers.get('x-vercel-forwarded-for')) ??
      rightmost(headers.get('x-forwarded-for')) ??
      UNKNOWN_IP
    );
  }
  const name = env.CONSOLE_CLIENT_IP_HEADER?.trim();
  if (name) return rightmost(headers.get(name)) ?? UNKNOWN_IP;
  return UNKNOWN_IP;
}

/** Expand an IPv6 address to its 8 hextets. Input is already validated. */
function hextets(v6: string): string[] {
  let s = v6;
  // Embedded dotted IPv4 tail (e.g. `64:ff9b::1.2.3.4`) becomes two hextets.
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (dotted) {
    const o = dotted[1].split('.').map(Number);
    const tail = `${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
    s = s.slice(0, -dotted[1].length) + tail;
  }
  const [head, tail] = s.includes('::') ? s.split('::') : [s, undefined];
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail ? tail.split(':') : [];
  const fill = tail !== undefined ? 8 - h.length - t.length : 0;
  return [...h, ...Array<string>(fill).fill('0'), ...t].map((x) =>
    (x || '0').padStart(4, '0'),
  );
}

/** Limiter key: IPv4 as-is, IPv6 collapsed to its /64 (one subscriber's
 *  allocation), `unknown` stays one shared bucket. */
export function rateLimitKey(ip: string): string {
  const v = normalizeIp(ip);
  if (!v) return UNKNOWN_IP;
  if (isIP(v) === 4) return v;
  return `${hextets(v).slice(0, 4).join(':')}::/64`;
}
