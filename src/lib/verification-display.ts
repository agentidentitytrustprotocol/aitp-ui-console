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

/**
 * Render a manifest verification verdict. Four states, not a refinement of
 * three: `expired` gets its own row because `verify_manifest` checks
 * expiry *before* the signature, so `code: "expired"` establishes nothing
 * about authenticity in either direction — it must not render as a softer
 * "verified" (green) or as an authenticity failure (red). See Phase 3 /
 * Appendix §G3 of plans/cp-signed-artifact-verification.md.
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
