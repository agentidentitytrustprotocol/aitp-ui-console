'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  KeyRound,
  Loader,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  XCircle,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/shared/card';
import { AidCell } from '@/components/shared/aid-cell';
import { CapabilityBadge, Tag } from '@/components/shared/capability-badge';
import { C } from '@/lib/colors';
import { formatOffset, runOffsetMs, shortId } from '@/lib/utils';
import {
  isUnassessedManifestCode,
  isUnassessedRevocationCode,
  manifestPostSignatureDetail,
} from '@/lib/verification-display';
import type { RunEvent } from '@/lib/types/playground';

/** `baseTs` is the run's time base (the earliest `ts` seen — see
 *  `useRunTimeBase`). It is optional and `undefined` until the first event
 *  arrives, in which case the card renders no offset rather than `NaN`. */
export function EventCard({ evt, baseTs }: { evt: RunEvent; baseTs?: number }) {
  const offset = baseTs === undefined ? undefined : formatOffset(runOffsetMs(evt.ts, baseTs));

  switch (evt.type) {
    case 'run.started':
      return (
        <Line color={C.purple}>
          <span style={{ fontSize: 12, color: C.purple }}>Scenario run started</span>
          {evt.scenario_ref && <CapabilityBadge cap={evt.scenario_ref} />}
        </Line>
      );

    case 'agent.spawning':
      return (
        <Line color={C.textMuted} dotClass="pulse">
          <span style={{ fontSize: 12, color: C.textDim }}>
            Spawning <span style={{ color: C.text }}>{evt.agent_id}</span>
            {evt.notes && <span style={{ color: C.textMuted }}> ({evt.notes})</span>}
          </span>
          <Loader size={11} color={C.textMuted} className="spin" />
        </Line>
      );

    case 'agent.ready':
      return (
        <Line color={C.green} ts={offset}>
          <span style={{ fontSize: 12, color: C.text }}>{evt.agent_id}</span>
          <span style={{ fontSize: 12, color: C.green }}>ready</span>
          {evt.port !== undefined && (
            <span className="mono" style={{ fontSize: 10, color: C.textMuted }}>
              :{evt.port}
            </span>
          )}
          {evt.aid && <AidCell aid={evt.aid} />}
        </Line>
      );

    case 'trust.peers_resolved':
      return (
        <Line color={C.blue} ts={offset}>
          <span style={{ fontSize: 12, color: C.textDim }}>
            Peer manifest URLs resolved ({Object.keys(evt.peers ?? {}).length})
          </span>
        </Line>
      );

    case 'trust.establishing':
      return (
        <Line color={C.blue} dotClass="pulse" ts={offset}>
          <span style={{ fontSize: 12, color: C.textDim }}>
            {evt.initiator} <span style={{ color: C.blue }}>⇒</span> {evt.target}: establishing trust…
          </span>
        </Line>
      );

    case 'trust.established':
      return (
        <div style={{ marginBottom: 10 }} className="anim-in">
          <Line color={C.blue} ts={offset}>
            <ShieldCheck size={12} color={C.blue} />
            <span style={{ fontSize: 12, color: C.blue }}>Trust established</span>
          </Line>
          <TrustFlowCard evt={evt} />
        </div>
      );

    case 'step.started':
      return (
        <Line color={C.amber} ts={offset} dotIcon={<Zap size={11} color={C.amber} />}>
          <span style={{ fontSize: 12, color: C.textDim }}>
            Step <span style={{ color: C.text }}>{evt.step_id}</span>
          </span>
          {evt.capability && <CapabilityBadge cap={evt.capability} />}
          {evt.agent && <span style={{ fontSize: 12, color: C.textDim }}>on {evt.agent}</span>}
        </Line>
      );

    case 'step.probing_no_trust':
      return (
        <Line color={C.amber} ts={offset}>
          <span style={{ fontSize: 12, color: C.amber }}>
            Probing without TCT → expect 403
          </span>
        </Line>
      );

    case 'step.access_denied':
      return (
        <Card style={{ padding: '10px 14px', borderLeft: `3px solid ${C.red}`, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <XCircle size={14} color={C.red} />
            <span style={{ fontSize: 12, color: C.red, fontWeight: 500 }}>403 Access Denied</span>
            {evt.capability && <CapabilityBadge cap={evt.capability} />}
          </div>
        </Card>
      );

    case 'llm.started': {
      const model = typeof evt.payload?.model === 'string' ? evt.payload.model : 'LLM';
      return (
        <Line color={C.green} ts={offset} dotIcon={<Loader size={11} color={C.green} className="spin" />}>
          <span style={{ fontSize: 12, color: C.textDim }}>
            {evt.agent_id ?? evt.agent} calling{' '}
            <span style={{ color: C.green }}>{model}</span>…
          </span>
        </Line>
      );
    }

    case 'llm.complete': {
      const tokens = evt.payload?.tokens_used;
      return (
        <Line color={C.green} ts={offset} dotIcon={<CheckCircle size={11} color={C.green} />}>
          <span style={{ fontSize: 12, color: C.textDim }}>
            {evt.agent_id ?? evt.agent} ✓ LLM call complete
          </span>
          {tokens !== undefined && (
            <span className="mono" style={{ fontSize: 10, color: C.textMuted }}>
              {String(tokens)} tokens
            </span>
          )}
        </Line>
      );
    }

    case 'step.complete':
      return (
        <div style={{ marginBottom: 10 }} className="anim-in">
          <Line color={C.amber} ts={offset} dotIcon={<CheckCircle size={11} color={C.amber} />}>
            <span style={{ fontSize: 12, color: C.amber }}>Step complete: {evt.step_id}</span>
          </Line>
          <StepOutputCard evt={evt} />
        </div>
      );

    case 'run.complete':
      return (
        <Card style={{ padding: 16, borderLeft: `3px solid ${C.green}`, marginTop: 12 }} className="anim-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <CheckCircle size={16} color={C.green} />
            <span style={{ fontSize: 14, fontWeight: 600, color: C.green }}>Run complete</span>
            <span
              className="mono"
              style={{ fontSize: 10, color: C.textMuted, marginLeft: 'auto' }}
            >
              {offset}
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.textDim }}>Total elapsed: {offset ?? '—'}</div>
        </Card>
      );

    case 'run.failed':
      return (
        <Card style={{ padding: 16, borderLeft: `3px solid ${C.red}`, marginTop: 12 }} className="anim-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={16} color={C.red} />
            <span style={{ fontSize: 14, fontWeight: 600, color: C.red }}>Run failed</span>
          </div>
          {evt.error && <div style={{ fontSize: 12, color: C.textDim }}>{evt.error}</div>}
        </Card>
      );

    case 'manifest.verify_failed':
      return <ManifestVerifyFailedCard evt={evt} />;

    case 'revocation.verify_failed':
      return <RevocationVerifyFailedCard evt={evt} />;

    case 'revocation.degraded_serve':
      return <RevocationDegradedServeCard evt={evt} />;

    case 'delegation.issued':
      return <DelegationIssuedCard evt={evt} />;

    case 'delegation.redeeming':
      return (
        <Line color={C.blue} dotClass="pulse" ts={offset}>
          <span style={{ fontSize: 12, color: C.textDim }}>
            {evt.initiator} <span style={{ color: C.blue }}>⇒</span> {evt.target}: redeeming
            delegation…
          </span>
        </Line>
      );

    case 'delegation.redeemed':
      return <DelegationRedeemedCard evt={evt} />;

    case 'delegation.rejected':
      return <DelegationRejectedCard evt={evt} />;

    // Anything this console does not model — including a future `trust.*` or
    // `delegation.*` member — lands here deliberately. The row names the type
    // and claims nothing about it; replacing it with anything that implies the
    // console understood the event would be the overclaim this file's typed
    // cards exist to avoid.
    default:
      return (
        <Line color={C.textMuted} ts={offset}>
          <span className="mono" style={{ fontSize: 11, color: C.textMuted }}>
            {evt.type}
          </span>
        </Line>
      );
  }
}

// ---------------------------------------------------------------------------
// Playground's trust-event vocabulary
//
// Five event types the playground puts on the wire that used to fall through
// to the grey `default:` row above. Three of them (`manifest.verify_failed`,
// `revocation.verify_failed`, `revocation.degraded_serve`) are narrated
// nowhere and counted by no metric upstream, so these cards are the *only*
// surface on which they become observable at all.
//
// The discipline every card below follows: render what the producer said,
// name its own cause verbatim, and never assert a signature verdict the cause
// does not support. A missing field means the field is omitted — never a
// fallthrough to the generic row, and never an invented value.
// ---------------------------------------------------------------------------

/** What a trust-failure card says about a producer-supplied cause. */
export interface TrustVerdict {
  /** Colour token. `C.amber` means "nothing was checked"; `C.red` means "the
   *  producer rejected the artifact" — which on its own is *not* a claim that
   *  a signature failed. The wording carries that distinction, not the
   *  colour. */
  color: string;
  /** Uppercase headline, in the badge vocabulary of `verification-display.ts`. */
  headline: string;
  /** What was, and was not, established — always naming the cause verbatim. */
  text: string;
}

/**
 * Severity and wording for `manifest.verify_failed`'s `cause`.
 *
 * The producer is `_classify_manifest_verify_failure`
 * (`aitp-playground/src/aitp_playground/runner/engine.py:32-53`, mirrored at
 * `agents/base/agent_admin.py`), whose body is `getattr(exc, "code", None)`,
 * else `"malformed"` for a `ValueError`, else `"unknown"`. So the value is an
 * SDK `.code` ∪ `{malformed, unknown}` — and several SDK codes are reached
 * *before* `verify_manifest` ever looks at a signature.
 *
 * The amber/red split therefore routes through Phase 2's exported
 * `isUnassessedManifestCode` rather than a second copy of that code list, with
 * exactly one playground-authored literal decided explicitly here:
 *
 * - **`unknown`** is not an SDK code at all — it is the classifier's own way
 *   of saying "the throw carried no `.code`, I could not classify this".
 *   `isUnassessedManifestCode('unknown')` is `false`, so leaving it to the
 *   predicate would paint it red and assert a verification verdict the event
 *   never claimed. It is a could-not-check state: amber, same as the
 *   revocation side's `sdk_cannot_verify`.
 * - `malformed` needs no branch here: it is *also* an SDK code, and the
 *   predicate already classifies it amber (a parse failure reaches no
 *   signature check).
 * - **`expired`** needs its own branch for the same reason `manifestVerdictBadge`
 *   gives it one (`verification-display.ts:166`): `isUnassessedManifestCode`
 *   deliberately excludes `expired` (it is independently meaningful, not a
 *   generic "couldn't get far enough to check" code), so leaving it to that
 *   predicate would fall through to the generic red branch below and render an
 *   expired-but-unassessed manifest as an authenticity failure on this
 *   run-timeline surface — the very overclaim the CP badge was fixed to remove,
 *   reintroduced here by trusting the predicate's name too literally.
 *
 * `pop_failed` / `identity_hint_malformed` — the two codes `verify_manifest`
 * can only construct *after* the outer signature has verified — get the same
 * post-signature-aware wording the CP badge already uses, via
 * `verification-display.ts`'s exported `manifestPostSignatureDetail`. That
 * keeps the two-entry map to exactly one copy rather than one per surface,
 * closing the gap this card used to leave to the generic red branch below.
 */
export function manifestVerifyFailedVerdict(cause?: string | null): TrustVerdict {
  if (cause === 'unknown') {
    return {
      color: C.amber,
      headline: 'MANIFEST NOT VERIFIED',
      text: 'the SDK raised an error carrying no code — signature not assessed (unknown)',
    };
  }
  if (cause === 'expired') {
    return {
      color: C.amber,
      headline: 'MANIFEST NOT VERIFIED',
      text: 'the manifest lapsed before it could be checked — signature not assessed (expired)',
    };
  }
  if (cause && isUnassessedManifestCode(cause)) {
    return {
      color: C.amber,
      headline: 'MANIFEST NOT VERIFIED',
      text: `signature not assessed (${cause})`,
    };
  }
  if (cause) {
    const postSignatureDetail = manifestPostSignatureDetail(cause);
    if (postSignatureDetail !== undefined) {
      return {
        color: C.red,
        headline: 'MANIFEST REJECTED',
        text: `signature verified · ${postSignatureDetail} (${cause})`,
      };
    }
    return {
      color: C.red,
      headline: 'MANIFEST REJECTED',
      text: `verification failed (${cause})`,
    };
  }
  return {
    color: C.red,
    headline: 'MANIFEST REJECTED',
    text: 'verification failed · this event reported no cause',
  };
}

/**
 * Severity and wording for `revocation.verify_failed`'s `cause`.
 *
 * The producer is the four `_discard` call sites in
 * `aitp-playground/agents/base/revocation_refresh.py`, and the set is **open**
 * — any future SDK revocation code flows through `:130` untouched — so the
 * last branch has to be an honest default that names an unrecognised cause
 * and claims nothing about it, not an exhaustive-looking map.
 *
 * Four of the causes get their own named branch *ahead* of the predicate.
 * None of them may reach its severity by falling through
 * `isUnassessedRevocationCode` returning `false`:
 *
 * - **`no_expected_issuer`** (`:116`) — no CP AID was pinned, so the agent
 *   refused to apply a snapshot it could not verify. Nothing was checked:
 *   amber. The predicate returns `false` for it, which would have rendered
 *   red on an artifact nobody looked at.
 * - **`sdk_cannot_verify`** (`:122`) — the installed SDK has no
 *   `verify_revocation_list`. Nothing was checked: amber.
 * - **`malformed_body`** (`:151`) — the snapshot *verified*; it was signed by
 *   the pinned CP key, and its body then failed to parse. Red, because the
 *   snapshot was discarded, but worded as post-signature. This is the
 *   revocation-side twin of the manifest's `pop_failed`, and letting it fall
 *   to the predicate's `false` would render an authentically-signed snapshot
 *   as a signature failure — the exact conflation the CP badges were fixed to
 *   remove, reintroduced on the other artifact.
 * - **`expired`** — the SDK's own pre-signature code (`verify_revocation_list`
 *   checks expiry before the signature, the same ordering `verify_manifest`
 *   uses). `isUnassessedRevocationCode('expired')` is `false` — `expired` is
 *   independently meaningful, not folded into that Set — so leaving it to the
 *   predicate falls through to the generic red branch below and renders an
 *   expired-but-unassessed snapshot exactly like a genuine signature failure.
 *   `revocationVerdictBadge` gives `expired` its own amber branch
 *   (`verification-display.ts:265`) for this same reason; this card has to
 *   agree, or the identical SDK code reads as two different verdicts
 *   depending on which panel an operator happens to be looking at.
 *
 * The one remaining pre-signature code, `issuer_mismatch`, deliberately gets
 * **no** bespoke branch here: `revocationVerdictBadge` colours it red anyway,
 * because a declared-issuer mismatch is independently actionable (a
 * misconfigured pin, a rotated key, a forged issuer field) even though
 * nothing about the signature was established — RFC-AITP-0008 §1.5 makes
 * discarding the snapshot a MUST regardless. `isUnassessedRevocationCode`
 * correctly returns `false` for it, so it reaches the same red verdict here
 * by falling through to the generic branch below, just with plainer wording
 * ("verification failed (issuer_mismatch)" vs. the badge's own "ISSUER
 * MISMATCH") — same colour, same claim, no branch needed to keep them
 * agreeing.
 *
 * Everything else at `:130` is an SDK `.code` (or the literal
 * `signature_invalid` fallback when the throw carried none) and routes
 * through the predicate.
 */
export function revocationVerifyFailedVerdict(cause?: string | null): TrustVerdict {
  if (cause === 'no_expected_issuer') {
    return {
      color: C.amber,
      headline: 'SNAPSHOT NOT VERIFIED',
      text: 'no CP AID pinned — nothing was checked (no_expected_issuer)',
    };
  }
  if (cause === 'sdk_cannot_verify') {
    return {
      color: C.amber,
      headline: 'SNAPSHOT NOT VERIFIED',
      text: 'the installed SDK cannot verify revocation lists — nothing was checked (sdk_cannot_verify)',
    };
  }
  if (cause === 'malformed_body') {
    return {
      color: C.red,
      headline: 'SNAPSHOT DISCARDED',
      text: 'signature verified · snapshot body is malformed (malformed_body)',
    };
  }
  if (cause === 'expired') {
    return {
      color: C.amber,
      headline: 'SNAPSHOT NOT VERIFIED',
      text: 'signature not assessed (expired)',
    };
  }
  if (cause && isUnassessedRevocationCode(cause)) {
    return {
      color: C.amber,
      headline: 'SNAPSHOT NOT VERIFIED',
      text: `signature not assessed (${cause})`,
    };
  }
  if (cause) {
    return {
      color: C.red,
      headline: 'SNAPSHOT DISCARDED',
      text: `verification failed (${cause})`,
    };
  }
  return {
    color: C.red,
    headline: 'SNAPSHOT DISCARDED',
    text: 'verification failed · this event reported no cause',
  };
}

/** The severity icon for a trust verdict, from the same lucide vocabulary the
 *  cards above already use. Amber "could not check" and red "rejected" must
 *  not share a glyph, or the colour is the only signal and a monochrome
 *  screenshot loses it. */
function VerdictIcon({ color }: { color: string }) {
  return color === C.amber ? (
    <ShieldAlert size={14} color={C.amber} />
  ) : (
    <ShieldX size={14} color={C.red} />
  );
}

/** Shared frame for the trust cards: a coloured left rule, a headline, and the
 *  honest sentence. `children` carries whatever fields the event actually had. */
function TrustCard({
  verdict,
  icon,
  children,
}: {
  verdict: TrustVerdict;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card
      style={{ padding: '10px 14px', borderLeft: `3px solid ${verdict.color}`, marginBottom: 8 }}
      className="anim-in"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {icon ?? <VerdictIcon color={verdict.color} />}
        <span
          style={{
            fontSize: 11,
            color: verdict.color,
            fontWeight: 600,
            letterSpacing: '0.05em',
          }}
        >
          {verdict.headline}
        </span>
        <span style={{ fontSize: 12, color: C.textDim }}>{verdict.text}</span>
      </div>
      {children}
    </Card>
  );
}

/** One labelled row inside a trust card. */
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
      <span
        style={{
          fontSize: 10,
          color: C.textMuted,
          letterSpacing: '0.06em',
          minWidth: 62,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexWrap: 'wrap',
          minWidth: 0,
          fontSize: 11,
          color: C.textDim,
          wordBreak: 'break-all',
        }}
      >
        {children}
      </span>
    </div>
  );
}

/** A capability list off the wire, rendered without trusting its shape.
 *
 *  `delegation.redeemed`'s site-2 `grants` is `claims.get("grants")` on a
 *  decoded peer JWS (`agent_admin.py:626`) — whatever that token carried, with
 *  no validation. `delegation.issued`'s `scope` is a request body field. This
 *  console types both as `string[]`, so a malformed peer token would crash the
 *  card on `.map`. A non-array value is shown as-is instead: honest about what
 *  arrived, and not a claim that it was a capability list. */
function CapabilityList({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) {
    return (
      <Detail label={label}>
        <Tag>{JSON.stringify(value)}</Tag>
      </Detail>
    );
  }
  if (value.length === 0) {
    return (
      <Detail label={label}>
        <span style={{ fontSize: 10, color: C.textMuted }}>none</span>
      </Detail>
    );
  }
  return (
    <Detail label={label}>
      {value.map((g, i) => (
        <CapabilityBadge key={`${String(g)}-${i}`} cap={String(g)} />
      ))}
    </Detail>
  );
}

/** The `{token, claims}` object `tct_event()` builds
 *  (`agents/base/tct_claims.py:52-65`), rendered for whichever of
 *  `delegation.issued` / `delegation.redeemed` carried it.
 *
 *  `claims` is deliberately `{}` upstream when the token would not decode, "so
 *  the event is never dropped" — a legitimate state, not a red flag, so the
 *  empty case gets a neutral muted line and no severity colour. Claim *names*
 *  are shown rather than values: the names say what the token asserted, while
 *  a value can be an arbitrary nested object with no safe inline rendering.
 *  Labelled `TOKEN`/`CLAIMS`, not `TCT`, because `delegation.issued` puts a
 *  delegation envelope through the same `tct_event()` helper. */
function TokenClaims({ tct }: { tct: RunEvent['tct'] }) {
  if (!tct || typeof tct !== 'object') return null;
  const claims = tct.claims && typeof tct.claims === 'object' ? tct.claims : undefined;
  const names = claims ? Object.keys(claims) : [];
  return (
    <>
      {typeof tct.token === 'string' && (
        <Detail label="TOKEN">
          <span className="mono" style={{ fontSize: 10, color: C.textDim }}>
            {shortId(tct.token, 24)}
          </span>
        </Detail>
      )}
      <Detail label="CLAIMS">
        {names.length > 0 ? (
          names.map((n) => <Tag key={n}>{n}</Tag>)
        ) : (
          <span style={{ fontSize: 10, color: C.textDim }}>
            no claims decoded from the token
          </span>
        )}
      </Detail>
    </>
  );
}

/** A peer's manifest failed `verify_manifest_json`. Emitted both from the
 *  orchestrator (`engine.py:641-645`, carrying `step_id`/`agent_id`) and from
 *  an agent (`agent_admin.py:127-132`, without them), so both are optional and
 *  one card renders either. */
export function ManifestVerifyFailedCard({ evt }: { evt: RunEvent }) {
  const verdict = manifestVerifyFailedVerdict(evt.cause);
  return (
    <TrustCard verdict={verdict}>
      {evt.source_url && (
        <Detail label="MANIFEST">
          <span className="mono" style={{ fontSize: 10, color: C.textDim }}>
            {evt.source_url}
          </span>
        </Detail>
      )}
      {(evt.step_id || evt.agent_id) && (
        <Detail label="WHERE">
          {evt.step_id && <Tag>step {evt.step_id}</Tag>}
          {evt.agent_id && <Tag>{evt.agent_id}</Tag>}
        </Detail>
      )}
    </TrustCard>
  );
}

/** A revocation snapshot was discarded at ingest (RFC-AITP-0008 §1.5). */
export function RevocationVerifyFailedCard({ evt }: { evt: RunEvent }) {
  const verdict = revocationVerifyFailedVerdict(evt.cause);
  return (
    <TrustCard verdict={verdict}>
      {evt.detail && <Detail label="DETAIL">{evt.detail}</Detail>}
    </TrustCard>
  );
}

/** A capability call was answered on a stale deny-set because
 *  `fail_mode=soft_fail` (`aitp_server.py:341-346`).
 *
 *  The most easily over- and under-stated of the five: it is neither a
 *  failure nor a success, it is a call answered without current revocation
 *  data. And `serves` is a **sample, not a total** — the event fires on the
 *  1st degraded serve and every 100th thereafter (`aitp_server.py:340`) — so
 *  the copy gives it as an occurrence ordinal and names the sampling. */
export function RevocationDegradedServeCard({ evt }: { evt: RunEvent }) {
  const verdict: TrustVerdict = {
    color: C.amber,
    headline: 'SERVED WITHOUT CURRENT REVOCATION DATA',
    text: 'a call was answered on the last verified deny-set',
  };
  return (
    <TrustCard verdict={verdict} icon={<AlertTriangle size={14} color={C.amber} />}>
      {evt.reason && <Detail label="REASON">{evt.reason}</Detail>}
      {evt.fail_mode && (
        <Detail label="FAIL MODE">
          <Tag>{evt.fail_mode}</Tag>
        </Detail>
      )}
      {evt.serves !== null && evt.serves !== undefined && (
        <Detail label="SAMPLED">
          occurrence #{String(evt.serves)} — emitted on the 1st degraded serve and every 100th
          after it, so this is not a count of how many there have been
        </Detail>
      )}
    </TrustCard>
  );
}

/** A delegation redemption was refused (`aitp_server.py:607-609`).
 *
 *  Carries only `error`, a stringified exception. It is rendered as-is: there
 *  is no code to parse out of free text, and guessing one would invent a
 *  taxonomy the producer never emitted. */
export function DelegationRejectedCard({ evt }: { evt: RunEvent }) {
  const verdict: TrustVerdict = {
    color: C.red,
    headline: 'DELEGATION REJECTED',
    text: 'a delegation redemption was refused',
  };
  return (
    <TrustCard verdict={verdict} icon={<XCircle size={14} color={C.red} />}>
      {evt.error && <Detail label="ERROR">{evt.error}</Detail>}
    </TrustCard>
  );
}

/** A delegation was minted and handed to a delegatee
 *  (`agent_admin.py:572-580`).
 *
 *  Blue, not the `verified` teal and not the success green: this console
 *  checked nothing here, it is relaying an agent's self-reported milestone. */
export function DelegationIssuedCard({ evt }: { evt: RunEvent }) {
  const verdict: TrustVerdict = {
    color: C.blue,
    headline: 'DELEGATION ISSUED',
    text: 'an agent signed a delegation for a delegatee',
  };
  return (
    <TrustCard verdict={verdict} icon={<KeyRound size={14} color={C.blue} />}>
      {evt.delegatee_aid && (
        <Detail label="DELEGATEE">
          <AidCell aid={evt.delegatee_aid} />
        </Detail>
      )}
      <CapabilityList label="SCOPE" value={evt.scope} />
      <TokenClaims tct={evt.tct} />
    </TrustCard>
  );
}

/**
 * `delegation.redeemed` — the success counterpart, and the one event with a
 * genuine three-way field-set problem. Its three emit sites carry three
 * different key sets, so the card renders what is present and nothing more:
 *
 * - **Site 1** (`aitp_server.py:616-621`) — the issuer minted a fresh TCT:
 *   `role: "issuer"`, `delegatee_aid`, `grants`.
 * - **Site 2** (`agent_admin.py:622-628`) — the delegatee's happy path:
 *   `tct` (`{token, claims}`), `peer_aid`, `grants`, `jti`. All three of
 *   `peer_aid`/`grants`/`jti` come from `claims.get(...)`, so any of them can
 *   legitimately be `null` even here.
 * - **Site 3** (`agent_admin.py:631`) — the `except (ValueError, KeyError)`
 *   arm at `:629`, carrying `peer_port` **only**. It has two triggers: the
 *   response body was not `{"tct": …}`, *or* `decode_claims` failed on a token
 *   that was present. So the copy must claim neither a TCT, nor claims, nor a
 *   verified delegation — and equally must not say the peer returned something
 *   that wasn't a TCT, because sometimes it was one. It states the redemption
 *   completed against a port, says the event carried nothing further, and
 *   stops.
 *
 * Blue rather than the `verified` teal this repo reserves for checked facts,
 * or the green it uses for completed work: nothing here was verified by this
 * console.
 */
export function DelegationRedeemedCard({ evt }: { evt: RunEvent }) {
  const tct = evt.tct && typeof evt.tct === 'object' ? evt.tct : undefined;
  const isIssuer = evt.role === 'issuer' || (!!evt.delegatee_aid && !tct);
  const isDelegatee = !isIssuer && (!!tct || !!evt.peer_aid || !!evt.jti);
  const hasPort = !isIssuer && !isDelegatee && evt.peer_port !== null && evt.peer_port !== undefined;

  let text: string;
  if (isIssuer) {
    text = 'an agent issued a fresh TCT to a delegatee';
  } else if (isDelegatee) {
    text = 'a delegatee redeemed a delegation and holds a fresh TCT';
  } else if (hasPort) {
    text = `redemption completed against port ${String(evt.peer_port)}`;
  } else {
    text = 'a redemption completed';
  }

  const verdict: TrustVerdict = { color: C.blue, headline: 'DELEGATION REDEEMED', text };

  return (
    <TrustCard verdict={verdict} icon={<KeyRound size={14} color={C.blue} />}>
      {isIssuer && evt.delegatee_aid && (
        <Detail label="DELEGATEE">
          <AidCell aid={evt.delegatee_aid} />
        </Detail>
      )}
      {isDelegatee && evt.peer_aid && (
        <Detail label="PEER">
          <AidCell aid={evt.peer_aid} />
        </Detail>
      )}
      {isDelegatee && evt.jti && (
        <Detail label="JTI">
          <span className="mono" style={{ fontSize: 10, color: C.textDim }}>
            {shortId(evt.jti, 18)}
          </span>
        </Detail>
      )}
      {(isIssuer || isDelegatee) && <CapabilityList label="GRANTS" value={evt.grants} />}
      {isDelegatee && <TokenClaims tct={evt.tct} />}
      {!isIssuer && !isDelegatee && (
        <Detail label="NOTE">
          this event carried no claims and no peer identity — nothing further is asserted
        </Detail>
      )}
    </TrustCard>
  );
}

function Line({
  color,
  children,
  ts,
  dotClass,
  dotIcon,
}: {
  color: string;
  children: React.ReactNode;
  ts?: string;
  dotClass?: string;
  dotIcon?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      {dotIcon ?? (
        <div
          className={dotClass}
          style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }}
        />
      )}
      {ts && (
        <span className="mono" style={{ fontSize: 10, color: C.textMuted, minWidth: 48 }}>
          {ts}
        </span>
      )}
      {children}
    </div>
  );
}

export function TrustFlowCard({ evt }: { evt: RunEvent }) {
  return (
    <Card style={{ padding: '14px 16px', borderLeft: `3px solid ${C.blue}`, marginTop: 4 }}>
      <div
        style={{
          fontSize: 11,
          color: C.blue,
          marginBottom: 12,
          fontWeight: 600,
          letterSpacing: '0.05em',
        }}
      >
        AITP MUTUAL HANDSHAKE
      </div>
      {(
        [
          ['MUTUAL_HELLO', '→', C.teal],
          ['MUTUAL_HELLO_ACK', '←', C.blue],
          ['MUTUAL_COMMIT', '→', C.teal],
          ['MUTUAL_COMMIT_ACK + TCT', '←', C.green],
        ] as const
      ).map(([msg, dir, col]) => (
        <div
          key={msg}
          style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, fontSize: 11 }}
        >
          <span className="mono" style={{ color: C.textDim, minWidth: 80 }}>
            {evt.initiator}
          </span>
          <span style={{ color: col }}>{dir === '→' ? '─────' : ''}</span>
          <span
            className="mono"
            style={{ color: col, fontSize: 10, flex: 1, textAlign: 'center' }}
          >
            {msg}
          </span>
          <span style={{ color: col }}>{dir === '←' ? '─────' : ''}</span>
          <span className="mono" style={{ color: C.textDim, minWidth: 60, textAlign: 'right' }}>
            {evt.target}
          </span>
        </div>
      ))}
      <div
        style={{
          display: 'flex',
          gap: 24,
          marginTop: 10,
          padding: '8px 10px',
          background: C.bg3,
          borderRadius: 5,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>TCT GRANTS</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(evt.grants ?? []).map((g) => (
              <CapabilityBadge key={g} cap={g} />
            ))}
            {(evt.grants ?? []).length === 0 && (
              <span style={{ fontSize: 10, color: C.textMuted }}>none</span>
            )}
          </div>
        </div>
        {evt.jti && (
          <div>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>JTI</div>
            <span className="mono" style={{ fontSize: 10, color: C.textDim }}>
              {shortId(evt.jti, 18)}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

export function StepOutputCard({ evt }: { evt: RunEvent }) {
  const [open, setOpen] = useState(false);
  const result = evt.result as Record<string, unknown> | undefined;

  if (!result) return null;

  return (
    <Card style={{ borderLeft: `3px solid ${C.amber}`, marginTop: 4 }}>
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: C.amber,
              fontWeight: 600,
              letterSpacing: '0.05em',
              marginBottom: 3,
            }}
          >
            STEP COMPLETE · <span className="mono">{evt.step_id?.toUpperCase()}</span>
          </div>
          <div style={{ fontSize: 12, color: C.textDim }}>
            {evt.agent ?? evt.agent_id} {evt.capability && '· '}
            {evt.capability && <CapabilityBadge cap={evt.capability} />}
          </div>
        </div>
        <ChevronDown
          size={14}
          color={C.textMuted}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
        />
      </div>
      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          {Object.entries(result).map(([k, v]) => (
            <div
              key={k}
              style={{ background: C.bg3, borderRadius: 6, padding: 12, marginBottom: 8 }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: C.textMuted,
                  marginBottom: 6,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                {k}
              </div>
              <div
                className={typeof v === 'object' ? 'mono' : undefined}
                style={{
                  fontSize: typeof v === 'object' ? 11 : 12,
                  color: C.textDim,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
