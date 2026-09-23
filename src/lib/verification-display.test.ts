import { C } from './colors';
import { manifestVerdictBadge, revocationVerdictBadge } from './verification-display';
import type { RevocationVerdict, Verdict } from './types/cp';

describe('manifestVerdictBadge', () => {
  it('checked:true, ok:true → verified, green, teal AID', () => {
    const verdict: Verdict = { checked: true, ok: true };
    const badge = manifestVerdictBadge(verdict);
    expect(badge.color).toBe(C.green);
    expect(badge.aidColor).toBe(C.tealBright);
    expect(badge.text).toContain('verified');
  });

  it('checked:true, ok:false, code:expired → amber, muted AID, expiry wording (not a signature failure)', () => {
    const verdict: Verdict = { checked: true, ok: false, code: 'expired' };
    const badge = manifestVerdictBadge(verdict);
    expect(badge.color).toBe(C.amber);
    expect(badge.aidColor).toBe(C.textMuted);
    expect(badge.text).toContain('EXPIRED');
    expect(badge.text).toContain('signature not assessed');
    expect(badge.text).not.toContain('VERIFICATION FAILED');
  });

  it.each(['version_unknown', 'malformed'])(
    'checked:true, ok:false, code:%s (MANIFEST_UNASSESSED_CODES) → amber, muted AID, NOT VERIFIED',
    (code) => {
      const verdict: Verdict = { checked: true, ok: false, code };
      const badge = manifestVerdictBadge(verdict);
      expect(badge.color).toBe(C.amber);
      expect(badge.aidColor).toBe(C.textMuted);
      expect(badge.text).toContain('NOT VERIFIED');
      expect(badge.text).toContain(code);
      expect(badge.text).not.toContain('VERIFICATION FAILED');
    },
  );

  it('checked:true, ok:false, arbitrary other code → red, muted AID, VERIFICATION FAILED', () => {
    const verdict: Verdict = { checked: true, ok: false, code: 'signature_invalid' };
    const badge = manifestVerdictBadge(verdict);
    expect(badge.color).toBe(C.red);
    expect(badge.aidColor).toBe(C.textMuted);
    expect(badge.text).toContain('VERIFICATION FAILED');
    expect(badge.text).toContain('signature_invalid');
  });

  it('checked:false → amber, muted AID, text includes the reason', () => {
    const verdict: Verdict = { checked: false, reason: 'native addon failed to load' };
    const badge = manifestVerdictBadge(verdict);
    expect(badge.color).toBe(C.amber);
    expect(badge.aidColor).toBe(C.textMuted);
    expect(badge.text).toContain('signature not checked');
    expect(badge.text).toContain('native addon failed to load');
  });
});

describe('revocationVerdictBadge', () => {
  it("checked:true, ok:true, tier:'pinned' → green, entries not greyed, verified wording", () => {
    const verdict: RevocationVerdict = { checked: true, ok: true, tier: 'pinned' };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.green);
    expect(badge.entriesGreyed).toBe(false);
    expect(badge.text).toContain('verified');
  });

  it("checked:true, ok:true, tier:'self-consistent' → dim color, entries not greyed, never says 'verified'", () => {
    const verdict: RevocationVerdict = { checked: true, ok: true, tier: 'self-consistent' };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.textDim);
    expect(badge.entriesGreyed).toBe(false);
    expect(badge.text).toContain('self-consistent');
    // Documented invariant: the self-consistent tier must never claim "verified".
    expect(badge.text).not.toContain('verified');
  });

  it('checked:true, ok:false, code:expired → amber, entries greyed, expiry wording', () => {
    const verdict: RevocationVerdict = { checked: true, ok: false, code: 'expired', tier: 'pinned' };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.amber);
    expect(badge.entriesGreyed).toBe(true);
    expect(badge.text).toContain('EXPIRED');
    expect(badge.text).not.toContain('SIGNATURE INVALID');
  });

  it.each(['version_unknown', 'malformed'])(
    'checked:true, ok:false, code:%s (REVOCATION_UNASSESSED_CODES) → amber, entries greyed, NOT VERIFIED (never SIGNATURE INVALID)',
    (code) => {
      const verdict: RevocationVerdict = { checked: true, ok: false, code, tier: 'pinned' };
      const badge = revocationVerdictBadge(verdict);
      expect(badge.color).toBe(C.amber);
      expect(badge.entriesGreyed).toBe(true);
      expect(badge.text).toContain('NOT VERIFIED');
      expect(badge.text).toContain(code);
      expect(badge.text).not.toContain('SIGNATURE INVALID');
    },
  );

  it('checked:true, ok:false, code:issuer_mismatch → its own red row, entries greyed, distinct from generic signature failure', () => {
    const verdict: RevocationVerdict = {
      checked: true,
      ok: false,
      code: 'issuer_mismatch',
      tier: 'pinned',
    };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.red);
    expect(badge.entriesGreyed).toBe(true);
    expect(badge.text).toContain('ISSUER MISMATCH');
    expect(badge.text).not.toContain('SIGNATURE INVALID');
  });

  it('checked:true, ok:false, arbitrary other code → red, entries greyed, SIGNATURE INVALID', () => {
    const verdict: RevocationVerdict = {
      checked: true,
      ok: false,
      code: 'signature_invalid',
      tier: 'pinned',
    };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.red);
    expect(badge.entriesGreyed).toBe(true);
    expect(badge.text).toContain('SIGNATURE INVALID');
    expect(badge.text).toContain('signature_invalid');
  });

  it("checked:false, reason:'no_trusted_issuer', manifestCode:'expired' → amber, entries greyed, explains the manifest expired", () => {
    const verdict: RevocationVerdict = {
      checked: false,
      reason: 'no_trusted_issuer',
      manifestCode: 'expired',
    };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.amber);
    expect(badge.entriesGreyed).toBe(true);
    expect(badge.text).toContain("manifest has expired");
    expect(badge.text).toContain('no trusted issuer is available');
  });

  it("checked:false, reason:'no_trusted_issuer', manifestCode:<other> → amber, entries greyed, mentions that manifestCode", () => {
    const verdict: RevocationVerdict = {
      checked: false,
      reason: 'no_trusted_issuer',
      manifestCode: 'signature_invalid',
    };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.amber);
    expect(badge.entriesGreyed).toBe(true);
    expect(badge.text).toContain('manifest failed verification (signature_invalid)');
  });

  it("checked:false, reason:'no_trusted_issuer' with no manifestCode → falls through to the generic unchecked branch", () => {
    const verdict: RevocationVerdict = { checked: false, reason: 'no_trusted_issuer' };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.amber);
    expect(badge.entriesGreyed).toBe(true);
    expect(badge.text).toBe('· signature not checked (no_trusted_issuer)');
  });

  it('checked:false, arbitrary other reason, no manifestCode → amber, entries greyed, generic wording', () => {
    const verdict: RevocationVerdict = { checked: false, reason: 'native addon failed to load' };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.amber);
    expect(badge.entriesGreyed).toBe(true);
    expect(badge.text).toContain('signature not checked');
    expect(badge.text).toContain('native addon failed to load');
  });
});

/**
 * The unmodelled-code seam.
 *
 * `Verdict.code` is typed `string`, not a union (`types/cp.ts:137`) — the SDK's
 * codes are deliberately opaque here, per the forward-compat discipline
 * `verify-manifest.ts:12-15` states and `aitp-control-plane/src/lib/registry/
 * enrollment.test.ts:26-43` documents. So every Rust error this console has
 * never heard of — a code added in a future SDK minor, or one of the
 * binding's documented-but-currently-unreachable causes — arrives at exactly
 * one place: each badge function's final `checked` catch-all.
 *
 * Added with the `0.10.0 -> ^0.12.0` floor bump, whose whole risk profile is
 * "the SDK's error vocabulary may move underneath us". Pinning the default
 * is what makes that movement visible instead of silent. The cases below
 * deliberately use codes NO phase of this plan models, so they pin the
 * default rather than any particular classification: adding a named branch
 * for a specific code (which Phase 2 does) must not change what happens to
 * codes that still have none.
 */
describe('unmodelled SDK codes — the default seam', () => {
  const unmodelled = [
    // A code from a hypothetical future SDK minor.
    'a_code_this_console_has_never_seen',
    // Real, in the Node binding's documented 8-code taxonomy
    // (`bindings/aitp-node/src/lib.rs:62-66`), but not constructible through
    // `verify_manifest_json` today — `check_identity_type_compatibility`
    // (`crates/aitp-manifest/src/verifier.rs:213`) has no `#[napi]`-exported
    // caller. Exactly the shape of thing a future release could start
    // emitting without any `.d.ts` change to warn us.
    'incompatible_identity_type',
  ];

  it.each(unmodelled)(
    'manifest, checked:true, ok:false, unmodelled code %s → red VERIFICATION FAILED carrying the raw code',
    (code) => {
      const badge = manifestVerdictBadge({ checked: true, ok: false, code });
      expect(badge.color).toBe(C.red);
      expect(badge.aidColor).toBe(C.textMuted);
      expect(badge.text).toContain('VERIFICATION FAILED');
      // The raw code must survive into the badge: an unmodelled failure the
      // operator cannot name is an unmodelled failure they cannot report.
      expect(badge.text).toContain(code);
      expect(badge.text).not.toContain('verified');
    },
  );

  it.each(unmodelled)(
    'revocation, checked:true, ok:false, unmodelled code %s → red SIGNATURE INVALID carrying the raw code',
    (code) => {
      const badge = revocationVerdictBadge({ checked: true, ok: false, code, tier: 'pinned' });
      expect(badge.color).toBe(C.red);
      expect(badge.entriesGreyed).toBe(true);
      expect(badge.text).toContain('SIGNATURE INVALID');
      expect(badge.text).toContain(code);
      expect(badge.text).not.toContain('verified');
    },
  );

  // `malformed` is the code an unknown top-level member produces, on 0.10.0
  // and on 0.12.0 alike — measured on both while raising the floor, and
  // pinned end-to-end through the real addon in
  // `src/test/sdk-verification.integration.test.ts`. It must stay on the
  // amber side of this seam: a parse failure establishes nothing about
  // authenticity in either direction.
  it("manifest, code:'malformed' → amber and never claims 'verified'", () => {
    const badge = manifestVerdictBadge({ checked: true, ok: false, code: 'malformed' });
    expect(badge.color).toBe(C.amber);
    expect(badge.aidColor).toBe(C.textMuted);
    expect(badge.text).toContain('signature not assessed');
    // Case-sensitive: lowercase "verified" is the claim, "NOT VERIFIED" is
    // the honest negative. Same invariant as line 72 above.
    expect(badge.text).not.toContain('verified');
    expect(badge.text).not.toContain('VERIFICATION FAILED');
  });

  it("revocation, code:'malformed' → amber and never claims 'verified'", () => {
    const badge = revocationVerdictBadge({
      checked: true,
      ok: false,
      code: 'malformed',
      tier: 'pinned',
    });
    expect(badge.color).toBe(C.amber);
    expect(badge.entriesGreyed).toBe(true);
    expect(badge.text).toContain('signature not assessed');
    expect(badge.text).not.toContain('verified');
    expect(badge.text).not.toContain('SIGNATURE INVALID');
  });
});
