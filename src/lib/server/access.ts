/** Per-request access decision for an upstream call, made in the route
 *  handler before any body is read or any fetch is made.
 *
 *  `src/proxy.ts` (the edge gate) only decides "session required or not".
 *  This module re-derives everything itself (the flag, the session, the
 *  route class) and never trusts that the edge did it, so a flag or
 *  config skew between the two can only close things, never open them.
 *
 *  Flag off: today's behaviour. Every caller must be a signed-in operator
 *  (401 otherwise); no new limits apply.
 *
 *  Flag on (`AITP_CONSOLE_PUBLIC_MODE=on`):
 *  - admin-class or unlisted route: operator only; anonymous → 403
 *    `CONSOLE_OPERATOR_SESSION_REQUIRED` (or 503 when the console has no
 *    password configured, since nobody could sign in);
 *  - public route: anyone, charged against the per-IP `read` bucket, plus
 *    `launch` for `POST /runs`, plus the anonymous CP read budgets for an
 *    anonymous caller on a CP read-key route; SSE routes also take a
 *    stream slot. A refused request spends nothing. */

import type { NextRequest } from 'next/server';
import { consoleAuthConfig } from '../config';
import {
  SESSION_COOKIE,
  basicAuthMatches,
  verifySession,
} from '../auth/session';
import { matchRoute, type AllowEntry, type Service } from './allowlist';
import { clientIp, rateLimitKey } from './client-ip';
import {
  INSTANCE_KEY,
  publicLimiter,
  streamGate,
  type Check,
  type Limiter,
  type StreamGate,
} from './limits';
import { isPublicMode } from './public-mode';

export type AccessDecision =
  | {
      ok: true;
      /** A signed-in operator (session cookie or Basic). */
      operator: boolean;
      /** The matched allowlist entry, or null for an unlisted route. */
      entry: AllowEntry | null;
      /** Frees the stream slot taken for this request. Idempotent; a
       *  no-op when no slot was taken. */
      release: () => void;
    }
  | { ok: false; response: Response };

const noop = () => {};

function json(status: number, body: unknown, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export function rateLimited(
  limit: number,
  retryAfterSeconds: number,
): Response {
  return json(
    429,
    {
      error: 'Too many requests',
      code: 'CONSOLE_RATE_LIMITED',
      retryAfterSeconds,
      limit,
    },
    { 'Retry-After': String(retryAfterSeconds) },
  );
}

/** Whether `req` carries a valid operator session cookie or Basic
 *  credentials. False when the console has no auth configured. An
 *  expired, tampered or garbled credential is simply "not an operator". */
export async function isOperator(req: NextRequest): Promise<boolean> {
  return operatorFromCredentials(
    req.cookies.get(SESSION_COOKIE)?.value,
    req.headers.get('authorization'),
  );
}

/** `isOperator` on the raw credentials, for callers without a
 *  `NextRequest` (the root layout reads them through `next/headers`). */
export async function operatorFromCredentials(
  sessionCookie: string | undefined,
  authorization: string | null,
): Promise<boolean> {
  const auth = consoleAuthConfig();
  if (!auth) return false;
  if (await verifySession(sessionCookie, auth.sessionSecret)) return true;
  return basicAuthMatches(authorization, auth.password);
}

interface Deps {
  limiter: Limiter;
  gate: StreamGate;
  env: Readonly<Record<string, string | undefined>>;
}

const DEFAULT_DEPS: Deps = {
  limiter: publicLimiter,
  gate: streamGate,
  env: process.env,
};

/** Decide whether this request may make `method target` to `service`.
 *  `target` is the full upstream URL; matching runs on its pathname
 *  after dot-segment resolution, i.e. what fetch will actually send. */
export async function authorizeUpstream(
  service: Service,
  method: string,
  target: string,
  req: NextRequest,
  deps: Partial<Deps> = {},
): Promise<AccessDecision> {
  const { limiter, gate, env } = { ...DEFAULT_DEPS, ...deps };
  const configured = consoleAuthConfig() !== null;
  const operator = await isOperator(req);

  if (!isPublicMode(env)) {
    if (!configured)
      return {
        ok: false,
        response: json(503, {
          error: 'console not configured',
          code: 'console_not_configured',
        }),
      };
    if (!operator)
      return {
        ok: false,
        response: json(401, {
          error: 'Authentication required',
          code: 'unauthenticated',
        }),
      };
    return {
      ok: true,
      operator,
      entry: matchRoute(service, method, pathOf(target)),
      release: noop,
    };
  }

  const entry = matchRoute(service, method, pathOf(target));
  if (!entry || entry.access === 'admin') {
    if (operator) return { ok: true, operator, entry, release: noop };
    if (!configured)
      return {
        ok: false,
        response: json(503, {
          error: 'console not configured',
          code: 'console_not_configured',
        }),
      };
    return {
      ok: false,
      response: json(403, {
        error: 'This action needs an operator session',
        code: 'CONSOLE_OPERATOR_SESSION_REQUIRED',
      }),
    };
  }

  // An anonymous CP read needs the read key (operators fall back to admin).
  // Refuse before charging anything, so a misconfigured console spends no
  // visitor's budget on a 503 it made itself.
  const anonCpRead =
    !operator && entry.service === 'cp' && entry.cpKey === 'read';
  if (anonCpRead && !env.CP_READ_API_KEY)
    return {
      ok: false,
      response: json(503, {
        error: 'Control-plane read access is not configured',
        code: 'cp_read_key_unavailable',
      }),
    };

  const key = rateLimitKey(clientIp(req.headers, env));
  const checks: Check[] = [{ policy: 'read', key }];
  if (entry.limit === 'launch') checks.push({ policy: 'launch', key });
  if (anonCpRead) {
    checks.push({ policy: 'cpReadIp', key });
    checks.push({ policy: 'cpRead', key: INSTANCE_KEY });
  }

  // Take the stream slot first so a refused slot charges no bucket; a
  // refused bucket gives the slot straight back.
  let release = noop;
  if (entry.limit === 'stream') {
    const slot = gate.acquire(key);
    if (!slot.ok)
      return {
        ok: false,
        response: rateLimited(slot.limit, slot.retryAfterSeconds),
      };
    release = slot.release;
  }
  const used = limiter.consume(checks);
  if (!used.ok) {
    release();
    return {
      ok: false,
      response: rateLimited(used.limit, used.retryAfterSeconds),
    };
  }
  return { ok: true, operator, entry, release };
}

function pathOf(target: string): string {
  return new URL(target).pathname;
}
