import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '@/test/test-utils';
import { C } from '@/lib/colors';
import { EventCard } from '@/components/runs/event-cards';
import type { HostedAgent, RunEvent } from '@/lib/types/playground';

const getMock = jest.fn();
const postMock = jest.fn();
const delMock = jest.fn();

/**
 * Only the three verb helpers are stubbed; the rest of the module — `ApiError`
 * above all — is spread in for real. That way these cases construct the
 * **genuine** error the client throws and exercise client → classifier →
 * banner end to end. A hand-rolled stand-in would let the thrown class and the
 * classifier drift apart with no test noticing.
 */
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  getJSON: (...args: unknown[]) => getMock(...args),
  postJSON: (...args: unknown[]) => postMock(...args),
  delJSON: (...args: unknown[]) => delMock(...args),
}));

import { ApiError, MAX_ERROR_BODY_CHARS } from '@/lib/api/client';
import { FederationView } from './federation-view';

const HANDSHAKE_PATH = '/api/playground/hosted-agents/h1/resolve-and-handshake';

/**
 * Detail strings captured from real responses of
 * `aitp_playground.api.hosted.resolve_and_handshake` (driven under
 * `fastapi.testclient`), not paraphrased from a table. Same fixtures as
 * `src/lib/federation-errors.test.ts`.
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

function agent(): HostedAgent {
  return {
    hosted_id: 'h1',
    agent_id: 'org-a',
    ref: 'federated/org-a@1.0.0',
    port: 9101,
    aid: 'aid:pubkey:orga',
    did: 'did:web:org-a.example.com',
    origin: 'https://org-a.example.com',
    manifest_url: 'https://org-a.example.com/.well-known/aitp-manifest',
    handshake_url: 'https://org-a.example.com/handshake',
    did_document_url: 'https://org-a.example.com/.well-known/did.json',
  };
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  delMock.mockReset();
  getMock.mockImplementation(async (url: string) => {
    if (url === '/api/playground/hosted-agents') return { hosted: [agent()] };
    throw new Error(`unexpected GET ${url}`);
  });
});

/** Expand the agent card, submit a handshake, and return the rendered banner. */
async function handshakeFailingWith(error: unknown): Promise<HTMLElement> {
  postMock.mockRejectedValue(error);
  const user = userEvent.setup();
  renderWithClient(<FederationView />);

  await screen.findByText('federated/org-a@1.0.0');
  await user.click(screen.getByRole('button', { name: /Handshake & invoke/i }));
  await user.type(
    screen.getByLabelText('peer_did'),
    'did:web:org-b.example.com',
  );
  await user.click(screen.getByRole('button', { name: 'Resolve & handshake' }));

  return await screen.findByRole('alert');
}

function fastapiError(
  status: number,
  detail: string,
  truncated = false,
): ApiError {
  return new ApiError('POST', HANDSHAKE_PATH, status, {
    text: JSON.stringify({ detail }),
    truncated,
  });
}

function rawError(
  status: number,
  text: string | undefined,
  truncated = false,
): ApiError {
  return new ApiError('POST', HANDSHAKE_PATH, status, { text, truncated });
}

/**
 * One `it` per outcome, each asserting the **visual treatment** (the colour
 * token the tone resolves to) and the **literal copy**, because the whole
 * point of this phase is that the seven no longer share one red banner.
 */
describe('handshake banner — the seven fail-closed outcomes', () => {
  it('1 · 404: names the stale list and stays out of red', async () => {
    const banner = await handshakeFailingWith(
      fastapiError(404, DETAIL.agentGone),
    );

    expect(banner).toHaveAttribute('data-outcome', 'agent_gone');
    expect(screen.getByText('Hosted agent not found')).toHaveStyle({
      color: C.blue,
    });
    expect(
      screen.getByText(
        "The playground has no hosted agent with this id, so nothing was attempted. The console's list is stale — refresh it and host the agent again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('HTTP 404')).toBeInTheDocument();
    expect(banner).toHaveTextContent(DETAIL.agentGone);
  });

  it('2 · 400: says only did:web is supported and that nothing was contacted', async () => {
    const banner = await handshakeFailingWith(
      fastapiError(400, DETAIL.notDidWeb),
    );

    expect(banner).toHaveAttribute('data-outcome', 'not_did_web');
    expect(screen.getByText('Only did:web peers are supported')).toHaveStyle({
      color: C.blue,
    });
    expect(
      screen.getByText(
        'The playground rejected the peer identifier before resolving anything. No DID document was fetched and no peer was contacted.',
      ),
    ).toBeInTheDocument();
    expect(banner).toHaveTextContent(DETAIL.notDidWeb);
  });

  it('3 · 502 resolution failure: claims nothing about the peer identity', async () => {
    const banner = await handshakeFailingWith(
      fastapiError(502, DETAIL.unresolvable),
    );

    expect(banner).toHaveAttribute('data-outcome', 'did_web_unresolvable');
    expect(screen.getByText('did:web resolution failed')).toHaveStyle({
      color: C.red,
    });
    expect(
      screen.getByText(
        "The playground attempted to fetch the peer's DID document but the request failed or the document could not be parsed, so no peer origin was established and the handshake was never sent to the peer's agent endpoint.",
      ),
    ).toBeInTheDocument();
    expect(banner).toHaveTextContent(
      '[Errno 8] nodename nor servname provided',
    );
  });

  it('4 · 409 loopback: reads as a control working, in amber, not as an error', async () => {
    const banner = await handshakeFailingWith(
      fastapiError(409, DETAIL.loopback),
    );

    expect(banner).toHaveAttribute('data-outcome', 'loopback_refused');
    const headline = screen.getByText(
      'Refused by design: peer resolved to loopback',
    );
    expect(headline).toHaveStyle({ color: C.amber });
    expect(headline).not.toHaveStyle({ color: C.red });
    expect(
      screen.getByText(
        "This is a fail-closed control working, not a fault. A cross-org handshake whose did:web resolves to a loopback origin is a same-process handshake in a did:web costume, so the playground refused before the handshake could be attempted with the peer's agent endpoint.",
      ),
    ).toBeInTheDocument();
    expect(banner).toHaveTextContent('http://127.0.0.1:9102');
  });

  it('5 · 409 origin mismatch: amber, and both disagreeing values are on screen', async () => {
    const banner = await handshakeFailingWith(
      fastapiError(409, DETAIL.originMismatch),
    );

    expect(banner).toHaveAttribute('data-outcome', 'origin_mismatch');
    expect(
      screen.getByText('Refused by design: did:web origin mismatch'),
    ).toHaveStyle({
      color: C.amber,
    });
    expect(
      screen.getByText(
        "This is a fail-closed control working, not a fault. The host named in the DID and the origin it resolved to disagree, so the playground refused before the handshake could be attempted with the peer's agent endpoint. Both values are named verbatim below.",
      ),
    ).toBeInTheDocument();
    expect(banner).toHaveTextContent('evil.example.com');
    expect(banner).toHaveTextContent('org-b.example.com');
  });

  it("6 · 502 peer refusal: quotes the peer's status and body, asserts no verdict", async () => {
    const banner = await handshakeFailingWith(
      fastapiError(502, DETAIL.peerRejected),
    );

    expect(banner).toHaveAttribute('data-outcome', 'peer_rejected');
    expect(screen.getByText('The peer answered and refused')).toHaveStyle({
      color: C.red,
    });
    // The peer's own words, verbatim — the only place they survive.
    expect(banner).toHaveTextContent('handshake failed (502)');
    expect(banner).toHaveTextContent('peer manifest verification failed');
    // …but the console's own sentence makes no verification claim of its own.
    expect(
      screen.getByText(/Every downstream status is flattened to 502/),
    ).toHaveTextContent(
      'The run timeline carries the trust events that name the cause.',
    );
  });

  it('7 · 502 incomplete handshake: says only that it did not finish', async () => {
    const banner = await handshakeFailingWith(
      fastapiError(502, DETAIL.unreachablePeer),
    );

    expect(banner).toHaveAttribute('data-outcome', 'handshake_incomplete');
    expect(screen.getByText('Handshake did not complete')).toHaveStyle({
      color: C.red,
    });
    expect(
      screen.getByText(/The handshake was attempted and did not finish/),
    ).toHaveTextContent(
      'The run timeline carries the trust events that name the cause.',
    );
    expect(banner).toHaveTextContent('All connection attempts failed');
  });
});

describe('handshake banner — honesty properties that hold across outcomes', () => {
  it.each([
    ['404', 404, DETAIL.agentGone],
    ['400', 400, DETAIL.notDidWeb],
    ['502 unresolvable', 502, DETAIL.unresolvable],
    ['409 loopback', 409, DETAIL.loopback],
    ['409 mismatch', 409, DETAIL.originMismatch],
    ['502 peer refused', 502, DETAIL.peerRejected],
    ['502 incomplete', 502, DETAIL.unreachablePeer],
  ] as const)(
    'never falls back to a bare stringified Error (%s)',
    async (_name, status, detail) => {
      const banner = await handshakeFailingWith(fastapiError(status, detail));

      expect(banner).not.toHaveTextContent(`Error: POST ${HANDSHAKE_PATH}`);
      expect(banner).not.toHaveTextContent('failed: ' + String(status));
    },
  );

  it.each([
    ['peer refused', DETAIL.peerRejected],
    ['handshake incomplete', DETAIL.unreachablePeer],
  ] as const)(
    'claims no verification verdict on a 502 (%s)',
    async (_name, detail) => {
      const banner = await handshakeFailingWith(fastapiError(502, detail));

      // Scoped to the console's own copy via stable test ids — the `<pre>`
      // quoting the upstream may legitimately contain those words, and
      // dropping them would be worse. DOM-position traversal (`firstElementChild`
      // / `nextElementSibling`) would silently mis-target if another element
      // were ever inserted into the banner ahead of these two.
      const headline = within(banner).getByTestId('handshake-banner-headline');
      const body = within(banner).getByTestId('handshake-banner-body');
      expect(`${headline.textContent} ${body.textContent}`).not.toMatch(
        /manifest|verif/i,
      );
    },
  );

  it('labels a truncated body as incomplete rather than showing it as whole', async () => {
    const banner = await handshakeFailingWith(
      rawError(
        502,
        `{"detail": "handshake failed (502): ${'z'.repeat(460)}`,
        true,
      ),
    );

    // Asserted against the live constant, not a hardcoded "500", so this
    // fails if the copy and `MAX_ERROR_BODY_CHARS` ever drift apart.
    expect(banner).toHaveTextContent(
      `Cut off at ${MAX_ERROR_BODY_CHARS} characters — this is not the complete response.`,
    );
  });
});

describe('handshake banner — the shapes that are not playground HTTPExceptions', () => {
  it("reads this console's proxy timeout as unknown, not as a peer outcome", async () => {
    const banner = await handshakeFailingWith(
      rawError(
        504,
        JSON.stringify({
          error: 'Upstream timeout',
          target: 'x',
          upstream_status: 504,
        }),
      ),
    );

    expect(banner).toHaveAttribute('data-outcome', 'console_proxy_timeout');
    expect(
      screen.getByText('Playground did not answer in time'),
    ).toBeInTheDocument();
  });

  it("does not read the proxy's own 502 as a peer that refused", async () => {
    const banner = await handshakeFailingWith(
      rawError(
        502,
        JSON.stringify({
          error: 'Upstream unreachable',
          target: 'x',
          upstream_status: 502,
        }),
      ),
    );

    expect(banner).toHaveAttribute('data-outcome', 'console_proxy_unreachable');
    expect(screen.getByText('Playground unreachable')).toBeInTheDocument();
  });

  it("renders playground's {error:{code,message}} without [object Object]", async () => {
    const banner = await handshakeFailingWith(
      rawError(
        404,
        JSON.stringify({
          error: { code: 'run_not_found', message: 'no run r1' },
        }),
      ),
    );

    expect(banner).toHaveAttribute('data-outcome', 'playground_error');
    expect(banner).not.toHaveTextContent('[object Object]');
    expect(screen.getByText('no run r1')).toBeInTheDocument();
  });

  it('degrades an unrecognised body to an honest raw render', async () => {
    const banner = await handshakeFailingWith(
      rawError(500, '<html><body>500 Internal Server Error</body></html>'),
    );

    expect(banner).toHaveAttribute('data-outcome', 'unclassified');
    expect(screen.getByText('Handshake failed (HTTP 500)')).toBeInTheDocument();
    expect(banner).toHaveTextContent('500 Internal Server Error');
  });

  it('reports a request that never got a response as an unknown outcome', async () => {
    const banner = await handshakeFailingWith(new Error('Timeout'));

    expect(banner).toHaveAttribute('data-outcome', 'no_response');
    expect(screen.getByText('No response')).toBeInTheDocument();
    expect(screen.queryByText(/^HTTP /)).not.toBeInTheDocument();
  });
});

describe('handshake banner — scope', () => {
  it('renders nothing before a handshake has failed', async () => {
    const user = userEvent.setup();
    renderWithClient(<FederationView />);
    await screen.findByText('federated/org-a@1.0.0');
    await user.click(
      screen.getByRole('button', { name: /Handshake & invoke/i }),
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('leaves the generic banner in place for the stop path', async () => {
    delMock.mockRejectedValue(
      new ApiError('DELETE', '/api/playground/hosted-agents/h1', 404, {
        text: '{"detail":"no hosted agent h1"}',
        truncated: false,
      }),
    );
    const user = userEvent.setup();
    renderWithClient(<FederationView />);
    await screen.findByText('federated/org-a@1.0.0');
    await user.click(screen.getByRole('button', { name: /Stop federated/i }));

    // The old flattened rendering, unchanged: this phase scopes to handshake.
    await screen.findByText(
      'Error: DELETE /api/playground/hosted-agents/h1 failed: 404 — {"detail":"no hosted agent h1"}',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

/**
 * Finalization-pass addition: the plan's own Phase 5 Approach section calls
 * this the "real payoff of doing Phases 3 and 5 in the same plan" — a 502
 * here (outcome 6, `peer_rejected`) is produced by exactly the same
 * underlying event as a `manifest.verify_failed` run-timeline card
 * (`agent_admin.py`'s admin endpoint 502s "for anything a downstream peer
 * did", per `federation-errors.ts`'s own doc comment, and the peer's
 * verification failure is what the run's `manifest.verify_failed` event
 * reports). Every existing test above checks the banner's *negative*
 * property in isolation ("claims no verification verdict on a 502") — none
 * of them render the timeline card the banner defers to, for the same
 * scenario, to confirm the deferral actually resolves to something and the
 * two surfaces do not talk past or contradict each other.
 */
describe('handshake banner + run timeline — the same underlying failure, told honestly on both surfaces', () => {
  it('a peer manifest rejection: the banner defers, the timeline card supplies the verdict, and neither restates the other', async () => {
    // 1) The federation surface: the peer's admin endpoint 502'd because the
    //    peer's own manifest failed verification. This is real outcome 6
    //    (`DETAIL.peerRejected`, the same fixture the other tests in this
    //    file use), captured from playground's actual router.
    const banner = await handshakeFailingWith(
      fastapiError(502, DETAIL.peerRejected),
    );
    expect(banner).toHaveAttribute('data-outcome', 'peer_rejected');
    const headline = within(banner).getByTestId('handshake-banner-headline');
    const body = within(banner).getByTestId('handshake-banner-body');
    // The banner asserts no verdict of its own — this is the property the
    // existing "claims no verification verdict on a 502" test already pins,
    // repeated here as the premise the rest of this test depends on.
    expect(`${headline.textContent} ${body.textContent}`).not.toMatch(
      /manifest|verif/i,
    );
    expect(body.textContent).toContain(
      'The run timeline carries the trust events that name the cause.',
    );

    // 2) The run timeline: the REAL `manifest.verify_failed` card (Phase 3's
    //    production component, not a stand-in) for the same underlying
    //    failure — a peer whose manifest's signature did not verify.
    const evt: RunEvent = {
      type: 'manifest.verify_failed',
      ts: 0,
      cause: 'signature_invalid',
      source_url: 'https://org-b.example.com/.well-known/aitp-manifest',
      agent_id: 'org-a',
    };
    const { container: timeline } = render(<EventCard evt={evt} />);

    // The timeline is where the actual cause lives, exactly as the banner
    // said it would be.
    expect(within(timeline).getByText('MANIFEST REJECTED')).toHaveStyle({
      color: C.red,
    });
    expect(timeline).toHaveTextContent(
      'verification failed (signature_invalid)',
    );

    // 3) Coherence: each surface stays inside what it actually knows, and
    //    neither one repeats — or contradicts — the other's claim.
    //    The banner never states the specific verdict only the timeline
    //    established...
    expect(banner).not.toHaveTextContent('MANIFEST REJECTED');
    expect(banner).not.toHaveTextContent('signature_invalid');
    //    ...and the timeline card, which knows nothing about the handshake
    //    or the peer's reachability, makes no claim about either.
    expect(timeline).not.toHaveTextContent(/handshake/i);
    expect(timeline).not.toHaveTextContent(/peer/i);
  });
});
