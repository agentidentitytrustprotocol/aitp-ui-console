/** Operator session for the console.
 *
 *  A session is a cookie `v1.<exp>.<nonce>.<sig>` where `exp` is a Unix
 *  time in seconds and `sig` is HMAC-SHA256 over `v1.<exp>.<nonce>` keyed
 *  with CONSOLE_SESSION_SECRET. Everything here uses Web Crypto
 *  (`crypto.subtle`) rather than Node's `crypto`, so the same module runs
 *  in `src/proxy.ts`, in route handlers, and on an Edge runtime if the
 *  proxy is ever moved there.
 *
 *  The session carries no identity: there is one operator password, so a
 *  valid signature is the whole claim. Rotating CONSOLE_SESSION_SECRET
 *  invalidates every outstanding session. */

export const SESSION_COOKIE = '__Host-aitp-console-session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

/** Tolerance for an `exp` slightly beyond `now + TTL`. The signer and the
 *  verifier are the same deployment, but not always the same instance, so
 *  allow for a little clock skew between instances. */
const CLOCK_SKEW_SECONDS = 60;

const VERSION = 'v1';
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;

function hmacKey(secret: string): Promise<CryptoKey> {
  if (cachedKey?.secret !== secret) {
    cachedKey = {
      secret,
      key: crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
      ),
    };
  }
  return cachedKey.key;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Mint a session token valid for `SESSION_TTL_SECONDS` from `now`. */
export async function signSession(
  secret: string,
  now = nowSeconds(),
): Promise<string> {
  const exp = now + SESSION_TTL_SECONDS;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `${VERSION}.${exp}.${nonce}`;
  const sig = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    encoder.encode(payload),
  );
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

/** True only for an untampered, unexpired token signed with `secret`.
 *  The signature check is `crypto.subtle.verify`, which compares in
 *  constant time. */
export async function verifySession(
  token: string | undefined | null,
  secret: string,
  now = nowSeconds(),
): Promise<boolean> {
  if (!token || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 4) return false;
  const [version, expRaw, nonce, sigRaw] = parts;
  if (version !== VERSION || !/^\d{1,12}$/.test(expRaw) || !nonce) return false;
  const exp = Number(expRaw);
  if (exp <= now || exp > now + SESSION_TTL_SECONDS + CLOCK_SKEW_SECONDS)
    return false;
  const sig = fromBase64Url(sigRaw);
  if (!sig || sig.length !== 32) return false;
  return crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    sig,
    encoder.encode(`${version}.${expRaw}.${nonce}`),
  );
}

/** Compare a submitted password with the configured one without leaking
 *  where they differ, or their lengths, through timing: both sides are
 *  hashed to a fixed 32 bytes and every byte is compared. */
export async function passwordMatches(
  submitted: string,
  expected: string,
): Promise<boolean> {
  if (!expected) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(submitted)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** HTTP Basic fallback for scripted use: any username, the operator
 *  password. Returns false for a missing or malformed header. */
export async function basicAuthMatches(
  header: string | null,
  expected: string,
): Promise<boolean> {
  if (!header) return false;
  const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header);
  if (!m) return false;
  let decoded: string;
  try {
    decoded = new TextDecoder().decode(
      Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)),
    );
  } catch {
    return false;
  }
  const sep = decoded.indexOf(':');
  if (sep < 0) return false;
  return passwordMatches(decoded.slice(sep + 1), expected);
}
