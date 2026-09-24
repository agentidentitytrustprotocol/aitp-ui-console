/**
 * Classification for the failures of playground's
 * `POST /hosted-agents/{id}/resolve-and-handshake`.
 *
 * ## What the wire actually carries (driven end-to-end, not read off a table)
 *
 * All seven failures in `aitp-playground/src/aitp_playground/api/hosted.py`
 * are `raise HTTPException(status_code=…, detail=f"…")`. There is **no
 * `cause` field** and no custom `HTTPException` handler installed, so FastAPI
 * serializes every one of them as `{"detail": "<string>"}`. Each of the seven
 * below was produced by driving the real router with `fastapi.testclient`
 * (dependency-overridden manager, patched `resolve_did_web`, and a throwaway
 * `HTTPServer` standing in for the agent's admin endpoint) and the `detail`
 * strings were copied from those responses:
 *
 * | Outcome | Status | `detail` |
 * | --- | --- | --- |
 * | 1 | 404 | `no hosted agent h1` |
 * | 2 | 400 | `only did:web peers supported, got did:key:zabc` |
 * | 3 | 502 | `did:web resolution failed for did:web:…: [Errno 8] …` |
 * | 4 | 409 | `refusing cross-domain handshake: … resolved to a loopback origin (…); expected a real remote origin` |
 * | 5 | 409 | `did:web origin mismatch: … resolved to 'evil.example.com', expected 'org-b.example.com'` |
 * | 6 | 502 | `handshake failed (502): {"detail": "…"}` |
 * | 7 | 502 | `handshake failed: All connection attempts failed` |
 *
 * Status alone cannot separate 3/6/7 (all 502) or 4/5 (both 409), so the
 * classifier keys off status first and then an anchored **prefix** of
 * `detail` (`startsWith`, never `includes`). Anchoring matters because
 * outcome 6's `detail` embeds the peer's own response body verbatim
 * (`hosted.py:175-177`): a substring check is not safe against that, since a
 * peer could return a body that happens to *contain* another row's marker
 * text (e.g. the literal string `"did:web resolution failed"`) without ever
 * having been the outcome that marker names. `startsWith` closes that hole —
 * a peer-controlled substring can appear anywhere *inside* the body, but it
 * cannot retroactively become what the body started with. `detail` is a
 * free-text f-string, **not a contract**: if playground rewords, a row stops
 * matching and falls through to `unclassified`, which renders the raw body
 * honestly. That degradation is deliberate — a mislabelled banner is worse
 * than an unlabelled one.
 *
 * ## The honesty constraint, and why outcomes 6 and 7 are worded as they are
 *
 * `aitp-playground/agents/base/agent_admin.py:110-119` states that the
 * agent's admin endpoint raises 502 "for anything a downstream peer did", and
 * that `api/hosted.py` "flattens any status from this route back to 502 at the
 * federation boundary" — so "the `manifest.verify_failed` event's `cause`
 * field is the channel that survives; that is where the distinction lives."
 *
 * The consequence for this file: **a 502 here cannot distinguish a peer whose
 * manifest failed verification from a peer that was simply unreachable.** No
 * 502 copy below asserts a verification verdict of any kind. It says what is
 * actually known — the handshake did not complete, and here is the peer's own
 * text — and points the operator at the run timeline, where the trust-event
 * cards do render the authoritative cause. `federation-errors.test.ts` pins
 * that with absence assertions over every 502 row.
 *
 * ## Three body shapes, one of them a type collision
 *
 * A body reaching here can be any of:
 *   1. FastAPI's `{"detail": "<string>"}` — the seven above. `detail` is also
 *      a **list of objects** for a 422 request-validation failure (confirmed
 *      against the running app), so the string check is load-bearing.
 *   2. This console's own proxy envelope, `{error: "<string>", target,
 *      upstream_status}` (`api/proxy.ts`'s `makeError`, 504/502 only).
 *   3. Playground's `PlaygroundError` handler, `{"error": {"code",
 *      "message"}}` (`aitp_playground/errors.py:46-52`).
 *
 * Shapes 2 and 3 collide on the key `error` but **not on its type** — string
 * versus object. Testing `'error' in body` and then rendering it as a string
 * puts `[object Object]` in front of an operator, so every branch below
 * discriminates on `typeof`, never on key presence.
 */

import type { ApiError } from './api/client';
import { C } from './colors';

/** The distinct outcomes a handshake failure can honestly be reported as. */
export type FederationOutcome =
  /** 404 — the console's hosted-agent list is stale. */
  | 'agent_gone'
  /** 400 — caller input; nothing was resolved and nothing was contacted. */
  | 'not_did_web'
  /** 502 + `did:web resolution failed` — no peer origin was established. */
  | 'did_web_unresolvable'
  /** 409 + `resolved to a loopback origin` — fail-closed control fired. */
  | 'loopback_refused'
  /** 409 + `did:web origin mismatch` — fail-closed control fired. */
  | 'origin_mismatch'
  /** 502 + `handshake failed (` — the peer answered and refused. */
  | 'peer_rejected'
  /** 502 + `handshake failed:` — the handshake did not complete. */
  | 'handshake_incomplete'
  /** 504 from this console's proxy — the playground did not answer in time. */
  | 'console_proxy_timeout'
  /** 502 from this console's proxy — the playground was unreachable. */
  | 'console_proxy_unreachable'
  /** Playground's `{"error": {code, message}}` envelope. */
  | 'playground_error'
  /** The request never produced a response at all (abort, client timeout). */
  | 'no_response'
  /** A shape or status this module does not recognise. Rendered raw. */
  | 'unclassified';

/**
 * How a banner should read, which is not the same question as "did something
 * go wrong".
 *
 * - `blocked` — a fail-closed control refused the handshake **and that is the
 *   control working correctly**. Rendering this red trains operators to
 *   dismiss the most interesting thing the federation demo does.
 * - `input` — nothing was attempted; the caller's input or the console's own
 *   list is what needs fixing.
 * - `failed` — something genuinely went wrong or is unknown.
 */
export type FederationTone = 'blocked' | 'input' | 'failed';

export const FEDERATION_TONE_COLOR: Record<FederationTone, string> = {
  blocked: C.amber,
  input: C.blue,
  failed: C.red,
};

export interface FederationErrorView {
  outcome: FederationOutcome;
  tone: FederationTone;
  /** Design token for `tone`, resolved here so the view has one source. */
  color: string;
  headline: string;
  body: string;
  /** The upstream's own words, verbatim. Never reworded, never dropped — for
   *  `peer_rejected` this is the only place the peer's status and body exist. */
  detail?: string;
  /** True when `detail` is the leading slice of a longer body (`client.ts`
   *  cuts at `MAX_ERROR_BODY_CHARS`). The view must say so. */
  detailTruncated: boolean;
  /** HTTP status, when a response actually arrived. */
  status?: number;
}

interface ParsedBody {
  /** FastAPI's `detail`, **only** when it is a string. */
  detail?: string;
  /** This console's proxy envelope: `error` as a string. */
  proxyError?: string;
  /** Playground's `PlaygroundError` envelope: `error` as an object. */
  playgroundError?: { code: string; message: string };
  /** The body as received, always present when there was one. */
  raw?: string;
}

/** Parse a non-ok body without ever assuming it is JSON, and without ever
 *  assuming a key's type. An HTML error page from an intermediary, or a JSON
 *  body cut mid-token by the 500-char slice, both land in `raw` alone. */
export function parseFederationErrorBody(body: string | undefined): ParsedBody {
  if (!body) return {};
  const raw = body;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { raw };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return { raw };
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.error === 'string') return { proxyError: obj.error, raw };
  if (obj.error !== null && typeof obj.error === 'object') {
    const inner = obj.error as Record<string, unknown>;
    return {
      playgroundError: {
        code: typeof inner.code === 'string' ? inner.code : 'unknown',
        message:
          typeof inner.message === 'string'
            ? inner.message
            : JSON.stringify(inner),
      },
      raw,
    };
  }
  if (typeof obj.detail === 'string') return { detail: obj.detail, raw };
  return { raw };
}

function view(
  outcome: FederationOutcome,
  tone: FederationTone,
  headline: string,
  body: string,
  detail: string | undefined,
  detailTruncated: boolean,
  status?: number,
): FederationErrorView {
  return {
    outcome,
    tone,
    color: FEDERATION_TONE_COLOR[tone],
    headline,
    body,
    detail,
    detailTruncated,
    status,
  };
}

/** The sentence both 502-flattened outcomes share, and the reason neither of
 *  them names a verdict: the status is all that survived the boundary. */
const FLATTENED_502 =
  'Every downstream status is flattened to 502 at the federation boundary, so this response cannot say which step refused. The run timeline carries the trust events that name the cause.';

/**
 * A structural check for `ApiError`, not `instanceof`. `instanceof` ties
 * detection to one specific class token: if a bundling or test setup ever
 * produces a second module instance of `client.ts` — this file's own test
 * suite already has to route around exactly that with
 * `jest.requireActual('@/lib/api/client')` in `federation-view.test.tsx` — a
 * *genuine* `ApiError` thrown from that other instance would fail an
 * `instanceof` check here and get swept into `no_response`, whose copy
 * asserts "the request did not complete". For a response that in fact
 * arrived, that is not a degraded claim, it is a **false** one.
 *
 * A duck-typed check can only fail in the safe direction: at worst it treats
 * something merely ApiError-*shaped* as an `ApiError`, and that shape still
 * carries a real `status` and `body` to classify honestly. Failing into a
 * still-correct classification beats failing into a false statement.
 */
function looksLikeApiError(error: unknown): error is ApiError {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as Partial<ApiError>;
  return (
    typeof candidate.status === 'number' &&
    typeof candidate.method === 'string' &&
    typeof candidate.path === 'string' &&
    typeof candidate.bodyTruncated === 'boolean' &&
    (candidate.body === undefined || typeof candidate.body === 'string')
  );
}

/**
 * Map a handshake mutation error onto exactly one honest rendering.
 *
 * Returns `null` for a falsy error so the caller can render nothing, matching
 * the old `ErrorBanner`'s `if (!error) return null`.
 */
export function classifyFederationError(
  error: unknown,
): FederationErrorView | null {
  if (!error) return null;

  if (!looksLikeApiError(error)) {
    // No response ever arrived: an abort, `client.ts`'s 30s timeout guard, or
    // a transport failure before the BFF route ran. The handshake's outcome
    // is genuinely unknown — playground's own httpx timeout is also 30s, so
    // it may well still be in flight.
    return view(
      'no_response',
      'failed',
      'No response',
      'The request did not complete, so the handshake has no known outcome — it may still be running in the playground. Check the run timeline before retrying.',
      error instanceof Error ? error.message : String(error),
      false,
    );
  }

  const { status, body, bodyTruncated } = error;
  const parsed = parseFederationErrorBody(body);
  const detail = parsed.detail ?? parsed.raw;

  // The console's own proxy shadows the upstream: `makeError` emits
  // `{error: "<string>", target, upstream_status}`, and it is only ever called
  // with 504 or 502 (`api/proxy.ts:105,108,191,194,285`). Shape first, status
  // second — a proxy-generated 502 must never be read as a peer that refused.
  // Both conditions are required, so a string `error` at any other status
  // falls through to the raw render rather than being attributed to the proxy.
  if (parsed.proxyError !== undefined && status === 504) {
    return view(
      'console_proxy_timeout',
      'failed',
      'Playground did not answer in time',
      "The console's proxy timed out waiting on the playground. Nothing is known about the handshake — it may have completed upstream after the proxy gave up.",
      detail,
      bodyTruncated,
      status,
    );
  }
  if (parsed.proxyError !== undefined && status === 502) {
    return view(
      'console_proxy_unreachable',
      'failed',
      'Playground unreachable',
      "The console's proxy could not reach the playground at all, so the handshake was never requested. Check PLAYGROUND_URL in Config.",
      detail,
      bodyTruncated,
      status,
    );
  }

  if (parsed.playgroundError !== undefined) {
    return view(
      'playground_error',
      'failed',
      `Playground rejected the request (${parsed.playgroundError.code})`,
      parsed.playgroundError.message,
      detail,
      bodyTruncated,
      status,
    );
  }

  // Keyed on the `detail` prefix like every other row, not on the bare status.
  // A 404 with some other body is not necessarily playground saying "no such
  // hosted agent" — it could be a missing console route or an intermediary —
  // and claiming the hosted agent is gone would be a mislabel. Unrecognised
  // 404s fall through to the honest raw render below.
  if (status === 404 && parsed.detail?.startsWith('no hosted agent')) {
    return view(
      'agent_gone',
      'input',
      'Hosted agent not found',
      "The playground has no hosted agent with this id, so nothing was attempted. The console's list is stale — refresh it and host the agent again.",
      detail,
      bodyTruncated,
      status,
    );
  }

  if (
    status === 400 &&
    parsed.detail?.startsWith('only did:web peers supported')
  ) {
    return view(
      'not_did_web',
      'input',
      'Only did:web peers are supported',
      'The playground rejected the peer identifier before resolving anything. No DID document was fetched and no peer was contacted.',
      detail,
      bodyTruncated,
      status,
    );
  }

  // `resolve_did_web` (`trust/resolver.py:40-42`) already performed a real
  // HTTP GET against the peer's did:web host by the time either 409 below can
  // fire (`hosted.py:126` runs before `:143`/`:153`) — so the copy must not
  // claim the peer was "never contacted". What is true, and all that is
  // claimed here: the handshake *request* to the peer's agent endpoint was
  // never sent.
  if (
    status === 409 &&
    parsed.detail?.startsWith('refusing cross-domain handshake:')
  ) {
    return view(
      'loopback_refused',
      'blocked',
      'Refused by design: peer resolved to loopback',
      "This is a fail-closed control working, not a fault. A cross-org handshake whose did:web resolves to a loopback origin is a same-process handshake in a did:web costume, so the playground refused before the handshake could be attempted with the peer's agent endpoint.",
      detail,
      bodyTruncated,
      status,
    );
  }

  if (status === 409 && parsed.detail?.startsWith('did:web origin mismatch')) {
    return view(
      'origin_mismatch',
      'blocked',
      'Refused by design: did:web origin mismatch',
      "This is a fail-closed control working, not a fault. The host named in the DID and the origin it resolved to disagree, so the playground refused before the handshake could be attempted with the peer's agent endpoint. Both values are named verbatim below.",
      detail,
      bodyTruncated,
      status,
    );
  }

  // Outcomes 6 and 7 are checked ahead of outcome 3 below. Every prefix here
  // is anchored (`startsWith`), so none of the three can collide with another
  // regardless of order — but 6 in particular is the one whose `detail`
  // embeds a peer-controlled response body verbatim, so putting it first
  // keeps "the peer's own bytes can never win an earlier, more generic row"
  // visible in the code, not just true of it.
  if (status === 502 && parsed.detail?.startsWith('handshake failed (')) {
    return view(
      'peer_rejected',
      'failed',
      'The peer answered and refused',
      `The peer's own status and response body are quoted below, unaltered. ${FLATTENED_502}`,
      detail,
      bodyTruncated,
      status,
    );
  }

  if (status === 502 && parsed.detail?.startsWith('handshake failed:')) {
    return view(
      'handshake_incomplete',
      'failed',
      'Handshake did not complete',
      `The handshake was attempted and did not finish; the reason the playground reported is quoted below. ${FLATTENED_502}`,
      detail,
      bodyTruncated,
      status,
    );
  }

  // The did:web GET itself is what failed here (`resolve_did_web` raised) —
  // an attempt was made, it just did not succeed. The handshake request to
  // the peer's agent endpoint was never sent, because there was no resolved
  // origin left to send it to.
  if (
    status === 502 &&
    parsed.detail?.startsWith('did:web resolution failed')
  ) {
    return view(
      'did_web_unresolvable',
      'failed',
      'did:web resolution failed',
      "The playground attempted to fetch the peer's DID document but the request failed or the document could not be parsed, so no peer origin was established and the handshake was never sent to the peer's agent endpoint.",
      detail,
      bodyTruncated,
      status,
    );
  }

  return view(
    'unclassified',
    'failed',
    `Handshake failed (HTTP ${status})`,
    'The console does not recognise this response, so it makes no claim about what happened. The body is shown below exactly as it arrived.',
    detail,
    bodyTruncated,
    status,
  );
}
