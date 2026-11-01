import { C } from './colors';
import type { Verdict } from './types/cp';

export interface VerdictBadge {
  text: string;
  color: string;
  /** The AID itself is only ever coloured as verified on `ok: true` — an
   *  expired-but-possibly-forged manifest has exactly the epistemic status
   *  it had before verification shipped, and must not imply otherwise. */
  aidColor: string;
}

/** Manifest codes that occur strictly *before* `verify_manifest` reaches
 *  the outer signature check, plus `malformed` and `unknown_field` (wire
 *  parse failures before any of that runs). None of these establish
 *  anything about authenticity in either direction — rendering them the
 *  same as a real signature failure is the exact overclaim this plan exists
 *  to remove. Found while
 *  implementing Phase 4 (flagged there as `[O1]`, for the revocation side
 *  of the same defect) and back-ported here before merge, since it's the
 *  identical bug for the manifest side.
 *
 *  ## The check order every branch below rests on
 *
 *  Read from `aitp-rs` at tag `aitp-v0.25.1` — the version `package.json`'s
 *  `//aitp` key pins — in `crates/aitp/src/manifest/verifier.rs`:
 *
 *      version `:97` → grammar `:102` (identity hint included)
 *        → expiry `:105` → AID→key parse → PoP `:125` → OUTER SIGNATURE `:135`
 *
 *  That is RFC-AITP-0003 §5's order.
 *
 *  `0.12.0`-`0.23.x` checked the outer signature *before* PoP, and checked the
 *  identity hint after it. `0.24.0` moved PoP ahead of the signature, and
 *  `0.25.0` moved the identity-hint check into the grammar step. So from
 *  `0.25.0` no rejection code implies a verified signature: `pop_failed` and
 *  `identity_hint_malformed` get a row that names the failed check and makes
 *  no claim about the signature (`MANIFEST_PRE_SIGNATURE_REJECTION_DETAIL`).
 *  For a producer still on an older SDK, "signature not assessed" understates
 *  what was checked. That is the safe direction for a verification badge.
 *
 *  ## Codes deliberately left to the generic red catch-all
 *
 *  Two entries in the Node binding's documented nine-code taxonomy
 *  (`bindings/aitp-node/src/lib.rs:64-67`) are not modelled here, because
 *  neither is constructible through `verifyManifestJson` as of `0.17.0`:
 *
 *  - `aid_mismatch` — the variant is declared
 *    (`crates/aitp-manifest/src/error.rs:20`) and mapped by the binding
 *    (`bindings/aitp-node/src/lib.rs:52`), so it appears in the binding's
 *    documented `.code` contract, but its only construction sites are in
 *    `crates/aitp-manifest/src/resolver.rs:91,153`, which neither
 *    `verify_manifest` nor the Node binding calls. Unreachable from this
 *    console, not merely unlikely. The spec's conformance suite treats it
 *    as equivalent to a signature failure, so the generic red bucket stays
 *    the safe-side choice if it ever does start arriving.
 *  - `incompatible_identity_type` — produced only by
 *    `check_identity_type_compatibility` (`verifier.rs:444`), which
 *    `verify_manifest` never calls. From `0.25.0` the SDKs' `buildHello` /
 *    `build_hello` call it, but this console builds no HELLO.
 *
 *  Two codes come from the wire parse that `verifyManifestJson` runs
 *  *before* `verify_manifest` (from `0.15.0`: `wire::manifest` →
 *  `parse_manifest_wire`), so neither reaches the signature:
 *
 *  - `unknown_field` — a member outside the schema (top-level or inside
 *    `manifest`). On `0.10.0`–`0.14.x` the same input arrived as
 *    `malformed` (serde `deny_unknown_fields`); `0.15.0`+ types it. From
 *    `0.25.0` an unknown `version` is reported ahead of a stray `manifest`
 *    member, as `version_unknown`.
 *  - `malformed` — everything else the wire parse rejects, including a
 *    duplicate key. From `0.25.0` also any value `verify_manifest`'s grammar
 *    step refuses, such as a `handshake_endpoint` that is not `https://`.
 *
 *  Both are amber, with `version_unknown`;
 *  `src/test/sdk-verification.integration.test.ts` pins the literals
 *  end-to-end. */
const MANIFEST_UNASSESSED_CODES = new Set([
  'version_unknown',
  'malformed',
  'unknown_field',
]);

/** Whether a manifest code means "the signature was never assessed" — the
 *  classification rule behind this module's amber bucket, exported so other
 *  surfaces (playground's `manifest.verify_failed` cards) reuse the *rule*
 *  rather than a second copy of the list that can drift from it. The `Set`
 *  itself stays module-private and therefore un-mutatable by callers, and
 *  `manifestVerdictBadge` routes through this very function, so there is
 *  exactly one code path — not a public wrapper over a private branch. */
export function isUnassessedManifestCode(code: string): boolean {
  return MANIFEST_UNASSESSED_CODES.has(code);
}

/** Manifest codes that are a definite rejection reached *before* the outer
 *  signature is checked (see the check order above), mapped to the check
 *  that failed. A `Record` rather than a `Set` because each code must name
 *  its own failed check rather than share one vague phrase. Unlike the amber
 *  unassessed codes, the verifier did establish something here: the proof of
 *  possession is invalid, or the identity hint breaks the rules of its type,
 *  so RFC-AITP-0003 §5 requires discarding the manifest. It is red with a
 *  muted AID, and the wording says the signature was not assessed.
 *
 *  Lookups must be membership-tested, never truthiness-tested and never fed
 *  unguarded into a template string. `Verdict.code` is `string`, not a
 *  union (`types/cp.ts:137`), and `tsconfig.json` sets `strict` **without**
 *  `noUncheckedIndexedAccess` (which `strict` does not imply), so an indexed
 *  read types as `string` while returning `undefined` at runtime — an
 *  unknown code would render the literal `undefined` into the badge instead
 *  of falling through to the catch-all. `Object.hasOwn` rather than `in`:
 *  `in` walks the prototype chain, so `'toString'` would test true. */
const MANIFEST_PRE_SIGNATURE_REJECTION_DETAIL: Record<string, string> = {
  pop_failed: 'proof-of-possession failed',
  identity_hint_malformed: 'identity hint is malformed',
};

/** What check failed for a manifest code that rejects before the outer
 *  signature is assessed, or `undefined` for any other code. Exported so other
 *  surfaces (playground's `manifest.verify_failed` run-timeline card) reuse
 *  this *mapping* rather than a second copy that could drift from it. The
 *  `Record` itself stays module-private; this function is the only way in,
 *  membership-tested via `Object.hasOwn` for the same prototype-chain reason
 *  as `isUnassessedManifestCode` above. */
export function manifestPreSignatureRejectionDetail(code: string): string | undefined {
  return Object.hasOwn(MANIFEST_PRE_SIGNATURE_REJECTION_DETAIL, code)
    ? MANIFEST_PRE_SIGNATURE_REJECTION_DETAIL[code]
    : undefined;
}

/**
 * Render a manifest verification verdict. One row per thing the verifier
 * can actually establish, not a refinement of three:
 *
 * - `expired` gets its own row because `verify_manifest` checks expiry
 *   *before* the signature, so `code: "expired"` establishes nothing about
 *   authenticity in either direction — it must not render as a softer
 *   "verified" (green) or as an authenticity failure (red). Same reasoning
 *   extends to `version_unknown` and `malformed`, which never reach the
 *   signature check either.
 * - `signature_invalid` gets its own row because it is the one code that
 *   really does mean the signature failed.
 * - `pop_failed` and `identity_hint_malformed` get a row naming the failed
 *   check and saying the signature was not assessed: since `0.25.0` both are
 *   checked before the signature. Red, muted AID — see
 *   `MANIFEST_PRE_SIGNATURE_REJECTION_DETAIL`.
 *
 * Branch order is load-bearing: the red code branches must sit *after*
 * the `expired` and unassessed branches (or an amber state silently turns
 * red) and *before* the generic catch-all (or they never fire).
 *
 * See Phase 3 / Appendix §G3 of plans/cp-signed-artifact-verification.md,
 * and [O1] for the revocation side of the same defect.
 */
export function manifestVerdictBadge(verdict: Verdict): VerdictBadge {
  if (verdict.checked && verdict.ok) {
    return {
      text: '· verified · signed by the key bound to this AID',
      color: C.green,
      aidColor: C.tealBright,
    };
  }
  if (verdict.checked && verdict.code === 'expired') {
    return {
      text: "· EXPIRED · signature not assessed — the CP's manifest lapsed before it could be checked",
      color: C.amber,
      aidColor: C.textMuted,
    };
  }
  if (verdict.checked && isUnassessedManifestCode(verdict.code)) {
    return {
      text: `· NOT VERIFIED · signature not assessed (${verdict.code})`,
      color: C.amber,
      aidColor: C.textMuted,
    };
  }
  if (verdict.checked && verdict.code === 'signature_invalid') {
    return {
      text: `· SIGNATURE INVALID (${verdict.code})`,
      color: C.red,
      aidColor: C.textMuted,
    };
  }
  if (verdict.checked && Object.hasOwn(MANIFEST_PRE_SIGNATURE_REJECTION_DETAIL, verdict.code)) {
    const detail = MANIFEST_PRE_SIGNATURE_REJECTION_DETAIL[verdict.code];
    return {
      text: `· REJECTED · ${detail} · signature not assessed (${verdict.code})`,
      color: C.red,
      aidColor: C.textMuted,
    };
  }
  if (verdict.checked) {
    return {
      text: `· VERIFICATION FAILED (${verdict.code})`,
      color: C.red,
      aidColor: C.textMuted,
    };
  }
  return {
    text: `· signature not checked (${verdict.reason})`,
    color: C.amber,
    aidColor: C.textMuted,
  };
}

/** Revocation codes that occur strictly before `verify_revocation_list`
 *  reaches the signature check (the binding's wire parse — member set,
 *  duplicate keys, UUID-v4 `entries[].jti` — then `aitp-tct/src/revocation.rs`:
 *  version → expiry → issuer → key parse → signature) and that carry no actionable
 *  signal of their own beyond "we couldn't get far enough to check" --
 *  unlike `issuer_mismatch`, which is pre-signature too but *is*
 *  independently meaningful. The console verifies no revocation list itself
 *  (the CP signs none since CP1.1); these codes reach it only in playground
 *  run events, where an agent reports why it refused a list. */
const REVOCATION_UNASSESSED_CODES = new Set([
  'version_unknown',
  'malformed',
  'unknown_field',
]);

/** Whether a revocation code means "the signature was never assessed" —
 *  the revocation twin of `isUnassessedManifestCode`. The `Set` stays
 *  module-private so every caller goes through this one predicate.
 *
 *  Note for reusers: this set covers the codes the *SDK* produces. Other
 *  producers have their own vocabularies — notably a cause that is
 *  post-signature (a snapshot that verified and then failed to parse) is
 *  NOT unassessed, and this predicate correctly returns `false` for it.
 *  `false` here means "not in the pre-signature bucket", never "this was a
 *  signature failure". */
export function isUnassessedRevocationCode(code: string): boolean {
  return REVOCATION_UNASSESSED_CODES.has(code);
}
