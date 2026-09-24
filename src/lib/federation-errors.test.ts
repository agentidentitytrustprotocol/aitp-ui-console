import { ApiError } from './api/client';
import { C } from './colors';
import {
  classifyFederationError,
  parseFederationErrorBody,
  type FederationErrorView,
  type FederationOutcome,
} from './federation-errors';

/**
 * Every `detail` string in this file was **copied out of a real response**,
 * not paraphrased from a table. They were produced by driving
 * `aitp_playground.api.hosted.router` under `fastapi.testclient` with the
 * hosted-agent manager dependency-overridden, `resolve_did_web` patched per
 * case, and a throwaway `http.server.HTTPServer` standing in for the agent's
 * `/admin/initiate-handshake` endpoint. The 422 and `PlaygroundError` shapes
 * came from the same run.
 *
 * If playground rewords one of these, the matching row here stops matching and
 * the outcome degrades to `unclassified` — which is the designed behaviour, so
 * update this file from a fresh capture rather than loosening the matcher.
 */
const DETAIL = {
  agentGone: 'no hosted agent h1',
  notDidWeb: 'only did:web peers supported, got did:key:zabc',
  unresolvable:
    'did:web resolution failed for did:web:nonexistent-host-aitp-test.invalid: [Errno 8] nodename nor servname provided, or not known',
  loopback:
    'refusing cross-domain handshake: did:web:org-b.example.com resolved to a loopback origin (http://127.0.0.1:9102); expected a real remote origin',
  originMismatch:
    "did:web origin mismatch: did:web:org-b.example.com resolved to 'evil.example.com', expected 'org-b.example.com'",
  peerRejected:
    'handshake failed (502): {"detail": "peer manifest verification failed"}',
  unreachablePeer: 'handshake failed: All connection attempts failed',
} as const;

const PATH = '/api/playground/hosted-agents/h1/resolve-and-handshake';

function fastapi(status: number, detail: unknown, truncated = false): ApiError {
  return new ApiError('POST', PATH, status, {
    text: JSON.stringify({ detail }),
    truncated,
  });
}

function rawBody(
  status: number,
  text: string | undefined,
  truncated = false,
): ApiError {
  return new ApiError('POST', PATH, status, { text, truncated });
}

function classify(error: unknown): FederationErrorView {
  const result = classifyFederationError(error);
  if (!result) throw new Error('expected a classified view');
  return result;
}

describe('classifyFederationError — the seven playground outcomes', () => {
  const rows: Array<{
    name: string;
    error: ApiError;
    outcome: FederationOutcome;
    color: string;
    detail: string;
  }> = [
    {
      name: '1 · 404 → the hosted agent is gone',
      error: fastapi(404, DETAIL.agentGone),
      outcome: 'agent_gone',
      color: C.blue,
      detail: DETAIL.agentGone,
    },
    {
      name: '2 · 400 → the peer is not a did:web',
      error: fastapi(400, DETAIL.notDidWeb),
      outcome: 'not_did_web',
      color: C.blue,
      detail: DETAIL.notDidWeb,
    },
    {
      name: '3 · 502 + "did:web resolution failed" → nothing resolved',
      error: fastapi(502, DETAIL.unresolvable),
      outcome: 'did_web_unresolvable',
      color: C.red,
      detail: DETAIL.unresolvable,
    },
    {
      name: '4 · 409 + "resolved to a loopback origin" → refused by design',
      error: fastapi(409, DETAIL.loopback),
      outcome: 'loopback_refused',
      color: C.amber,
      detail: DETAIL.loopback,
    },
    {
      name: '5 · 409 + "did:web origin mismatch" → refused by design',
      error: fastapi(409, DETAIL.originMismatch),
      outcome: 'origin_mismatch',
      color: C.amber,
      detail: DETAIL.originMismatch,
    },
    {
      name: '6 · 502 + "handshake failed (" → the peer answered and refused',
      error: fastapi(502, DETAIL.peerRejected),
      outcome: 'peer_rejected',
      color: C.red,
      detail: DETAIL.peerRejected,
    },
    {
      name: '7 · 502 + "handshake failed:" → the handshake did not complete',
      error: fastapi(502, DETAIL.unreachablePeer),
      outcome: 'handshake_incomplete',
      color: C.red,
      detail: DETAIL.unreachablePeer,
    },
  ];

  it.each(rows)('$name', ({ error, outcome, color, detail }) => {
    const v = classify(error);
    expect(v.outcome).toBe(outcome);
    expect(v.color).toBe(color);
    // The upstream's own words survive verbatim in every single outcome.
    expect(v.detail).toBe(detail);
    expect(v.headline).not.toBe('');
    expect(v.body).not.toBe('');
  });

  it('classifies all seven distinctly — no two collapse onto one outcome', () => {
    const outcomes = rows.map((r) => classify(r.error).outcome);
    expect(new Set(outcomes).size).toBe(7);
  });

  it('reads the two fail-closed refusals as controls working, not as errors', () => {
    expect(classify(fastapi(409, DETAIL.loopback)).tone).toBe('blocked');
    expect(classify(fastapi(409, DETAIL.originMismatch)).tone).toBe('blocked');
    // …and never red, which is what trains an operator to dismiss them.
    expect(classify(fastapi(409, DETAIL.loopback)).color).not.toBe(C.red);
    expect(classify(fastapi(409, DETAIL.originMismatch)).color).not.toBe(C.red);
  });

  it('treats the 404 and the 400 as "nothing was attempted", not as failures', () => {
    expect(classify(fastapi(404, DETAIL.agentGone)).tone).toBe('input');
    expect(classify(fastapi(400, DETAIL.notDidWeb)).tone).toBe('input');
  });
});

/**
 * Outcome 6 embeds the peer's own response body verbatim
 * (`hosted.py:175-177`: `detail: f"handshake failed ({status}): {body}"`).
 * A peer is free to make its body say anything it likes — including another
 * outcome's marker text — and the classifier must not let that flip which
 * outcome this response is read as. Before this fix the checks used
 * `.includes(...)`, in an order that put outcome 3's marker
 * (`"did:web resolution failed"`) ahead of outcome 6's own. An `.includes`
 * check does not care *where* a substring sits, so a 502 whose peer-supplied
 * body happened to contain the literal text `"did:web resolution failed"`
 * would match outcome 3 first and never even reach outcome 6's check — even
 * though the peer was genuinely contacted and genuinely answered. Anchoring
 * every check on `startsWith` fixes this unconditionally: outcome 6's real
 * `detail` always *starts with* `"handshake failed ("`, never with
 * `"did:web resolution failed"`, no matter what the peer's body contains.
 */
describe('outcome 6 is immune to peer-controlled body text colliding with another marker', () => {
  it("classifies a 502 whose quoted peer body contains outcome 3's marker as peer_rejected, not did_web_unresolvable", () => {
    const adversarialDetail =
      'handshake failed (502): {"detail": "did:web resolution failed for something"}';
    const v = classify(fastapi(502, adversarialDetail));

    expect(v.outcome).toBe('peer_rejected');
    expect(v.outcome).not.toBe('did_web_unresolvable');
    expect(v.headline).toBe('The peer answered and refused');
    // The peer's own words still survive verbatim — quoting them is honest;
    // being fooled by them into a wrong outcome label is not.
    expect(v.detail).toBe(adversarialDetail);
  });
});

/**
 * `agent_admin.py:110-119` is explicit that the agent's admin endpoint raises
 * 502 for anything a downstream peer did, and that `hosted.py` flattens any
 * status from that route back to 502 — "the `manifest.verify_failed` event's
 * `cause` field is the channel that survives". So a 502 here genuinely cannot
 * tell "the peer's manifest failed verification" from "the peer was
 * unreachable", and none of this module's own copy may imply that it can.
 *
 * Scoped to `headline` + `body`, deliberately: `detail` is the upstream's
 * verbatim text and may well contain those words (row 6's fixture does).
 * Quoting the peer is honest; asserting a verdict in our own voice is not.
 */
describe('no 502 copy asserts a verification verdict', () => {
  const fiveOhTwos: Array<[string, ApiError]> = [
    ['did:web unresolvable', fastapi(502, DETAIL.unresolvable)],
    ['peer rejected', fastapi(502, DETAIL.peerRejected)],
    ['handshake incomplete', fastapi(502, DETAIL.unreachablePeer)],
    [
      'proxy unreachable',
      rawBody(502, JSON.stringify({ error: 'Upstream unreachable' })),
    ],
    ['unclassified 502', fastapi(502, 'something else entirely')],
  ];

  it.each(fiveOhTwos)(
    '%s says nothing about manifests or verification',
    (_name, error) => {
      const v = classify(error);
      const ours = `${v.headline} ${v.body}`;
      expect(ours).not.toMatch(/manifest/i);
      expect(ours).not.toMatch(/verif/i);
    },
  );

  it('points the operator at the run timeline instead of guessing', () => {
    expect(classify(fastapi(502, DETAIL.peerRejected)).body).toMatch(
      /run timeline/,
    );
    expect(classify(fastapi(502, DETAIL.unreachablePeer)).body).toMatch(
      /run timeline/,
    );
  });

  it('still surfaces the peer’s own status and body for outcome 6', () => {
    // The peer's words are the only thing that survived; losing them would
    // leave the operator with strictly less than the old generic banner gave.
    expect(classify(fastapi(502, DETAIL.peerRejected)).detail).toContain('502');
    expect(classify(fastapi(502, DETAIL.peerRejected)).detail).toContain(
      'peer manifest verification failed',
    );
  });
});

describe('the other two error-body shapes', () => {
  it("reads this console's own proxy 504 as a timeout, not as a peer outcome", () => {
    const v = classify(
      rawBody(
        504,
        JSON.stringify({
          error: 'Upstream timeout',
          target:
            'http://localhost:8000/hosted-agents/h1/resolve-and-handshake',
          upstream_status: 504,
        }),
      ),
    );
    expect(v.outcome).toBe('console_proxy_timeout');
    expect(v.body).toMatch(
      /could have completed upstream|may have completed upstream/,
    );
  });

  it("does not mistake the proxy's own 502 for a peer that refused", () => {
    const v = classify(
      rawBody(
        502,
        JSON.stringify({
          error: 'Upstream unreachable',
          target:
            'http://localhost:8000/hosted-agents/h1/resolve-and-handshake',
          upstream_status: 502,
        }),
      ),
    );
    expect(v.outcome).toBe('console_proxy_unreachable');
    expect(v.outcome).not.toBe('peer_rejected');
  });

  it('does not attribute a string `error` body at some other status to the proxy', () => {
    // `makeError` is only ever called with 504 or 502. Anything else carrying
    // a string `error` came from somewhere this module cannot name.
    const v = classify(
      rawBody(500, JSON.stringify({ error: 'something else' })),
    );
    expect(v.outcome).toBe('unclassified');
    expect(v.detail).toBe('{"error":"something else"}');
  });

  it("does not attribute src/proxy.ts's CSRF-guard 403 to the BFF proxy's shape, either", () => {
    // `src/proxy.ts` (the Next 16 root middleware guarding
    // `/api/playground/:path*`) rejects a cross-site mutation with
    // `{error: 'Cross-site request rejected', code: 'csrf_blocked'}` at 403 —
    // a *fifth* body shape, produced by a layer above `src/lib/api/proxy.ts`'s
    // BFF route entirely. Its `error` field is a string, so it parses as
    // `proxyError` exactly like shape 2 (they share a discriminator, not an
    // origin), but the classifier's proxy branches are gated on status
    // (504/502 only) as well as shape, so 403 must fall through to the honest
    // raw render rather than being mislabelled as either proxy outcome — and
    // certainly never as `[object Object]`.
    const v = classify(
      rawBody(
        403,
        JSON.stringify({
          error: 'Cross-site request rejected',
          code: 'csrf_blocked',
        }),
      ),
    );
    expect(v.outcome).toBe('unclassified');
    expect(v.outcome).not.toBe('console_proxy_timeout');
    expect(v.outcome).not.toBe('console_proxy_unreachable');
    expect(v.detail).toBe(
      '{"error":"Cross-site request rejected","code":"csrf_blocked"}',
    );
    expect(`${v.headline} ${v.body} ${v.detail}`).not.toContain(
      '[object Object]',
    );
  });

  it("renders playground's {error:{code,message}} envelope without [object Object]", () => {
    const v = classify(
      rawBody(
        404,
        JSON.stringify({
          error: { code: 'run_not_found', message: 'no run r1' },
        }),
      ),
    );
    expect(v.outcome).toBe('playground_error');
    expect(v.headline).toContain('run_not_found');
    expect(v.body).toBe('no run r1');
    expect(`${v.headline} ${v.body} ${v.detail}`).not.toContain(
      '[object Object]',
    );
    // Key presence would have matched the proxy branch and stringified an
    // object; the discriminator is the TYPE of `error`.
    expect(v.outcome).not.toBe('console_proxy_unreachable');
  });
});

describe('shapes that must degrade honestly rather than mislabel', () => {
  it("does not read FastAPI's 422 detail ARRAY as a classifiable string", () => {
    const v = classify(
      fastapi(422, [
        {
          type: 'missing',
          loc: ['body', 'peer_did'],
          msg: 'Field required',
          input: {},
        },
      ]),
    );
    expect(v.outcome).toBe('unclassified');
    expect(`${v.headline} ${v.body} ${v.detail}`).not.toContain(
      '[object Object]',
    );
    expect(v.detail).toContain('Field required');
  });

  it('falls back to the raw text for a non-JSON body', () => {
    const v = classify(
      rawBody(502, '<html><body>502 Bad Gateway</body></html>'),
    );
    expect(v.outcome).toBe('unclassified');
    expect(v.detail).toBe('<html><body>502 Bad Gateway</body></html>');
  });

  it('falls back for a JSON body cut mid-token by the 500-char slice', () => {
    const v = classify(
      rawBody(502, '{"detail": "handshake failed (502): {\\"det', true),
    );
    expect(v.outcome).toBe('unclassified');
    expect(v.detailTruncated).toBe(true);
  });

  it('names the status for an unknown 500 and claims nothing about it', () => {
    const v = classify(fastapi(500, 'internal error'));
    expect(v.outcome).toBe('unclassified');
    expect(v.headline).toContain('500');
    expect(v.body).toMatch(/does not recognise/);
  });

  it('degrades when a recognised status carries an unrecognised detail prefix', () => {
    // Playground rewording a message must cost fidelity, never accuracy.
    expect(
      classify(fastapi(409, 'some new fail-closed rule fired')).outcome,
    ).toBe('unclassified');
    expect(classify(fastapi(502, 'brand new failure mode')).outcome).toBe(
      'unclassified',
    );
    expect(classify(fastapi(400, 'some other bad request')).outcome).toBe(
      'unclassified',
    );
  });

  it('does not claim the hosted agent is gone for a 404 it cannot attribute', () => {
    // A 404 reaching here need not be playground's "no hosted agent" — a
    // missing console route or an intermediary produces one too, and saying
    // "refresh the list" about those would be a mislabel.
    const html = classify(
      rawBody(404, '<html><title>404 Not Found</title></html>'),
    );
    expect(html.outcome).toBe('unclassified');
    expect(html.outcome).not.toBe('agent_gone');
    expect(classify(fastapi(404, 'Not Found')).outcome).toBe('unclassified');
  });

  it('renders a styled, labelled view for an empty body — never a bare dump', () => {
    const v = classify(rawBody(500, undefined));
    expect(v.outcome).toBe('unclassified');
    expect(v.detail).toBeUndefined();
    expect(v.headline).not.toBe('');
    expect(v.color).toBe(C.red);
  });
});

describe('truncation and non-response errors', () => {
  it('carries the truncation flag through so a cut body is not shown as complete', () => {
    const long = 'x'.repeat(600);
    const v = classify(
      rawBody(502, `handshake failed (502): ${long}`.slice(0, 500), true),
    );
    expect(v.detailTruncated).toBe(true);
  });

  it('marks an untruncated body as complete', () => {
    expect(classify(fastapi(409, DETAIL.loopback)).detailTruncated).toBe(false);
  });

  it('treats a non-ApiError as "no response", with an unknown outcome', () => {
    const v = classify(new Error('Timeout'));
    expect(v.outcome).toBe('no_response');
    expect(v.status).toBeUndefined();
    expect(v.body).toMatch(/no known outcome/);
    expect(v.detail).toBe('Timeout');
  });

  it('handles a thrown non-Error without producing [object Object]', () => {
    const v = classify('kaboom');
    expect(v.outcome).toBe('no_response');
    expect(v.detail).toBe('kaboom');
    expect(`${v.headline} ${v.body} ${v.detail}`).not.toContain(
      '[object Object]',
    );
  });

  it('returns null for a falsy error so the caller renders nothing', () => {
    expect(classifyFederationError(null)).toBeNull();
    expect(classifyFederationError(undefined)).toBeNull();
  });
});

describe('parseFederationErrorBody', () => {
  it('returns an empty parse for an absent body', () => {
    expect(parseFederationErrorBody(undefined)).toEqual({});
    expect(parseFederationErrorBody('')).toEqual({});
  });

  it('discriminates the two `error` shapes on type, not key presence', () => {
    expect(
      parseFederationErrorBody('{"error":"Upstream timeout"}').proxyError,
    ).toBe('Upstream timeout');
    expect(
      parseFederationErrorBody('{"error":"Upstream timeout"}').playgroundError,
    ).toBeUndefined();
    expect(
      parseFederationErrorBody('{"error":{"code":"c","message":"m"}}')
        .playgroundError,
    ).toEqual({ code: 'c', message: 'm' });
    expect(
      parseFederationErrorBody('{"error":{"code":"c","message":"m"}}')
        .proxyError,
    ).toBeUndefined();
  });

  it('survives a JSON null, a bare array and a JSON scalar', () => {
    expect(parseFederationErrorBody('null')).toEqual({ raw: 'null' });
    expect(parseFederationErrorBody('[1,2]')).toEqual({ raw: '[1,2]' });
    expect(parseFederationErrorBody('"just a string"')).toEqual({
      raw: '"just a string"',
    });
  });

  it('fills in a missing code/message on the playground envelope', () => {
    const parsed = parseFederationErrorBody('{"error":{"detail":"odd"}}');
    expect(parsed.playgroundError?.code).toBe('unknown');
    expect(parsed.playgroundError?.message).toBe('{"detail":"odd"}');
  });
});
