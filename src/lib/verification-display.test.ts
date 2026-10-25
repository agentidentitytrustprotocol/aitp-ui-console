import { C } from './colors';
import {
  isUnassessedManifestCode,
  isUnassessedRevocationCode,
  manifestPostSignatureDetail,
  manifestVerdictBadge,
} from './verification-display';
import type { Verdict } from './types/cp';

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

  // Pins the pre-signature output as unchanged by the post-signature work
  // below: a future edit must not quietly move a pre-signature code out of
  // the amber row and into one of the red ones.
  it.each(['version_unknown', 'malformed', 'unknown_field'])(
    'checked:true, ok:false, code:%s (MANIFEST_UNASSESSED_CODES) → amber, muted AID, NOT VERIFIED — never SIGNATURE INVALID or REJECTED',
    (code) => {
      const verdict: Verdict = { checked: true, ok: false, code };
      const badge = manifestVerdictBadge(verdict);
      expect(badge.color).toBe(C.amber);
      expect(badge.aidColor).toBe(C.textMuted);
      expect(badge.text).toBe(`· NOT VERIFIED · signature not assessed (${code})`);
      expect(badge.text).not.toContain('VERIFICATION FAILED');
      expect(badge.text).not.toContain('SIGNATURE INVALID');
      expect(badge.text).not.toContain('REJECTED');
    },
  );

  it('checked:true, ok:false, code:signature_invalid → red, muted AID, SIGNATURE INVALID — the one code that really does mean the signature failed', () => {
    const verdict: Verdict = { checked: true, ok: false, code: 'signature_invalid' };
    const badge = manifestVerdictBadge(verdict);
    expect(badge.color).toBe(C.red);
    expect(badge.aidColor).toBe(C.textMuted);
    expect(badge.text).toBe('· SIGNATURE INVALID (signature_invalid)');
    expect(badge.text).toContain('SIGNATURE INVALID');
    // It must no longer share the generic bucket with codes whose signature
    // demonstrably verified -- that conflation is what this row removes.
    expect(badge.text).not.toContain('VERIFICATION FAILED');
  });

  // `verify_manifest` checks the outer signature (`verifier.rs:68`) strictly
  // before PoP (`:101`) and the identity-hint shape (`:113`), so each of
  // these codes is only constructible once the signature has already
  // verified. The badge must say so -- and must still be red with a muted
  // AID, because RFC-AITP-0003 §5 requires discarding a manifest that fails
  // any step.
  describe('post-signature codes — rejected, but the signature verified', () => {
    it("code:pop_failed → red, muted AID, names the signature as verified and proof-of-possession as the failure", () => {
      const verdict: Verdict = { checked: true, ok: false, code: 'pop_failed' };
      const badge = manifestVerdictBadge(verdict);
      expect(badge.color).toBe(C.red);
      expect(badge.aidColor).toBe(C.textMuted);
      expect(badge.text).toBe(
        '· REJECTED · signature verified · proof-of-possession failed (pop_failed)',
      );
      expect(badge.text).toContain('signature verified');
      expect(badge.text).toContain('proof-of-possession');
      expect(badge.text).toContain('pop_failed');
      expect(badge.text).not.toContain('SIGNATURE INVALID');
      expect(badge.text).not.toContain('VERIFICATION FAILED');
    });

    it("code:identity_hint_malformed → red, muted AID, names the signature as verified and the identity hint as the failure", () => {
      const verdict: Verdict = { checked: true, ok: false, code: 'identity_hint_malformed' };
      const badge = manifestVerdictBadge(verdict);
      expect(badge.color).toBe(C.red);
      expect(badge.aidColor).toBe(C.textMuted);
      expect(badge.text).toBe(
        '· REJECTED · signature verified · identity hint is malformed (identity_hint_malformed)',
      );
      expect(badge.text).toContain('signature verified');
      expect(badge.text).toContain('identity hint');
      expect(badge.text).toContain('identity_hint_malformed');
      expect(badge.text).not.toContain('SIGNATURE INVALID');
      expect(badge.text).not.toContain('VERIFICATION FAILED');
    });

    // The negative invariant the whole row turns on: a verified signature is
    // NOT a licence to colour the AID as a checked fact. If this ever goes
    // teal, the console is claiming provenance for an artifact RFC-AITP-0003
    // §5 requires discarding.
    it.each(['pop_failed', 'identity_hint_malformed'])(
      'code:%s never colours the AID as verified',
      (code) => {
        const badge = manifestVerdictBadge({ checked: true, ok: false, code });
        expect(badge.aidColor).not.toBe(C.tealBright);
        expect(badge.aidColor).toBe(C.textMuted);
        expect(badge.color).not.toBe(C.green);
      },
    );

    // The `Record` lookup is a typing trap: `tsconfig.json` sets `strict`
    // without `noUncheckedIndexedAccess`, so an indexed read types as
    // `string` while returning `undefined`. If the membership test is ever
    // dropped, an unknown code renders the literal "undefined" into the
    // badge instead of falling through here. `aid_mismatch` doubles as the
    // documented-but-unreachable regression (`error.rs:18` declares it,
    // `lib.rs:50` maps it, nothing in `aitp-rs` constructs it).
    it('code:aid_mismatch (documented but unreachable) falls to the generic catch-all, unchanged', () => {
      const badge = manifestVerdictBadge({ checked: true, ok: false, code: 'aid_mismatch' });
      expect(badge.text).toBe('· VERIFICATION FAILED (aid_mismatch)');
      expect(badge.color).toBe(C.red);
      expect(badge.aidColor).toBe(C.textMuted);
      expect(badge.text).not.toContain('undefined');
      expect(badge.text).not.toContain('signature verified');
    });

    it('an invented code falls to the generic catch-all, unchanged', () => {
      const badge = manifestVerdictBadge({ checked: true, ok: false, code: 'wat_is_this' });
      expect(badge.text).toBe('· VERIFICATION FAILED (wat_is_this)');
      expect(badge.color).toBe(C.red);
      expect(badge.aidColor).toBe(C.textMuted);
      expect(badge.text).not.toContain('undefined');
    });

    // `in` would walk the prototype chain and match here; `Object.hasOwn`
    // does not. Guards the lookup against an inherited member ever being
    // rendered as a failure detail.
    it.each(['toString', 'constructor', 'hasOwnProperty'])(
      'a prototype-chain member (%s) as a code still falls to the generic catch-all',
      (code) => {
        const badge = manifestVerdictBadge({ checked: true, ok: false, code });
        expect(badge.text).toBe(`· VERIFICATION FAILED (${code})`);
        expect(badge.color).toBe(C.red);
      },
    );
  });

  it('checked:false → amber, muted AID, text includes the reason', () => {
    const verdict: Verdict = { checked: false, reason: 'native addon failed to load' };
    const badge = manifestVerdictBadge(verdict);
    expect(badge.color).toBe(C.amber);
    expect(badge.aidColor).toBe(C.textMuted);
    expect(badge.text).toContain('signature not checked');
    expect(badge.text).toContain('native addon failed to load');
  });

  // The rows that existed before the `signature_invalid` / post-signature
  // split, pinned byte-exact. Splitting one red bucket into three must not
  // have moved anything else by a character.
  it.each([
    [
      { checked: true, ok: true } as Verdict,
      '· verified · signed by the key bound to this AID',
      C.green,
      C.tealBright,
    ],
    [
      { checked: true, ok: false, code: 'expired' } as Verdict,
      "· EXPIRED · signature not assessed — the CP's manifest lapsed before it could be checked",
      C.amber,
      C.textMuted,
    ],
    [
      { checked: true, ok: false, code: 'version_unknown' } as Verdict,
      '· NOT VERIFIED · signature not assessed (version_unknown)',
      C.amber,
      C.textMuted,
    ],
    [
      { checked: true, ok: false, code: 'malformed' } as Verdict,
      '· NOT VERIFIED · signature not assessed (malformed)',
      C.amber,
      C.textMuted,
    ],
    [
      { checked: false, reason: 'sdk_unavailable' } as Verdict,
      '· signature not checked (sdk_unavailable)',
      C.amber,
      C.textMuted,
    ],
  ])(
    'unchanged by the post-signature split: %j → exact pre-phase text, colour and AID colour',
    (verdict, text, color, aidColor) => {
      const badge = manifestVerdictBadge(verdict as Verdict);
      expect(badge.text).toBe(text);
      expect(badge.color).toBe(color);
      expect(badge.aidColor).toBe(aidColor);
    },
  );

  // The seven codes `verifyManifestJson` can actually produce — the reachable
  // subset of the Node binding's documented nine
  // (`bindings/aitp-node/src/lib.rs:64-67`); `aid_mismatch` and
  // `incompatible_identity_type` are unreachable and covered by the
  // catch-all cases instead. Each must land on a row that is explicitly
  // modelled, never on a row that guesses.
  it.each([
    ['expired', C.amber],
    ['version_unknown', C.amber],
    ['malformed', C.amber],
    ['unknown_field', C.amber],
    ['signature_invalid', C.red],
    ['pop_failed', C.red],
    ['identity_hint_malformed', C.red],
  ])('reachable SDK code %s renders its own modelled row (%s)', (code, color) => {
    const badge = manifestVerdictBadge({ checked: true, ok: false, code });
    expect(badge.color).toBe(color);
    expect(badge.aidColor).toBe(C.textMuted);
    expect(badge.text).toContain(code === 'expired' ? 'EXPIRED' : code);
    // None of the six may reach the generic "we don't model this" row.
    expect(badge.text).not.toContain('VERIFICATION FAILED');
  });
});

/**
 * The exported classification rule.
 *
 * The `Set`s themselves stay module-private so a caller can neither mutate
 * them nor read them for something other than the rule; the predicates are
 * the shared surface, so every caller agrees about what "the signature was
 * never assessed" means.
 */
describe('unassessed-code predicates', () => {
  it.each(['version_unknown', 'malformed', 'unknown_field'])(
    'isUnassessedManifestCode(%s) → true',
    (code) => {
      expect(isUnassessedManifestCode(code)).toBe(true);
    },
  );

  it.each([
    'expired',
    'signature_invalid',
    'pop_failed',
    'identity_hint_malformed',
    'aid_mismatch',
    'incompatible_identity_type',
    'a_code_this_console_has_never_seen',
    '',
  ])('isUnassessedManifestCode(%p) → false', (code) => {
    expect(isUnassessedManifestCode(code)).toBe(false);
  });

  it.each(['version_unknown', 'malformed', 'unknown_field'])(
    'isUnassessedRevocationCode(%s) → true',
    (code) => {
      expect(isUnassessedRevocationCode(code)).toBe(true);
    },
  );

  it.each([
    'expired',
    'issuer_mismatch',
    'signature_invalid',
    // Not a bare `malformed`: a distinct literal, and deliberately NOT
    // unassessed. `false` here means "not in the pre-signature bucket", never
    // "this was a signature failure".
    'malformed_body',
    'a_code_this_console_has_never_seen',
    '',
  ])('isUnassessedRevocationCode(%p) → false', (code) => {
    expect(isUnassessedRevocationCode(code)).toBe(false);
  });

  // Prototype-chain safety: a `Set` has no such hazard, and the predicate
  // must not acquire one if it is ever reimplemented over an object.
  it.each(['toString', 'constructor', 'hasOwnProperty', '__proto__'])(
    'neither predicate reports a prototype-chain member (%s) as unassessed',
    (code) => {
      expect(isUnassessedManifestCode(code)).toBe(false);
      expect(isUnassessedRevocationCode(code)).toBe(false);
    },
  );

  // The predicates are the same code path the badges take, not a parallel
  // copy: every code the manifest predicate calls unassessed must render the
  // amber row, and every code it doesn't must not.
  it.each([
    'version_unknown',
    'malformed',
    'unknown_field',
    'signature_invalid',
    'pop_failed',
    'identity_hint_malformed',
    'aid_mismatch',
  ])('manifestVerdictBadge agrees with isUnassessedManifestCode for %s', (code) => {
    const badge = manifestVerdictBadge({ checked: true, ok: false, code });
    expect(badge.text.includes('NOT VERIFIED · signature not assessed')).toBe(
      isUnassessedManifestCode(code),
    );
  });

  // `manifestPostSignatureDetail` is the export other surfaces (playground's
  // `manifest.verify_failed` run-timeline card) reuse instead of a second copy
  // of `MANIFEST_POST_SIGNATURE_DETAIL`'s two-entry map.
  it.each([
    ['pop_failed', 'proof-of-possession failed'],
    ['identity_hint_malformed', 'identity hint is malformed'],
  ])('manifestPostSignatureDetail(%s) → %s', (code, detail) => {
    expect(manifestPostSignatureDetail(code)).toBe(detail);
  });

  it.each([
    'version_unknown',
    'malformed',
    'unknown_field',
    'signature_invalid',
    'expired',
    'aid_mismatch',
    'a_code_this_console_has_never_seen',
    '',
  ])('manifestPostSignatureDetail(%p) → undefined', (code) => {
    expect(manifestPostSignatureDetail(code)).toBeUndefined();
  });

  // Same prototype-chain hazard `Object.hasOwn` in the predicates above
  // guards against — an inherited member must fall through to `undefined`,
  // not resolve to a function.
  it.each(['toString', 'constructor', 'hasOwnProperty', '__proto__'])(
    'manifestPostSignatureDetail(%s) does not report a prototype-chain member',
    (code) => {
      expect(manifestPostSignatureDetail(code)).toBeUndefined();
    },
  );

  // The card and the badge must never disagree about which codes are
  // post-signature: same export, same result.
  it.each(['pop_failed', 'identity_hint_malformed'])(
    'manifestVerdictBadge and manifestPostSignatureDetail agree for %s',
    (code) => {
      const badge = manifestVerdictBadge({ checked: true, ok: false, code });
      const detail = manifestPostSignatureDetail(code);
      expect(detail).toBeDefined();
      expect(badge.text).toContain(`signature verified · ${detail} (${code})`);
    },
  );
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
 * one place: the badge function's final `checked` catch-all.
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

  // An unknown member was `malformed` on 0.10.0-0.14.x and is
  // `unknown_field` from 0.15.0; a duplicate key is `malformed` either way.
  // Both are pinned end-to-end through the real addon in
  // `src/test/sdk-verification.integration.test.ts`. They must stay on the
  // amber side of this seam: a parse failure establishes nothing about
  // authenticity in either direction.
  it.each(['malformed', 'unknown_field'])(
    "manifest, code:'%s' → amber and never claims 'verified'",
    (code) => {
      const badge = manifestVerdictBadge({ checked: true, ok: false, code });
      expect(badge.color).toBe(C.amber);
      expect(badge.aidColor).toBe(C.textMuted);
      expect(badge.text).toContain('signature not assessed');
      // Case-sensitive: lowercase "verified" is the claim, "NOT VERIFIED" is
      // the honest negative. Same invariant as line 72 above.
      expect(badge.text).not.toContain('verified');
      expect(badge.text).not.toContain('VERIFICATION FAILED');
    },
  );
});
