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
 *  the outer signature check (`aitp-manifest/src/verifier.rs`: version →
 *  expiry → AID→key parse → signature → PoP → identity-hint), plus
 *  `malformed` (a parse failure before any of that runs). None of these
 *  establish anything about authenticity in either direction — rendering
 *  them the same as a real signature failure is the exact overclaim this
 *  plan exists to remove. Found while implementing Phase 4 (flagged there
 *  as `[O1]`, for the revocation side of the same defect) and back-ported
 *  here before merge, since it's the identical bug for the manifest side.
 *  `aid_mismatch` is deliberately *not* here: it is never actually
 *  returned by the current verifier (dead code in the SDK's own type
 *  surface), and the spec conformance suite treats it as equivalent to a
 *  signature failure, so erring toward "checked and failed" is the
 *  safe-side choice if it ever is. */
const MANIFEST_UNASSESSED_CODES = new Set(['version_unknown', 'malformed']);

/**
 * Render a manifest verification verdict. Four states, not a refinement of
 * three: `expired` gets its own row because `verify_manifest` checks
 * expiry *before* the signature, so `code: "expired"` establishes nothing
 * about authenticity in either direction — it must not render as a softer
 * "verified" (green) or as an authenticity failure (red). Same reasoning
 * extends to `version_unknown` and `malformed`, which never reach the
 * signature check either. See Phase 3 / Appendix §G3 of
 * plans/cp-signed-artifact-verification.md.
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
  if (verdict.checked && MANIFEST_UNASSESSED_CODES.has(verdict.code)) {
    return {
      text: `· NOT VERIFIED · signature not assessed (${verdict.code})`,
      color: C.amber,
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
