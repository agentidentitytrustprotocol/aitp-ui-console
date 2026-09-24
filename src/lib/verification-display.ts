import { C } from './colors';
import type { RevocationVerdict, Verdict } from './types/cp';

export interface VerdictBadge {
  text: string;
  color: string;
  /** The AID itself is only ever coloured as verified on `ok: true` — an
   *  expired-but-possibly-forged manifest has exactly the epistemic status
   *  it had before verification shipped, and must not imply otherwise. */
  aidColor: string;
}

/** Manifest codes that occur strictly *before* `verify_manifest` reaches
 *  the outer signature check, plus `malformed` (a parse failure before any
 *  of that runs). None of these establish anything about authenticity in
 *  either direction — rendering them the same as a real signature failure
 *  is the exact overclaim this plan exists to remove. Found while
 *  implementing Phase 4 (flagged there as `[O1]`, for the revocation side
 *  of the same defect) and back-ported here before merge, since it's the
 *  identical bug for the manifest side.
 *
 *  ## The check order every branch below rests on
 *
 *  Read from `aitp-rs` at tag `aitp-v0.12.0` — the floor `package.json`'s
 *  `//aitp` key pins — in `crates/aitp-manifest/src/verifier.rs`:
 *
 *      version `:53` → expiry `:58` → AID→key parse `:66`
 *        → OUTER SIGNATURE `:68` → PoP `:101` → identity-hint `:113`
 *
 *  with the errors constructed at `:96`/`:99` (`SignatureInvalid`),
 *  `:105`/`:108`/`:111` (`PopFailed`) and `:117`/`:122`/`:129`
 *  (`IdentityHintMalformed`). That is why `pop_failed` and
 *  `identity_hint_malformed` each *imply a verified outer signature*, and
 *  why they get their own row rather than sharing `signature_invalid`'s —
 *  see `MANIFEST_POST_SIGNATURE_DETAIL` below.
 *
 *  ⚠ **`verify_manifest`'s own rustdoc (`verifier.rs:28-44`) contradicts
 *  the code, and it is the first thing the next auditor of this file will
 *  read.** That rustdoc lists PoP as step 3 and the outer signature as
 *  step 4 — RFC-AITP-0003 §5's *nominal* order, the reverse of what the
 *  implementation does. The numbered step comments and the
 *  error-construction sites above govern; `verifier.rs:68-75` carries the
 *  `mh-002` conformance rationale for the deliberate inversion. **The
 *  rustdoc is stale. Do not revert the post-signature row on the strength
 *  of it** — re-read `:68` and `:101` first.
 *
 *  ## Codes deliberately left to the generic red catch-all
 *
 *  Two entries in the Node binding's documented eight-code taxonomy
 *  (`bindings/aitp-node/src/lib.rs:62-66`) are not modelled here, because
 *  neither is constructible through `verifyManifestJson` as of `0.12.0`:
 *
 *  - `aid_mismatch` — the variant is declared
 *    (`crates/aitp-manifest/src/error.rs:18`) and mapped by the binding
 *    (`bindings/aitp-node/src/lib.rs:50`), so it appears in the binding's
 *    documented `.code` contract, but it has **no construction site
 *    anywhere in `aitp-rs`**: every other reference is a match arm, a
 *    doc comment, or a test. Unreachable, not merely unlikely. The spec's
 *    conformance suite treats it as equivalent to a signature failure, so
 *    the generic red bucket stays the safe-side choice if it ever does
 *    start arriving.
 *  - `incompatible_identity_type` — produced only by
 *    `check_identity_type_compatibility` (`verifier.rs:213`), which
 *    `verify_manifest` never calls and the Node binding does not export
 *    (its one non-test caller is `crates/aitp/src/facade.rs:506`).
 *
 *  And `ManifestError::UnknownField` cannot reach this console at all. Its
 *  only construction site is `parse_manifest_wire`, which
 *  `verify_manifest_json` (`bindings/aitp-node/src/lib.rs:71-88`) never
 *  calls — that entry point runs `serde_json::from_str` and then
 *  `verify_manifest`. An unknown top-level member is caught earlier, by
 *  `#[serde(deny_unknown_fields)]` on `Manifest`
 *  (`crates/aitp-manifest/src/types.rs:11`), and arrives here as
 *  `malformed` — identically before and after the floor bump, which is
 *  what `src/test/sdk-verification.integration.test.ts` pins end-to-end. */
const MANIFEST_UNASSESSED_CODES = new Set(['version_unknown', 'malformed']);

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
 *  name its own failed check: a proof-of-possession failure and a malformed
 *  identity hint send an operator to different places, and one shared vague
 *  phrase would throw that away.
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
  pop_failed: 'proof-of-possession failed',
  identity_hint_malformed: 'identity hint is malformed',
};

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
 * - `pop_failed` and `identity_hint_malformed` get a row saying what was
 *   established *and* what was rejected: both are constructed strictly
 *   after the outer signature verified, so bucketing them with
 *   `signature_invalid` told an operator the signature was bad when it was
 *   demonstrably good. Still red, still a muted AID — see
 *   `MANIFEST_POST_SIGNATURE_DETAIL`.
 *
 * Branch order is load-bearing: the two red code branches must sit *after*
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

export interface RevocationBadge {
  text: string;
  color: string;
  /** True whenever the entry count shouldn't be read as a trustworthy
   *  fact on its own -- everything except a clean `ok: true`. */
  entriesGreyed: boolean;
}

/** Revocation codes that occur strictly before `verify_revocation_list`
 *  reaches the signature check (`aitp-tct/src/revocation.rs`: version →
 *  expiry → issuer → key parse → signature) and that carry no actionable
 *  signal of their own beyond "we couldn't get far enough to check" --
 *  unlike `issuer_mismatch`, which is pre-signature too but *is*
 *  independently meaningful (see below). */
const REVOCATION_UNASSESSED_CODES = new Set(['version_unknown', 'malformed']);

/** Whether a revocation code means "the signature was never assessed" —
 *  the revocation twin of `isUnassessedManifestCode`, exported for the same
 *  reason and with the same guarantees: the `Set` stays module-private, and
 *  `revocationVerdictBadge` routes through this function rather than the
 *  `Set`, so a caller and the badge can never disagree.
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

/**
 * Render a revocation-snapshot verification verdict. `verify_revocation_list`
 * checks version → expiry → issuer → signature, in that order (mirroring
 * `verify_manifest`'s ordering exactly), so three of its five codes never
 * reach the signature check: `version_unknown`, `expired`, `issuer_mismatch`.
 * Labeling any of them "SIGNATURE INVALID" is the same overclaim Phase 3
 * removed for the manifest -- flagged as `[O1]` and fixed here rather than
 * shipped. `issuer_mismatch` gets its own row rather than folding into the
 * generic "not assessed" bucket: unlike a parse failure or a stale
 * timestamp, a declared-issuer mismatch *is* independently actionable (a
 * misconfigured pin, a rotated key, or a forged issuer field) even though
 * it says nothing about the signature -- so it stays in the red,
 * attention-worthy class, just honestly worded.
 */
export function revocationVerdictBadge(verdict: RevocationVerdict): RevocationBadge {
  if (verdict.checked && verdict.ok) {
    return verdict.tier === 'pinned'
      ? { text: '· verified · signed by pinned CP identity', color: C.green, entriesGreyed: false }
      : {
          text: '· self-consistent with CP manifest · no CP_AID pinned',
          color: C.textDim,
          entriesGreyed: false,
        };
  }
  if (verdict.checked && verdict.code === 'expired') {
    return {
      text: '· EXPIRED · signature not assessed (expired)',
      color: C.amber,
      entriesGreyed: true,
    };
  }
  if (verdict.checked && isUnassessedRevocationCode(verdict.code)) {
    return {
      text: `· NOT VERIFIED · signature not assessed (${verdict.code})`,
      color: C.amber,
      entriesGreyed: true,
    };
  }
  if (verdict.checked && verdict.code === 'issuer_mismatch') {
    return { text: '· ISSUER MISMATCH (issuer_mismatch)', color: C.red, entriesGreyed: true };
  }
  if (verdict.checked) {
    return {
      text: `· SIGNATURE INVALID (${verdict.code})`,
      color: C.red,
      entriesGreyed: true,
    };
  }
  // Tier 1 had no trusted issuer to check against, and the CP manifest's own
  // failure code is why. Naming that code is the actually-observed fact and
  // the most actionable thing in the string, so it stays.
  //
  // What used to follow it — a parenthetical naming the sibling control-plane
  // repo as the culprit — does not, and must not come back. This console
  // observed that the CP's manifest did not verify; it never observed *why*.
  // An expired or unverifiable CP manifest is equally consistent with a
  // misconfigured `CP_URL`, a stale proxy cache, clock skew on this side, or
  // an upstream that genuinely is broken. Naming one cause picks a hypothesis
  // and dresses it as a finding — the same class of overclaim the rest of this
  // module exists to remove. The specific upstream bug that parenthetical once
  // pointed at was in fact fixed by `aitp-control-plane` `4c62641` (PR #74,
  // 2026-08-28) and `c74a190` (PR #77, 2026-08-29), so the attribution was not
  // merely unobserved — it was also, by then, false.
  if (verdict.reason === 'no_trusted_issuer' && verdict.manifestCode) {
    const cause =
      verdict.manifestCode === 'expired'
        ? "the CP's manifest has expired, so no trusted issuer is available"
        : `the CP's manifest failed verification (${verdict.manifestCode}), so no trusted issuer is available`;
    return { text: `· signature not checked · ${cause}`, color: C.amber, entriesGreyed: true };
  }
  return { text: `· signature not checked (${verdict.reason})`, color: C.amber, entriesGreyed: true };
}
