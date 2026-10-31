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
 *  Read from `aitp-rs` at tag `aitp-v0.24.0` — the version `package.json`'s
 *  `//aitp` key pins — in `crates/aitp/src/manifest/verifier.rs`:
 *
 *      version `:79` → expiry `:84` → AID→key parse `:92`
 *        → PoP `:94` → OUTER SIGNATURE `:109` → identity-hint `:119`
 *
 *  with the errors constructed at `:101`/`:104`/`:107` (`PopFailed`),
 *  `:114`/`:117` (`SignatureInvalid`) and `:123`-`:148`
 *  (`IdentityHintMalformed`). That is RFC-AITP-0003 §5's order, and the
 *  rustdoc (`:54-70`) now agrees with the code.
 *
 *  `0.12.0`-`0.23.x` checked the outer signature *before* PoP, so on those
 *  releases `pop_failed` implied a verified signature. From `0.24.0` it does
 *  not: a Manifest failing both checks is `pop_failed`, and its signature
 *  was never assessed. Only `identity_hint_malformed` still *implies a
 *  verified outer signature*. So `pop_failed` gets a row of its own that
 *  makes no claim about the signature (`MANIFEST_PRE_SIGNATURE_REJECTION_DETAIL`),
 *  and `identity_hint_malformed` keeps the post-signature row
 *  (`MANIFEST_POST_SIGNATURE_DETAIL`). For a producer still on an older SDK,
 *  "signature not assessed" understates what was checked. That is the
 *  safe direction for a verification badge.
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
 *    `check_identity_type_compatibility` (`verifier.rs:197`), which
 *    `verify_manifest` never calls and the Node binding does not export
 *    (its one non-test caller is `crates/aitp/src/facade.rs:509`).
 *
 *  Two codes come from the wire parse that `verifyManifestJson` runs
 *  *before* `verify_manifest` (from `0.15.0`: `wire::manifest` →
 *  `parse_manifest_wire`, `bindings/aitp-node/src/lib.rs:79-95`), so
 *  neither reaches the version check, let alone the signature:
 *
 *  - `unknown_field` — a member outside the schema (top-level or inside
 *    `manifest`). On `0.10.0`–`0.14.x` the same input arrived as
 *    `malformed` (serde `deny_unknown_fields`); `0.15.0`+ types it.
 *  - `malformed` — everything else the wire parse rejects, including a
 *    duplicate key.
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

/** Manifest codes that can only be reached *after* the outer signature has
 *  already verified (see the check order above), mapped to the check that
 *  actually failed. A `Record` rather than a `Set` because each code must
 *  name its own failed check rather than share one vague phrase. Since
 *  `0.24.0` the only such code is `identity_hint_malformed`; `pop_failed`
 *  moved to `MANIFEST_PRE_SIGNATURE_REJECTION_DETAIL` below.
 *
 *  These stay `C.red` with a muted `aidColor`, exactly like a signature
 *  failure — deliberately, and load-bearing. RFC-AITP-0003 §5 requires
 *  discarding a manifest that fails *any* step, so "the signature verified"
 *  is not a licence to colour the AID as a checked fact. The net effect on
 *  colour is zero; only the wording changes, so the badge states what the
 *  verifier established *and* what it rejected instead of implying the
 *  signature was the thing that failed.
 *
 *  Lookups must be membership-tested, never truthiness-tested and never fed
 *  unguarded into a template string. `Verdict.code` is `string`, not a
 *  union (`types/cp.ts:137`), and `tsconfig.json` sets `strict` **without**
 *  `noUncheckedIndexedAccess` (which `strict` does not imply), so an indexed
 *  read types as `string` while returning `undefined` at runtime — an
 *  unknown code would render the literal `undefined` into the badge instead
 *  of falling through to the catch-all. `Object.hasOwn` rather than `in`:
 *  `in` walks the prototype chain, so `'toString'` would test true. */
const MANIFEST_POST_SIGNATURE_DETAIL: Record<string, string> = {
  identity_hint_malformed: 'identity hint is malformed',
};

/** Manifest codes that are a definite rejection reached *before* the outer
 *  signature is checked (see the check order above), mapped to the check
 *  that failed. Unlike the amber unassessed codes, the verifier did
 *  establish something here: the proof of possession is invalid, so
 *  RFC-AITP-0003 §5 requires discarding the manifest. It is red with a muted
 *  AID, like the post-signature row, but the wording says the signature was
 *  not assessed instead of claiming it verified. Same membership-test rule
 *  as `MANIFEST_POST_SIGNATURE_DETAIL`. */
const MANIFEST_PRE_SIGNATURE_REJECTION_DETAIL: Record<string, string> = {
  pop_failed: 'proof-of-possession failed',
};

/** What check failed for a manifest code that rejects before the outer
 *  signature is assessed, or `undefined` for any other code. Exported for
 *  the same reason as `manifestPostSignatureDetail`: one copy of the map,
 *  shared by the CP badge and the run-timeline card. */
export function manifestPreSignatureRejectionDetail(code: string): string | undefined {
  return Object.hasOwn(MANIFEST_PRE_SIGNATURE_REJECTION_DETAIL, code)
    ? MANIFEST_PRE_SIGNATURE_REJECTION_DETAIL[code]
    : undefined;
}

/** What check failed for a manifest code reachable only *after* the outer
 *  signature verified, or `undefined` for any other code — exported so other
 *  surfaces (playground's `manifest.verify_failed` run-timeline card) reuse
 *  this *mapping* rather than a second copy of the two-entry list that could
 *  drift from it. The `Record` itself stays module-private; this function is
 *  the only way in, membership-tested via `Object.hasOwn` for the same
 *  prototype-chain reason as `isUnassessedManifestCode` above — `code` is an
 *  arbitrary producer string, and `'toString' in MANIFEST_POST_SIGNATURE_DETAIL`
 *  would otherwise test `true`. */
export function manifestPostSignatureDetail(code: string): string | undefined {
  return Object.hasOwn(MANIFEST_POST_SIGNATURE_DETAIL, code)
    ? MANIFEST_POST_SIGNATURE_DETAIL[code]
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
 * - `pop_failed` gets a row naming the failed check and saying the
 *   signature was not assessed: since `0.24.0` PoP is checked before the
 *   signature. Red, muted AID — see `MANIFEST_PRE_SIGNATURE_REJECTION_DETAIL`.
 * - `identity_hint_malformed` gets a row saying what was established *and*
 *   what was rejected: it is constructed strictly after the outer signature
 *   verified, so bucketing it with `signature_invalid` would tell an
 *   operator the signature was bad when it was demonstrably good. Still
 *   red, still a muted AID — see `MANIFEST_POST_SIGNATURE_DETAIL`.
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
  if (verdict.checked && Object.hasOwn(MANIFEST_POST_SIGNATURE_DETAIL, verdict.code)) {
    const detail = MANIFEST_POST_SIGNATURE_DETAIL[verdict.code];
    return {
      text: `· REJECTED · signature verified · ${detail} (${verdict.code})`,
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
