import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  EventCard,
  StepOutputCard,
  TrustFlowCard,
  manifestVerifyFailedVerdict,
  revocationVerifyFailedVerdict,
} from './event-cards';
import { C } from '@/lib/colors';
import type { RunEvent } from '@/lib/types/playground';

const aid = 'aid:pubkey:A7mK9xP2nR4vQ8sL3tW6uY1jC5bE0fH';

/** A run's time base, in the shape the wire actually uses: playground stamps
 *  every `ts` as **epoch seconds** (a `time.time()` float), so every fixture
 *  in this file is an absolute second-scale value and every offset is a delta
 *  against a base. `1_774_000_000` is 2026-03-20T09:46:40Z — the same order of
 *  magnitude as the values `CAPTURED_FRAMES` below carries off a live run.
 *  Millisecond-shaped fixtures (`ts: 1_500`) are what hid the unit bug: they
 *  render plausibly under *either* reading. */
const BASE_TS = 1_774_000_000;

function evt(overrides: Partial<RunEvent> & { type: string }): RunEvent {
  return { ts: BASE_TS + 1.5, ...overrides };
}

describe('formatOffset (via the rendered timestamp)', () => {
  // agent.ready is the simplest card that shows the offset in the line.
  it.each([
    [0, '+0ms'],
    [0.999, '+999ms'],
    [1, '+1.0s'],
    [59.999, '+60.0s'],
    [60, '+1.0m'],
    [90, '+1.5m'],
    // Negative deltas are real, not defensive padding: the orchestrator and
    // the agent subprocesses each stamp `time.time()` in their own process,
    // so skew can place an agent event just before the run's first event.
    // Rendered with a sign rather than flipped or clamped.
    [-0.012, '-12ms'],
    [-1.5, '-1.5s'],
    [-90, '-1.5m'],
  ])('renders an event %f seconds from the base as %s', (delta, expected) => {
    render(
      <EventCard
        evt={evt({ type: 'agent.ready', ts: BASE_TS + delta, agent_id: 'a' })}
        baseTs={BASE_TS}
      />,
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('renders no offset at all when the base is not known yet', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'agent.ready', agent_id: 'a' })} />,
    );
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/[+-]\d/);
    expect(container).not.toHaveTextContent('NaN');
  });

  it('rounds a hair-under-a-second delta to a four-digit `+1000ms`, not `+1.0s`', () => {
    // The sub-second branch is chosen on the *unrounded* delta and only then
    // rounded, so the 0.5ms-wide window [999.5ms, 1000ms) prints `+1000ms`.
    // Pinned deliberately rather than "fixed": the string is truthful (the
    // event really is 1000ms from the base, to the precision shown), and the
    // two ways to make it roll over both cost more than the tidiness is worth
    // — rounding before the comparison would make `+1.0s` claim a precision
    // the branch thresholds no longer match, and a special case for one
    // half-millisecond window is code nobody can maintain a reason for. If a
    // reviewer prefers the rollover, this test is the one line to change.
    render(
      <EventCard
        evt={evt({ type: 'agent.ready', ts: BASE_TS + 0.9996, agent_id: 'a' })}
        baseTs={BASE_TS}
      />,
    );
    expect(screen.getByText('+1000ms')).toBeInTheDocument();
  });

  it('renders a sub-millisecond negative delta as `-0ms`, keeping the sign', () => {
    // 120µs of skew — under half a millisecond, so the magnitude rounds to 0,
    // but `sign` is taken from the raw delta and survives. Any negative delta
    // in (-0.5ms, 0) prints this.
    //
    // Pinned as correct, not tolerated: the ordering *was* inverted, by less
    // than the display can resolve, and deriving the sign from the rounded
    // magnitude instead (which would print `+0ms`) would quietly assert an
    // ordering the wire did not report. `-0ms` is also how a reader tells
    // "skew too small to show" from "exactly simultaneous".
    render(
      <EventCard
        evt={evt({ type: 'agent.ready', ts: BASE_TS - 0.00012, agent_id: 'a' })}
        baseTs={BASE_TS}
      />,
    );
    expect(screen.getByText('-0ms')).toBeInTheDocument();
  });
});

describe('run-relative offsets (regression: `ts` is epoch seconds, not ms-since-start)', () => {
  // This is the test that would have caught the original bug. `formatOffset`
  // used to be called with the raw `evt.ts`, i.e. it read playground's
  // absolute epoch stamp as "milliseconds since the run started".
  it('derives the offset from a realistic epoch-second pair', () => {
    const { container } = render(
      <EventCard
        evt={evt({ type: 'agent.ready', ts: BASE_TS + 1.5, agent_id: 'researcher' })}
        baseTs={BASE_TS}
      />,
    );
    expect(screen.getByText('+1.5s')).toBeInTheDocument();
    // What the pre-fix code rendered for exactly this frame.
    expect(container).not.toHaveTextContent('+29566.7m');
  });

  it('gives two real captured frames from one run two different, run-scale offsets', () => {
    // Real values, same run (`run-7f3c`), from CAPTURED_FRAMES below.
    const base = 1790199933.127181; // revocation.verify_failed, the earliest
    for (const [ts, expected] of [
      [1790199933.21171, '+85ms'], // delegation.redeemed (site 3)
      [1790200010.383384, '+1.3m'], // delegation.issued
      [1790200028.6396348, '+1.6m'], // manifest.verify_failed
    ] as const) {
      const { unmount } = render(
        <EventCard evt={evt({ type: 'agent.ready', ts, agent_id: 'a' })} baseTs={base} />,
      );
      expect(screen.getByText(expected)).toBeInTheDocument();
      // The pre-fix reading collapsed all three of these — and every other
      // event in that run — onto the same string, because an epoch stamp read
      // as milliseconds is ~20.7 days no matter when in the run it was taken.
      expect(screen.queryByText('+29836.7m')).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe('EventCard type switch', () => {
  it('run.started shows the scenario ref badge', () => {
    const { container } = render(
      // A base IS supplied here, so the "no offset on this card" assertion
      // below stays a real one rather than passing because nothing could
      // render an offset.
      <EventCard evt={evt({ type: 'run.started', scenario_ref: 'demo/hello@1' })} baseTs={BASE_TS} />,
    );
    expect(screen.getByText('Scenario run started')).toBeInTheDocument();
    expect(screen.getByText('demo/hello@1')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('+1.5s'); // no offset on this card
  });

  it('agent.spawning shows the agent, notes and a spinner', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'agent.spawning', agent_id: 'researcher', notes: 'crewai' })} />,
    );
    expect(container).toHaveTextContent('Spawning researcher (crewai)');
    expect(container.querySelector('svg[data-icon="Loader"]')).not.toBeNull();
    expect(container.querySelector('.pulse')).not.toBeNull();
  });

  it('agent.ready shows name, port and aid', () => {
    render(
      <EventCard evt={evt({ type: 'agent.ready', agent_id: 'researcher', port: 8100, aid })} />,
    );
    expect(screen.getByText('researcher')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByText(':8100')).toBeInTheDocument();
    // AidCell shortens the aid and keeps the full value as the title.
    expect(screen.getByTitle(aid)).toBeInTheDocument();
  });

  it('agent.ready without a port omits the port chip', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'agent.ready', agent_id: 'solo' })} />,
    );
    expect(container).not.toHaveTextContent(':8');
  });

  it('trust.peers_resolved counts the peers', () => {
    render(
      <EventCard
        evt={evt({ type: 'trust.peers_resolved', peers: { a: 'http://a', b: 'http://b' } })}
      />,
    );
    expect(screen.getByText('Peer manifest URLs resolved (2)')).toBeInTheDocument();
  });

  it('trust.peers_resolved tolerates missing peers', () => {
    render(<EventCard evt={evt({ type: 'trust.peers_resolved' })} />);
    expect(screen.getByText('Peer manifest URLs resolved (0)')).toBeInTheDocument();
  });

  it('trust.establishing names both parties with a pulsing dot', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'trust.establishing', initiator: 'writer', target: 'editor' })} />,
    );
    expect(container).toHaveTextContent('writer ⇒ editor: establishing trust…');
    expect(container.querySelector('.pulse')).not.toBeNull();
  });

  it('trust.established renders the handshake flow card with grants', () => {
    const { container } = render(
      <EventCard
        evt={evt({
          type: 'trust.established',
          initiator: 'writer',
          target: 'editor',
          grants: ['summarize.text', 'write.doc'],
          jti: 'jti-0123456789abcdefXYZ',
        })}
      />,
    );
    expect(screen.getByText('Trust established')).toBeInTheDocument();
    expect(screen.getByText('AITP MUTUAL HANDSHAKE')).toBeInTheDocument();
    for (const msg of ['MUTUAL_HELLO', 'MUTUAL_HELLO_ACK', 'MUTUAL_COMMIT', 'MUTUAL_COMMIT_ACK + TCT']) {
      expect(screen.getByText(msg)).toBeInTheDocument();
    }
    expect(screen.getByText('summarize.text')).toBeInTheDocument();
    expect(screen.getByText('write.doc')).toBeInTheDocument();
    // jti is shortened to 18 chars + ellipsis
    expect(container).toHaveTextContent('jti-0123456789abcd…');
  });

  it('step.started shows step id, capability and agent with the zap dot', () => {
    const { container } = render(
      <EventCard
        evt={evt({ type: 'step.started', step_id: 'write', capability: 'write.doc', agent: 'writer' })}
      />,
    );
    expect(container).toHaveTextContent('Step write');
    expect(screen.getByText('write.doc')).toBeInTheDocument();
    expect(screen.getByText('on writer')).toBeInTheDocument();
    expect(container.querySelector('svg[data-icon="Zap"]')).not.toBeNull();
  });

  it('step.probing_no_trust warns about the expected 403', () => {
    render(<EventCard evt={evt({ type: 'step.probing_no_trust' })} />);
    expect(screen.getByText('Probing without TCT → expect 403')).toBeInTheDocument();
  });

  it('step.access_denied renders the red denial card', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'step.access_denied', capability: 'secrets.read' })} />,
    );
    expect(screen.getByText('403 Access Denied')).toBeInTheDocument();
    expect(screen.getByText('secrets.read')).toBeInTheDocument();
    expect(container.querySelector('svg[data-icon="XCircle"]')).not.toBeNull();
  });

  it('llm.started shows the model from the payload', () => {
    const { container } = render(
      <EventCard
        evt={evt({ type: 'llm.started', agent_id: 'writer', payload: { model: 'gpt-4o' } })}
      />,
    );
    expect(container).toHaveTextContent('writer calling gpt-4o…');
  });

  it('llm.started falls back to "LLM" when the model is not a string', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'llm.started', agent: 'writer', payload: { model: 42 } })} />,
    );
    expect(container).toHaveTextContent('writer calling LLM…');
  });

  it('llm.complete shows the token count when present', () => {
    const { container } = render(
      <EventCard
        evt={evt({ type: 'llm.complete', agent_id: 'writer', payload: { tokens_used: 1234 } })}
      />,
    );
    expect(container).toHaveTextContent('writer ✓ LLM call complete');
    expect(screen.getByText('1234 tokens')).toBeInTheDocument();
  });

  it('llm.complete omits the token chip without payload', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'llm.complete', agent_id: 'writer' })} />,
    );
    expect(container).not.toHaveTextContent('tokens');
  });

  it('step.complete shows the completion line and output card', () => {
    render(
      <EventCard
        evt={evt({ type: 'step.complete', step_id: 'write', agent: 'writer', result: { out: 'x' } })}
      />,
    );
    expect(screen.getByText('Step complete: write')).toBeInTheDocument();
    expect(screen.getByText(/STEP COMPLETE ·/)).toBeInTheDocument();
  });

  it('run.complete shows total elapsed seconds, measured from the run base', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'run.complete', ts: BASE_TS + 5 })} baseTs={BASE_TS} />,
    );
    expect(screen.getByText('Run complete')).toBeInTheDocument();
    expect(container).toHaveTextContent('Total elapsed: 5.0s');
    // Pre-fix this was `evt.ts / 1000` — 1774000.0s for this frame.
    expect(container).not.toHaveTextContent('1774000.0s');
  });

  it('run.complete says the elapsed time is unknown rather than inventing one', () => {
    const { container } = render(<EventCard evt={evt({ type: 'run.complete' })} />);
    expect(container).toHaveTextContent('Total elapsed: —');
    expect(container).not.toHaveTextContent('NaN');
  });

  it('run.failed shows the error text', () => {
    render(<EventCard evt={evt({ type: 'run.failed', error: 'agent crashed on boot' })} />);
    expect(screen.getByText('Run failed')).toBeInTheDocument();
    expect(screen.getByText('agent crashed on boot')).toBeInTheDocument();
  });

  it('unknown event types fall back to the generic mono row instead of being dropped', () => {
    render(<EventCard evt={evt({ type: 'cp.webhook.delivered' })} baseTs={BASE_TS} />);
    const row = screen.getByText('cp.webhook.delivered');
    expect(row).toBeInTheDocument();
    expect(row).toHaveClass('mono');
    expect(screen.getByText('+1.5s')).toBeInTheDocument();
  });
});

describe('StepOutputCard', () => {
  const base = { type: 'step.complete', ts: BASE_TS + 2, step_id: 'draft', agent: 'writer' };

  it('renders nothing when there is no result', () => {
    const { container } = render(<StepOutputCard evt={{ ...base, result: undefined }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is collapsed until clicked, then shows primitive values as plain text', async () => {
    const user = userEvent.setup();
    render(<StepOutputCard evt={{ ...base, result: { summary: 'all good' } }} />);

    expect(screen.queryByText('all good')).not.toBeInTheDocument();
    await user.click(screen.getByText(/STEP COMPLETE ·/));

    const value = screen.getByText('all good');
    expect(value).toBeInTheDocument();
    expect(value).not.toHaveClass('mono'); // primitive branch
    expect(screen.getByText('summary')).toBeInTheDocument(); // uppercased via CSS only
  });

  it('pretty-prints object values as mono JSON', async () => {
    const user = userEvent.setup();
    render(
      <StepOutputCard evt={{ ...base, result: { data: { score: 9, tags: ['a'] } } }} />,
    );
    await user.click(screen.getByText(/STEP COMPLETE ·/));

    const json = screen.getByText((_, el) => {
      return el?.className === 'mono' && (el?.textContent ?? '').includes('"score": 9');
    });
    expect(json.textContent).toBe(JSON.stringify({ score: 9, tags: ['a'] }, null, 2));
  });
});

describe('TrustFlowCard', () => {
  it('falls back to "none" when the event carries no grants', () => {
    render(
      <TrustFlowCard
        evt={{ type: 'trust.established', ts: BASE_TS + 0.1, initiator: 'a', target: 'b' }}
      />,
    );
    expect(screen.getByText('none')).toBeInTheDocument();
    expect(screen.queryByText('JTI')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Playground's trust-event vocabulary
// ---------------------------------------------------------------------------

/**
 * LITERAL captured `/internal/telemetry` frames — the wire-shape gate for the
 * four event types that bypass playground's pydantic `RunEvent` entirely and
 * whose key sets are therefore guaranteed only by their Python call sites.
 *
 * **Provenance.** Each object below is the verbatim JSON body that
 * `agents/base/telemetry.py:15-21` POSTs (`{type, run_id, agent_id, ts,
 * ...fields}`), captured by running playground's own code with only
 * `telemetry.httpx` replaced by a recorder. The key sets were NOT inferred
 * from the `emit()` kwargs. Reproduce with, against `aitp-playground` at
 * `agents/base` + `tests/unit` on `sys.path` and its `.venv`:
 *
 *   1. `revocation.verify_failed` ×4 — call the real
 *      `revocation_refresh.refresh_revocations(revocation=RevocationState(),
 *      bootstrap={...}, emit=telemetry.emit_event)` with `revocation_refresh.httpx`
 *      stubbed to return the snapshot body, once per `_discard` site: no `cp.aid`
 *      (`no_expected_issuer`), `del aitp.verify_revocation_list`
 *      (`sdk_cannot_verify`), a garbage envelope through the REAL SDK (an SDK
 *      `.code`), and `verify_revocation_list` stubbed to succeed over a body with
 *      no `published_at` (`malformed_body` — the one cause that requires the
 *      signature to have passed).
 *   2. `revocation.degraded_serve` — `AitpServer._enforce_revocation_freshness`
 *      bound to a stub whose `revocation.posture()` is `"degraded"` and
 *      `revocation_fail_mode` is `"soft_fail"`, then awaiting the task
 *      `_emit_soon` schedules.
 *   3. `delegation.rejected` and `delegation.redeemed` site 1 — the real
 *      `/aitp/delegation/redeem` route via `tests/unit/test_delegation_revocation.py`'s
 *      `_server` / `_delegation_for` / `_redeem` harness, once clean and once with
 *      the source jti revoked.
 *   4. `delegation.redeemed` site 2 — a real `build_admin_router`
 *      `/admin/redeem-delegation` with `agent_admin.httpx` pointed by
 *      `httpx.ASGITransport` at the peer above, so a real TCT comes back.
 *   5. `delegation.redeemed` site 3 — the same route with the peer answering
 *      2xx and `{"grant_voucher": "vouch"}`, taking the `except (ValueError,
 *      KeyError)` arm at `agent_admin.py:629`.
 *   6. `delegation.issued` — `/admin/delegate` with a real grant voucher from a
 *      completed handshake and `agent_admin.httpx` serving the delegatee's real
 *      manifest.
 *   7. `manifest.verify_failed` (agent channel) — the same route with the
 *      delegatee manifest replaced by `{"not": "a manifest"}`.
 *
 * Site 1 was captured twice, in two independent runs with different keys, with
 * identical key sets both times. `ts` is `time.time()` — float epoch SECONDS on
 * this channel (and on the orchestrator channel, whose `RunEvent.ts` defaults
 * to the same call). That observation is what settled the offset question:
 * these frames are now also the fixtures for the run-relative-offset
 * regression test above, and `formatOffset` is never handed a raw `ts`.
 */
const CAPTURED_FRAMES: Record<string, Record<string, unknown>> = {
  revocation_verify_failed_no_expected_issuer: {"agent_id": "writer", "cause": "no_expected_issuer", "detail": "no CP AID pinned (set CP_AID) — refusing to apply an unverifiable revocation snapshot", "run_id": "run-7f3c", "ts": 1790199933.127181, "type": "revocation.verify_failed"},
  revocation_verify_failed_sdk_cannot_verify: {"agent_id": "writer", "cause": "sdk_cannot_verify", "detail": "installed aitp-sdk has no verify_revocation_list (needs >=0.6.0) — refusing to apply an unverified snapshot", "run_id": "run-7f3c", "ts": 1790199933.1274319, "type": "revocation.verify_failed"},
  revocation_verify_failed_sdk_code: {"agent_id": "writer", "cause": "malformed", "detail": "invalid revocation envelope JSON: missing field `version` at line 1 column 33", "run_id": "run-7f3c", "ts": 1790199933.127628, "type": "revocation.verify_failed"},
  revocation_verify_failed_malformed_body: {"agent_id": "writer", "cause": "malformed_body", "detail": "'published_at'", "run_id": "run-7f3c", "ts": 1790199933.127785, "type": "revocation.verify_failed"},
  revocation_degraded_serve: {"agent_id": "writer", "fail_mode": "soft_fail", "reason": "snapshot_stale", "run_id": "run-7f3c", "serves": 1, "ts": 1790199933.1338491, "type": "revocation.degraded_serve"},
  delegation_rejected: {"agent_id": "writer", "error": "delegation verification failed: source TCT has been revoked", "run_id": "run-7f3c", "ts": 1790199933.192322, "type": "delegation.rejected"},
  delegation_redeemed_site1: {"agent_id": "writer", "delegatee_aid": "aid:pubkey:HYKwtlrXMWrR8JYLWx_fpoKku1W-YSg4-fJMJUBdhSY", "grants": ["demo.write"], "role": "issuer", "run_id": "run-7f3c", "ts": 1790199933.189941, "type": "delegation.redeemed"},
  delegation_redeemed_site2: {"agent_id": "writer", "grants": ["demo.write"], "jti": "e60c9eb3-1376-4106-9f9e-175e9411a047", "peer_aid": "aid:pubkey:sJnYjcKKOREshszqllQruT9uzMs7GGRtUcGNryVxtL8", "run_id": "run-7f3c", "tct": {"claims": {"aud": "aid:pubkey:0Hhe28FMapk2TBbOe5a89ZciPhnF0sIp2In3cRrc4Ts", "cnf": {"jkt": "oEZ1e_0EZjKZccZoLfVnhym8bnECoUsL6STMnI36lLw"}, "exp": 1790203533, "grants": ["demo.write"], "iat": 1790199933, "iss": "aid:pubkey:sJnYjcKKOREshszqllQruT9uzMs7GGRtUcGNryVxtL8", "jti": "e60c9eb3-1376-4106-9f9e-175e9411a047", "sub": "aid:pubkey:0Hhe28FMapk2TBbOe5a89ZciPhnF0sIp2In3cRrc4Ts", "ver": "aitp/0.2"}, "token": "eyJhbGciOiJFZERTQSIsInR5cCI6ImFpdHAtdGN0K2p3dCJ9.eyJhdWQiOiJhaWQ6cHVia2V5OjBIaGUyOEZNYXBrMlRCYk9lNWE4OVpjaVBobkYwc0lwMkluM2NScmM0VHMiLCJjbmYiOnsiamt0Ijoib0VaMWVfMEVaaktaY2Nab0xmVm5oeW04Ym5FQ29Vc0w2U1RNbkkzNmxMdyJ9LCJleHAiOjE3OTAyMDM1MzMsImdyYW50cyI6WyJkZW1vLndyaXRlIl0sImlhdCI6MTc5MDE5OTkzMywiaXNzIjoiYWlkOnB1YmtleTpzSm5ZamNLS09SRXNoc3pxbGxRcnVUOXV6TXM3R0dSdFVjR05yeVZ4dEw4IiwianRpIjoiZTYwYzllYjMtMTM3Ni00MTA2LTlmOWUtMTc1ZTk0MTFhMDQ3Iiwic3ViIjoiYWlkOnB1YmtleTowSGhlMjhGTWFwazJUQmJPZTVhODlaY2lQaG5GMHNJcDJJbjNjUnJjNFRzIiwidmVyIjoiYWl0cC8wLjIifQ.jcNsq-NfvYmK5OPD2OeLCtOaznHz_BWyE56kPx7oZ06s-WxBu1nErWQB2Ug_q2TdDZavO2-RO8lpRHLprWxFDQ"}, "ts": 1790199933.210742, "type": "delegation.redeemed"},
  delegation_redeemed_site3: {"agent_id": "writer", "peer_port": 9, "run_id": "run-7f3c", "ts": 1790199933.21171, "type": "delegation.redeemed"},
  delegation_issued: {"agent_id": "writer", "delegatee_aid": "aid:pubkey:s116fD4_6iA_LRrxfbloIOiYKPHAz7_tfbxC3ym5AmA", "run_id": "run-7f3c", "scope": ["demo.write"], "tct": {"claims": {"aud": "aid:pubkey:EpxW9B59Kv4Xsfa-8tvnW07avwwKDmvohS-bf2m5d3E", "cnf": {"jkt": "EFbUJicZyueHazzZUvn-YaHEZmYTIP28N2e0Mcr1nyc"}, "exp": 1790203610, "iss": "aid:pubkey:snRpQkxsJ4ylh8iSVaXq6qfEpxv6NHFaE194JCXXX5A", "scope": ["demo.write"], "sub": "aid:pubkey:s116fD4_6iA_LRrxfbloIOiYKPHAz7_tfbxC3ym5AmA", "ver": "aitp/0.2", "voucher": "eyJhbGciOiJFZERTQSIsInR5cCI6ImFpdHAtZ3JhbnQrand0In0.eyJleHAiOjE3OTAyMDM2MTAsImdyYW50cyI6WyJkZW1vLndyaXRlIl0sImlhdCI6MTc5MDIwMDAxMCwiaXNzIjoiYWlkOnB1YmtleTpFcHhXOUI1OUt2NFhzZmEtOHR2blcwN2F2d3dLRG12b2hTLWJmMm01ZDNFIiwic3JjX2p0aSI6IjBkZGMzYjBmLTIxOTYtNDU5Ni05ZGVjLWQ3ZTIzNGVjMjJiMiIsInN1YiI6ImFpZDpwdWJrZXk6c25ScFFreHNKNHlsaDhpU1ZhWHE2cWZFcHh2Nk5IRmFFMTk0SkNYWFg1QSIsInZlciI6ImFpdHAvMC4yIn0.cZCCiBvEcWej7wh0ej9zRFnLHYL2nO0x_R6LG6wcJJfdd5uRQzQe5C3Trl4xDkL771bca7JksNNeNdwe-3GgAQ"}, "token": "eyJhbGciOiJFZERTQSIsInR5cCI6ImFpdHAtZGVsZWdhdGlvbitqd3QifQ.eyJhdWQiOiJhaWQ6cHVia2V5OkVweFc5QjU5S3Y0WHNmYS04dHZuVzA3YXZ3d0tEbXZvaFMtYmYybTVkM0UiLCJjbmYiOnsiamt0IjoiRUZiVUppY1p5dWVIYXp6WlV2bi1ZYUhFWm1ZVElQMjhOMmUwTWNyMW55YyJ9LCJleHAiOjE3OTAyMDM2MTAsImlzcyI6ImFpZDpwdWJrZXk6c25ScFFreHNKNHlsaDhpU1ZhWHE2cWZFcHh2Nk5IRmFFMTk0SkNYWFg1QSIsInNjb3BlIjpbImRlbW8ud3JpdGUiXSwic3ViIjoiYWlkOnB1YmtleTpzMTE2ZkQ0XzZpQV9MUnJ4ZmJsb0lPaVlLUEhBejdfdGZieEMzeW01QW1BIiwidmVyIjoiYWl0cC8wLjIiLCJ2b3VjaGVyIjoiZXlKaGJHY2lPaUpGWkVSVFFTSXNJblI1Y0NJNkltRnBkSEF0WjNKaGJuUXJhbmQwSW4wLmV5SmxlSEFpT2pFM09UQXlNRE0yTVRBc0ltZHlZVzUwY3lJNld5SmtaVzF2TG5keWFYUmxJbDBzSW1saGRDSTZNVGM1TURJd01EQXhNQ3dpYVhOeklqb2lZV2xrT25CMVltdGxlVHBGY0hoWE9VSTFPVXQyTkZoelptRXRPSFIyYmxjd04yRjJkM2RMUkcxMmIyaFRMV0ptTW0wMVpETkZJaXdpYzNKalgycDBhU0k2SWpCa1pHTXpZakJtTFRJeE9UWXRORFU1TmkwNVpHVmpMV1EzWlRJek5HVmpNakppTWlJc0luTjFZaUk2SW1GcFpEcHdkV0pyWlhrNmMyNVNjRkZyZUhOS05IbHNhRGhwVTFaaFdIRTJjV1pGY0hoMk5rNUlSbUZGTVRrMFNrTllXRmcxUVNJc0luWmxjaUk2SW1GcGRIQXZNQzR5SW4wLmNaQ0NpQnZFY1dlajd3aDBlajl6UkZuTEhZTDJuTzB4X1I2TEc2d2NKSmZkZDV1UlF6UWU1QzNUcmw0eERrTDc3MWJjYTdKa3NOTmVOZHdlLTNHZ0FRIn0.0gtNeSPirCLtz6KNSX-Xr6LJGKClS_ujRShWSjhIRtO55JPRkmfl31pObsczO06yTwZhMmfHFRHN1PXEVkWkBw"}, "ts": 1790200010.383384, "type": "delegation.issued"},
  manifest_verify_failed_agent: {"agent_id": "writer", "cause": "malformed", "run_id": "run-7f3c", "source_url": "http://localhost:11/.well-known/aitp-manifest", "ts": 1790200028.6396348, "type": "manifest.verify_failed"},
};

/** A compile-time-exhaustive mirror of `RunEvent`'s keys: TypeScript rejects
 *  this object if a key is missing *or* unknown, so it cannot drift from the
 *  interface, and it gives the wire-shape test a runtime key list an interface
 *  cannot provide on its own. */
const RUN_EVENT_KEYS: Record<keyof RunEvent, true> = {
  type: true, ts: true, run_id: true, agent_id: true, agent: true, aid: true,
  port: true, step_id: true, capability: true, initiator: true, target: true,
  grants: true, peers: true, result: true, error: true, jti: true,
  scenario_ref: true, notes: true, payload: true, cause: true,
  source_url: true, detail: true, reason: true, serves: true, fail_mode: true,
  delegatee_aid: true, role: true, peer_aid: true, peer_port: true, tct: true,
  scope: true,
};

describe('captured wire shapes', () => {
  it.each(Object.keys(CAPTURED_FRAMES))('%s: every key is modelled on RunEvent', (name) => {
    const unmodelled = Object.keys(CAPTURED_FRAMES[name]).filter(
      (k) => !Object.hasOwn(RUN_EVENT_KEYS, k),
    );
    expect(unmodelled).toEqual([]);
  });

  it.each(Object.keys(CAPTURED_FRAMES))('%s: renders a typed card, not the grey default', (name) => {
    const frame = CAPTURED_FRAMES[name] as unknown as RunEvent;
    const { container } = render(<EventCard evt={frame} />);
    // The grey default is the ONLY place the raw type string is rendered.
    expect(container).not.toHaveTextContent(frame.type);
    expect(container.textContent).not.toBe('');
  });
});

describe('manifestVerifyFailedVerdict', () => {
  it.each([
    // `unknown` is the classifier's own "I could not classify this" — amber by
    // an explicit named branch, never by the predicate returning false.
    ['unknown', C.amber, 'the SDK raised an error carrying no code — signature not assessed (unknown)'],
    // SDK codes that never reach the signature check, via Phase 2's predicate.
    ['malformed', C.amber, 'signature not assessed (malformed)'],
    ['version_unknown', C.amber, 'signature not assessed (version_unknown)'],
    // Everything else: honest red that names the cause and claims no verdict.
    ['expired', C.red, 'verification failed (expired)'],
    ['signature_invalid', C.red, 'verification failed (signature_invalid)'],
    ['pop_failed', C.red, 'verification failed (pop_failed)'],
    ['a_future_sdk_code', C.red, 'verification failed (a_future_sdk_code)'],
  ])('cause %s -> %s / %s', (cause, color, text) => {
    expect(manifestVerifyFailedVerdict(cause)).toMatchObject({ color, text });
  });

  it.each([[undefined], [null]])('treats a %s cause identically', (cause) => {
    expect(manifestVerifyFailedVerdict(cause)).toEqual({
      color: C.red,
      headline: 'MANIFEST REJECTED',
      text: 'verification failed · this event reported no cause',
    });
  });
});

describe('revocationVerifyFailedVerdict', () => {
  it.each([
    // The three playground-authored literals, each an explicit named branch.
    ['no_expected_issuer', C.amber, 'no CP AID pinned — nothing was checked (no_expected_issuer)'],
    [
      'sdk_cannot_verify',
      C.amber,
      'the installed SDK cannot verify revocation lists — nothing was checked (sdk_cannot_verify)',
    ],
    ['malformed_body', C.red, 'signature verified · snapshot body is malformed (malformed_body)'],
    // SDK codes, via Phase 2's predicate.
    ['malformed', C.amber, 'signature not assessed (malformed)'],
    ['version_unknown', C.amber, 'signature not assessed (version_unknown)'],
    ['signature_invalid', C.red, 'verification failed (signature_invalid)'],
    ['issuer_mismatch', C.red, 'verification failed (issuer_mismatch)'],
    // The set is OPEN: any future code flows through revocation_refresh.py:130
    // untouched, so an unrecognised cause must be named and nothing claimed.
    ['kid_unknown', C.red, 'verification failed (kid_unknown)'],
  ])('cause %s -> %s / %s', (cause, color, text) => {
    expect(revocationVerifyFailedVerdict(cause)).toMatchObject({ color, text });
  });

  it.each([[undefined], [null]])('treats a %s cause identically', (cause) => {
    expect(revocationVerifyFailedVerdict(cause)).toEqual({
      color: C.red,
      headline: 'SNAPSHOT DISCARDED',
      text: 'verification failed · this event reported no cause',
    });
  });

  it('never routes no_expected_issuer or sdk_cannot_verify through the predicate', () => {
    // Regression pin: both are red-by-fallthrough if their branches are deleted,
    // because the predicate only knows SDK codes. Amber here proves the branches.
    expect(revocationVerifyFailedVerdict('no_expected_issuer').color).toBe(C.amber);
    expect(revocationVerifyFailedVerdict('sdk_cannot_verify').color).toBe(C.amber);
  });
});

describe('manifest.verify_failed card', () => {
  it('renders the cause, the source url and the engine-side step/agent', () => {
    const { container } = render(
      <EventCard
        evt={evt({
          type: 'manifest.verify_failed',
          cause: 'signature_invalid',
          source_url: 'http://localhost:8102/.well-known/aitp-manifest',
          step_id: 'draft',
          agent_id: 'writer',
        })}
      />,
    );
    expect(screen.getByText('MANIFEST REJECTED')).toHaveStyle({ color: C.red });
    expect(container).toHaveTextContent('verification failed (signature_invalid)');
    expect(screen.getByText('http://localhost:8102/.well-known/aitp-manifest')).toBeInTheDocument();
    expect(screen.getByText('step draft')).toBeInTheDocument();
    expect(container.querySelector('svg[data-icon="ShieldX"]')).not.toBeNull();
  });

  it('renders the agent-channel frame that carries no step or agent', () => {
    const { container } = render(
      <EventCard
        evt={evt({ type: 'manifest.verify_failed', cause: 'malformed', source_url: 'http://p/m' })}
      />,
    );
    expect(screen.getByText('MANIFEST NOT VERIFIED')).toHaveStyle({ color: C.amber });
    expect(container).not.toHaveTextContent('WHERE');
    expect(container.querySelector('svg[data-icon="ShieldAlert"]')).not.toBeNull();
  });

  it.each([[undefined], [null]])(
    'still renders the card when cause is %s, omitting the cause rather than falling through',
    (cause) => {
      const { container } = render(
        <EventCard evt={evt({ type: 'manifest.verify_failed', cause })} />,
      );
      expect(screen.getByText('MANIFEST REJECTED')).toBeInTheDocument();
      expect(container).toHaveTextContent('this event reported no cause');
      expect(container).not.toHaveTextContent('manifest.verify_failed'); // not the grey default
    },
  );

  it.each(['expired', 'version_unknown'])(
    'a pre-signature cause (%s) never reads as a signature verdict',
    (cause) => {
      const { container } = render(
        <EventCard evt={evt({ type: 'manifest.verify_failed', cause })} />,
      );
      expect(container).not.toHaveTextContent(/invalid signature/i);
      expect(container).not.toHaveTextContent(/forged/i);
    },
  );

  it('cause "unknown" is amber and asserts no verdict at all', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'manifest.verify_failed', cause: 'unknown' })} />,
    );
    expect(screen.getByText('MANIFEST NOT VERIFIED')).toHaveStyle({ color: C.amber });
    expect(container).toHaveTextContent('signature not assessed (unknown)');
    expect(container).not.toHaveTextContent(/failed to verify/i);
    expect(container).not.toHaveTextContent(/invalid/i);
  });
});

describe('revocation.verify_failed card', () => {
  it('renders the cause prominently and the detail as secondary text', () => {
    const { container } = render(
      <EventCard
        evt={evt({
          type: 'revocation.verify_failed',
          cause: 'no_expected_issuer',
          detail: 'no CP AID pinned (set CP_AID) — refusing to apply an unverifiable snapshot',
        })}
      />,
    );
    expect(screen.getByText('SNAPSHOT NOT VERIFIED')).toHaveStyle({ color: C.amber });
    expect(container).toHaveTextContent('nothing was checked (no_expected_issuer)');
    expect(
      screen.getByText('no CP AID pinned (set CP_AID) — refusing to apply an unverifiable snapshot'),
    ).toBeInTheDocument();
  });

  it('malformed_body renders as post-signature, not as a signature failure', () => {
    const { container } = render(
      <EventCard
        evt={evt({ type: 'revocation.verify_failed', cause: 'malformed_body', detail: "'published_at'" })}
      />,
    );
    expect(screen.getByText('SNAPSHOT DISCARDED')).toHaveStyle({ color: C.red });
    expect(container).toHaveTextContent('signature verified · snapshot body is malformed');
    // The whole point: an authentically-signed snapshot must never read as a
    // signature failure just because its body would not parse.
    expect(container).not.toHaveTextContent(/signature invalid/i);
    expect(container).not.toHaveTextContent(/not verified/i);
    expect(container).not.toHaveTextContent(/forged/i);
  });

  it('sdk_cannot_verify is amber and says nothing was checked', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'revocation.verify_failed', cause: 'sdk_cannot_verify' })} />,
    );
    expect(screen.getByText('SNAPSHOT NOT VERIFIED')).toHaveStyle({ color: C.amber });
    expect(container).toHaveTextContent('nothing was checked (sdk_cannot_verify)');
  });

  it('signature_invalid is red', () => {
    render(<EventCard evt={evt({ type: 'revocation.verify_failed', cause: 'signature_invalid' })} />);
    expect(screen.getByText('SNAPSHOT DISCARDED')).toHaveStyle({ color: C.red });
  });

  it('an unrecognised cause is named and nothing is claimed about it', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'revocation.verify_failed', cause: 'some_future_code' })} />,
    );
    expect(container).toHaveTextContent('verification failed (some_future_code)');
    expect(container).not.toHaveTextContent(/signature invalid/i);
  });

  it.each([[undefined], [null]])('renders with cause %s and no detail', (cause) => {
    const { container } = render(
      <EventCard evt={evt({ type: 'revocation.verify_failed', cause, detail: cause })} />,
    );
    expect(screen.getByText('SNAPSHOT DISCARDED')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('DETAIL');
    expect(container).not.toHaveTextContent('revocation.verify_failed');
  });
});

describe('revocation.degraded_serve card', () => {
  it('renders reason, fail_mode and serves without calling serves a total', () => {
    const { container } = render(
      <EventCard
        evt={evt({
          type: 'revocation.degraded_serve',
          reason: 'snapshot_stale',
          serves: 300,
          fail_mode: 'soft_fail',
        })}
      />,
    );
    expect(screen.getByText('SERVED WITHOUT CURRENT REVOCATION DATA')).toHaveStyle({
      color: C.amber,
    });
    expect(container).toHaveTextContent('a call was answered on the last verified deny-set');
    expect(screen.getByText('snapshot_stale')).toBeInTheDocument();
    expect(screen.getByText('soft_fail')).toBeInTheDocument();
    expect(container).toHaveTextContent('occurrence #300');
    expect(container).toHaveTextContent('not a count of how many there have been');
    // `serves` is a sample (1st, then every 100th), never a total.
    expect(container).not.toHaveTextContent(/total/i);
    expect(container).not.toHaveTextContent(/300 degraded serves/);
    // Neither a failure nor a success.
    expect(container).not.toHaveTextContent(/failed/i);
    expect(container).not.toHaveTextContent(/verified ·/);
  });

  it.each([[undefined], [null]])('still renders when reason is %s', (reason) => {
    const { container } = render(
      <EventCard evt={evt({ type: 'revocation.degraded_serve', reason, serves: reason })} />,
    );
    expect(screen.getByText('SERVED WITHOUT CURRENT REVOCATION DATA')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('REASON');
    expect(container).not.toHaveTextContent('SAMPLED');
    expect(container).not.toHaveTextContent('revocation.degraded_serve');
  });

  it('renders serves=0 rather than dropping it as falsy', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'revocation.degraded_serve', serves: 0 })} />,
    );
    expect(container).toHaveTextContent('occurrence #0');
  });
});

describe('delegation.rejected card', () => {
  it('renders the stringified exception as-is without parsing a code out of it', () => {
    const error = 'delegation verification failed: source TCT has been revoked';
    const { container } = render(<EventCard evt={evt({ type: 'delegation.rejected', error })} />);
    expect(screen.getByText('DELEGATION REJECTED')).toHaveStyle({ color: C.red });
    expect(screen.getByText(error)).toBeInTheDocument();
    expect(container.querySelector('svg[data-icon="XCircle"]')).not.toBeNull();
  });

  it.each([[undefined], [null]])('still renders when error is %s', (error) => {
    // `error` is declared on playground's own pydantic `RunEvent`
    // (`runner/context.py:30`), so the orchestrator channel really does deliver
    // `error: null`. This console types the field `string | undefined` — a
    // pre-existing shape this change deliberately leaves alone — so the null
    // case needs a cast to reach the card, which must treat it as absent.
    const { container } = render(
      <EventCard evt={evt({ type: 'delegation.rejected', error: error as string | undefined })} />,
    );
    expect(screen.getByText('DELEGATION REJECTED')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('ERROR');
    expect(container).not.toHaveTextContent('delegation.rejected');
  });
});

describe('delegation.redeemed card — one shape per emit site', () => {
  it('site 1 (issuer) names the delegatee and the grants', () => {
    const { container } = render(
      <EventCard
        evt={evt({
          type: 'delegation.redeemed',
          role: 'issuer',
          delegatee_aid: aid,
          grants: ['demo.write'],
        })}
      />,
    );
    expect(screen.getByText('DELEGATION REDEEMED')).toHaveStyle({ color: C.blue });
    expect(container).toHaveTextContent('an agent issued a fresh TCT to a delegatee');
    expect(screen.getByTitle(aid)).toBeInTheDocument();
    expect(screen.getByText('demo.write')).toBeInTheDocument();
    // Never the `verified` teal this repo reserves for checked facts: this
    // console verified nothing, it is relaying a self-reported milestone.
    expect(screen.getByText('DELEGATION REDEEMED')).not.toHaveStyle({ color: C.tealBright });
    expect(container).not.toHaveTextContent(/verified/i);
  });

  it('site 2 (delegatee) names the peer, the jti and the claim names', () => {
    const peer = 'aid:pubkey:sJnYjcKKOREshszqllQruT9uzMs7GGRtUcGNryVxtL8';
    const { container } = render(
      <EventCard
        evt={evt({
          type: 'delegation.redeemed',
          peer_aid: peer,
          jti: 'e60c9eb3-1376-4106-9f9e-175e9411a047',
          grants: ['demo.write'],
          tct: {
            token: 'eyJhbGciOiJFZERTQSJ9.eyJqdGkiOiJ4In0.sig',
            claims: { iss: peer, grants: ['demo.write'] },
          },
        })}
      />,
    );
    expect(container).toHaveTextContent('a delegatee redeemed a delegation and holds a fresh TCT');
    expect(screen.getByTitle(peer)).toBeInTheDocument();
    expect(container).toHaveTextContent('e60c9eb3-1376-4106…');
    expect(screen.getByText('iss')).toBeInTheDocument();
    expect(screen.getByText('grants')).toBeInTheDocument();
    expect(screen.getByText('eyJhbGciOiJFZERTQSJ9.eyJ…')).toBeInTheDocument();
  });

  it('site 3 (peer_port only) asserts nothing about a TCT it never saw', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'delegation.redeemed', peer_port: 8102 })} />,
    );
    expect(screen.getByText('DELEGATION REDEEMED')).toBeInTheDocument();
    expect(container).toHaveTextContent('redemption completed against port 8102');
    expect(container).toHaveTextContent(
      'this event carried no claims and no peer identity — nothing further is asserted',
    );
    // The honesty core of this phase: no TCT, no claims, no verified
    // delegation, and equally no claim that the peer returned a non-TCT —
    // `agent_admin.py:629` also catches a decode failure on a token that WAS
    // present.
    expect(container).not.toHaveTextContent(/tct/i);
    expect(container).not.toHaveTextContent(/fresh/i);
    expect(container).not.toHaveTextContent(/verified/i);
    expect(container).not.toHaveTextContent(/jti/i);
    expect(container).not.toHaveTextContent(/grants/i);
    expect(container).not.toHaveTextContent(/not a tct/i);
    expect(container).not.toHaveTextContent(/delegation.redeemed/);
  });

  it('renders the card even when every optional field is absent', () => {
    const { container } = render(<EventCard evt={evt({ type: 'delegation.redeemed' })} />);
    expect(screen.getByText('DELEGATION REDEEMED')).toBeInTheDocument();
    expect(container).toHaveTextContent('a redemption completed');
    expect(container).not.toHaveTextContent('delegation.redeemed');
  });

  it('survives a grants value that is not an array', () => {
    // site 2's `grants` is `claims.get("grants")` on a decoded peer JWS — no
    // validation upstream, so a malformed peer token reaches this card.
    render(
      <EventCard
        evt={evt({
          type: 'delegation.redeemed',
          peer_aid: aid,
          grants: 'demo.write' as unknown as string[],
        })}
      />,
    );
    expect(screen.getByText('DELEGATION REDEEMED')).toBeInTheDocument();
    expect(screen.getByText('"demo.write"')).toBeInTheDocument();
  });

  it('survives a grants value that is an object', () => {
    const { container } = render(
      <EventCard
        evt={evt({
          type: 'delegation.redeemed',
          peer_aid: aid,
          grants: { write: true } as unknown as string[],
        })}
      />,
    );
    expect(container).toHaveTextContent('DELEGATION REDEEMED');
    expect(screen.getByText('{"write":true}')).toBeInTheDocument();
  });

  it('renders an empty grants array as "none" rather than omitting the row', () => {
    render(
      <EventCard evt={evt({ type: 'delegation.redeemed', role: 'issuer', grants: [] })} />,
    );
    expect(screen.getByText('GRANTS')).toBeInTheDocument();
    expect(screen.getByText('none')).toBeInTheDocument();
  });

  it('renders empty tct.claims honestly, not as an absence to be suspicious of', () => {
    // `tct_event()` deliberately emits `claims: {}` on a decode failure "so the
    // event is never dropped" — a legitimate state, so it gets neutral muted
    // text and no severity colour.
    const { container } = render(
      <EventCard
        evt={evt({ type: 'delegation.redeemed', tct: { token: 'a.b.c', claims: {} } })}
      />,
    );
    const note = screen.getByText('no claims decoded from the token');
    expect(note).toBeInTheDocument();
    expect(note).toHaveStyle({ color: C.textDim });
    expect(note).not.toHaveStyle({ color: C.red });
    expect(note).not.toHaveStyle({ color: C.amber });
    expect(container).not.toHaveTextContent(/missing/i);
  });

  it('survives a tct whose claims is not an object', () => {
    render(
      <EventCard
        evt={evt({
          type: 'delegation.redeemed',
          peer_aid: aid,
          tct: { token: 'a.b.c', claims: 'nope' as unknown as Record<string, unknown> },
        })}
      />,
    );
    expect(screen.getByText('no claims decoded from the token')).toBeInTheDocument();
  });

  it('survives a tct that is a bare string rather than the {token, claims} object', () => {
    // `tct` is an object at every emit site (`tct_event()` builds it), but the
    // agent channel is unvalidated, so the card must not assume the shape.
    const { container } = render(
      <EventCard
        evt={evt({
          type: 'delegation.redeemed',
          peer_aid: aid,
          tct: 'a.b.c' as unknown as RunEvent['tct'],
        })}
      />,
    );
    expect(screen.getByText('DELEGATION REDEEMED')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('CLAIMS');
  });

  it('treats a delegatee_aid without role as the issuer shape', () => {
    // `role` is the site-1 marker, but nothing upstream guarantees it: a
    // `delegatee_aid` with no token is still unambiguously the issuer side.
    const { container } = render(
      <EventCard evt={evt({ type: 'delegation.redeemed', delegatee_aid: aid })} />,
    );
    expect(container).toHaveTextContent('an agent issued a fresh TCT to a delegatee');
    expect(screen.getByText('DELEGATEE')).toBeInTheDocument();
  });
});

describe('the discretionary delegation.issued / delegation.redeeming pair', () => {
  it('delegation.issued names the delegatee, the scope and the token claims', () => {
    const { container } = render(
      <EventCard
        evt={evt({
          type: 'delegation.issued',
          delegatee_aid: aid,
          scope: ['demo.write'],
          tct: { token: 'header.payload.signature', claims: { scope: ['demo.write'], sub: aid } },
        })}
      />,
    );
    expect(screen.getByText('DELEGATION ISSUED')).toHaveStyle({ color: C.blue });
    expect(container).toHaveTextContent('an agent signed a delegation for a delegatee');
    expect(screen.getByText('SCOPE')).toBeInTheDocument();
    expect(screen.getByText('demo.write')).toBeInTheDocument();
    expect(screen.getByText('sub')).toBeInTheDocument();
    // `delegation.issued`'s token is a DELEGATION envelope, not a TCT, even
    // though playground puts it through the same `tct_event()` helper.
    expect(container).not.toHaveTextContent(/tct/i);
    expect(container).not.toHaveTextContent(/verified/i);
  });

  it('delegation.issued still renders with neither scope nor token', () => {
    const { container } = render(<EventCard evt={evt({ type: 'delegation.issued' })} />);
    expect(screen.getByText('DELEGATION ISSUED')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('SCOPE');
    expect(container).not.toHaveTextContent('CLAIMS');
    expect(container).not.toHaveTextContent('delegation.issued');
  });

  it('delegation.redeeming names both parties with a pulsing dot', () => {
    const { container } = render(
      <EventCard evt={evt({ type: 'delegation.redeeming', initiator: 'writer', target: 'editor' })} />,
    );
    expect(container).toHaveTextContent('writer ⇒ editor: redeeming delegation…');
    expect(container.querySelector('.pulse')).not.toBeNull();
  });
});

describe('unmodelled trust event types', () => {
  it.each([
    'trust.something_new',
    'delegation.something_new',
    'revocation.list_fetched',
    'revocation.refresh_failed',
  ])('%s still falls through to the grey default', (type) => {
    render(<EventCard evt={evt({ type })} />);
    const row = screen.getByText(type);
    expect(row).toBeInTheDocument();
    expect(row).toHaveClass('mono');
  });
});
