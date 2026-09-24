/**
 * Evidence for the `aitp` SDK floor bump `0.10.0 -> ^0.12.0`
 * (see `package.json`'s `//aitp` key for the full rationale).
 *
 * This lives in the *integration* suite, not the unit suite, for one
 * non-negotiable reason: the `aitp` SDK is a native NAPI addon and only
 * loads under `testEnvironment: 'node'`. A jsdom unit test cannot exercise
 * it at all. It is deliberately NOT gated on `RUN_INTEGRATION=1` — it needs
 * no running service, only the addon — so it is real coverage in CI rather
 * than a suite that silently skips.
 *
 * The evidence is tiered, and each tier claims exactly what it proves and no
 * more. Overclaiming about verification is the defect class this whole plan
 * exists to remove; a test that overclaims about verification evidence is the
 * same defect one level up.
 *
 *   Tier 0 (elsewhere) — the four SDK-exercising suites that sign AND verify
 *     with the same SDK: `src/app/api/cp/well-known/aitp-manifest/`,
 *     `.../aitp-revocation-list/`, `.../cp/registry/agents/[aid]/manifest/`
 *     `route.integration.test.ts`, plus the two `aitp`-signed cases in
 *     `bff-routes.integration.test.ts`. Signer and verifier move together
 *     there, so they prove the bump BREAKS NOTHING and cannot prove what it
 *     fixes.
 *
 *   Tier 1 (below) — invariants. Pinned so a future bump that *does* change
 *     them fails loudly. These behave identically on 0.10.0 and 0.12.0
 *     (measured, both versions); they are NOT evidence of the bump.
 *
 *   Tier 1a (upstream) — `aitp-rs` ships named end-to-end regression tests
 *     for both deltas: `crates/aitp-manifest/tests/round_trip.rs:254`
 *     `extensions_present_but_empty_now_verifies_end_to_end` and `:378`
 *     `parse_manifest_wire_accepts_accepted_signature_algorithms`.
 *
 *   Tier 2 (below) — the deltas themselves, measured through the very Node
 *     addon this console loads, using envelopes minted by an independent
 *     implementation. See `fixtures/minted-manifests.ts` for provenance and
 *     for why this repo cannot mint them itself.
 */

import {
  ACCEPTED_SIGNATURE_ALGORITHMS,
  CONTROL,
  EXTENSIONS_PRESENT_BUT_EMPTY,
  FIXTURE_AID,
  PINNED_NOW_UNIX_SECS,
} from './fixtures/minted-manifests';

/** Mirrors `verify-manifest.ts:22-23` / `verify-revocation.ts:6-9`: the code
 *  is an opaque string, never a pinned union. */
function codeOf(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

describe('aitp SDK floor — Tier 1: invariants across the 0.10.0 -> 0.12.0 bump', () => {
  // These are pins, not deltas. Round 2 of this plan's review claimed
  // 0.12.0's `UnknownField` / `UNKNOWN_FIELD` work tightened unknown-member
  // handling for this console; round 3 retracted it and round 4 confirmed the
  // retraction. `UnknownField`'s only construction site is
  // `parse_manifest_wire` (`crates/aitp-manifest/src/verifier.rs:174,181,185`),
  // which has no caller anywhere under `bindings/` —
  // `verify_manifest_json` (`bindings/aitp-node/src/lib.rs:71-88`) goes
  // straight through `serde_json::from_str` — and
  // `#[serde(deny_unknown_fields)]` sits on `Manifest` at `types.rs:11` at
  // every tag checked while implementing this phase (`aitp-v0.7.0` through
  // `aitp-v0.13.0`, plus `c7a7159`, the real npm-0.10.0 tree; `git log -S`
  // dates it to `v0.1.0-alpha.4`). So a stray top-level member is rejected
  // identically before and after. Measured on both SDK versions while
  // implementing this phase: `malformed` either way.
  //
  // Deliberately asserted as "a string, landing in the amber bucket", never
  // as the literal `'malformed'` — the same forward-compat discipline
  // `aitp-control-plane/src/lib/registry/enrollment.test.ts:26-43` documents
  // for exactly this class of error.

  it('INVARIANT: a stray top-level member on a validly-signed manifest is rejected with a typed string code that renders amber, not red', () => {
    const { AitpAgent } = require('aitp');
    const { verifyManifestEnvelope } = require('@/lib/api/verify-manifest');
    const { manifestVerdictBadge } = require('@/lib/verification-display');
    const { C } = require('@/lib/colors');

    const agent = AitpAgent.generate();
    const envelope = JSON.parse(
      agent.buildManifest({
        displayName: 'Invariant CP',
        handshakeEndpoint: 'https://cp.example/handshake',
        offeredCaps: [],
        ttlSecs: 3600,
      }),
    );
    // No re-signing needed: `deny_unknown_fields` fails during
    // deserialization, strictly before any signature check runs.
    envelope.manifest.bogus = true;

    const verdict = verifyManifestEnvelope(JSON.stringify(envelope));

    // `checked: true` — the SDK ran and returned a verdict. A `checked:
    // false` here would mean the native addon failed to load, which is the
    // silent-degradation mode the floor bump's build step guards against.
    expect(verdict.checked).toBe(true);
    expect(verdict.ok).toBe(false);
    expect(typeof verdict.code).toBe('string');

    const badge = manifestVerdictBadge(verdict);
    expect(badge.color).toBe(C.amber);
    expect(badge.aidColor).toBe(C.textMuted);
    expect(badge.text).toContain('signature not assessed');
    // Case-sensitive on purpose, per this repo's convention
    // (`verification-display.test.ts:72`): lowercase "verified" is the CLAIM;
    // the uppercase "NOT VERIFIED" headline is the honest negative.
    expect(badge.text).not.toContain('verified');
    expect(badge.text).not.toContain('VERIFICATION FAILED');
  });

  it('INVARIANT: a stray member on a validly-signed revocation snapshot is rejected with a typed string code that renders amber, not SIGNATURE INVALID', () => {
    const { AitpAgent, verifyRevocationList } = require('aitp');
    const { revocationVerdictBadge } = require('@/lib/verification-display');
    const { C } = require('@/lib/colors');

    const cp = AitpAgent.generate();
    const envelope = JSON.parse(cp.signRevocationList([], 3600));
    envelope.revocation_list.bogus = true;

    // Mirrors `verify-revocation.ts`'s `verifyAgainst` (`:11-22`) rather than
    // calling `verifyRevocationEnvelope`, which would drag in `serverConfig`
    // and an upstream fetch this pin has no use for.
    let code: string | undefined;
    try {
      verifyRevocationList(JSON.stringify(envelope), cp.aid);
      throw new Error('expected verifyRevocationList to reject a stray member');
    } catch (err) {
      code = codeOf(err);
    }
    expect(typeof code).toBe('string');

    const badge = revocationVerdictBadge({
      checked: true,
      ok: false,
      code: code!,
      tier: 'pinned',
    });
    expect(badge.color).toBe(C.amber);
    expect(badge.entriesGreyed).toBe(true);
    expect(badge.text).toContain('signature not assessed');
    expect(badge.text).not.toContain('verified');
    expect(badge.text).not.toContain('SIGNATURE INVALID');
  });

  it('INVARIANT: the two imported symbols are callable, so the native addon actually loaded', () => {
    // The napi-rs v3 loader regeneration that rides along with this bump
    // resolves the addon by try/catch rather than `existsSync`. A resolution
    // regression would NOT fail the build; it surfaces at runtime as a
    // code-less throw, which `verify-manifest.ts:24-29` correctly classifies
    // as `{checked: false, reason: 'sdk_unavailable'}` — the console degrades
    // honestly, but every badge silently turns amber. This asserts the
    // healthy state directly.
    const sdk = require('aitp');
    expect(typeof sdk.verifyManifestJson).toBe('function');
    expect(typeof sdk.verifyRevocationList).toBe('function');

    const { verifyManifestEnvelope } = require('@/lib/api/verify-manifest');
    const { AitpAgent } = require('aitp');
    const agent = AitpAgent.generate();
    const verdict = verifyManifestEnvelope(
      agent.buildManifest({
        displayName: 'Loader check',
        handshakeEndpoint: 'https://cp.example/handshake',
        offeredCaps: [],
        ttlSecs: 3600,
      }),
    );
    expect(verdict).toEqual({ checked: true, ok: true });
  });
});

describe('aitp SDK floor — Tier 2: the two false rejections 0.12.0 fixes', () => {
  // Every case here calls `verifyManifestJson` DIRECTLY with a pinned
  // `nowUnixSecs`, not through `verifyManifestEnvelope`, which takes no clock
  // and would report these long-past fixtures as `expired` before reaching
  // the behaviour under test. The binding's own doc comment invites the pin:
  // "pass a pinned value in tests" (`bindings/aitp-node/src/lib.rs:68-70`).
  //
  // What each case proves, stated precisely: on the installed SDK these
  // authentic manifests verify. What it does NOT prove on its own: that they
  // failed before. That half was measured out-of-band against a scratch
  // install of 0.10.0 and is recorded in `fixtures/minted-manifests.ts` and
  // in this phase's commit message; it cannot be asserted from inside a repo
  // that installs exactly one version of the SDK.

  it('CONTROL: an externally-minted envelope carrying neither disputed member verifies (this is what makes the next two attributable to the member, not the minter)', () => {
    const { verifyManifestJson } = require('aitp');
    expect(() =>
      verifyManifestJson(JSON.stringify(CONTROL), PINNED_NOW_UNIX_SECS),
    ).not.toThrow();
  });

  it('DELTA: an authentic manifest carrying `accepted_signature_algorithms` verifies (0.10.0 threw `malformed` — a false amber on a spec-legal member)', () => {
    const { verifyManifestJson } = require('aitp');
    expect(() =>
      verifyManifestJson(
        JSON.stringify(ACCEPTED_SIGNATURE_ALGORITHMS),
        PINNED_NOW_UNIX_SECS,
      ),
    ).not.toThrow();
  });

  it('DELTA: an authentic manifest signed WITH a wire-present `"extensions":{}` verifies (0.10.0 threw `signature_invalid` — a RED "SIGNATURE INVALID" badge on an authentic artifact)', () => {
    const { verifyManifestJson } = require('aitp');
    expect(() =>
      verifyManifestJson(
        JSON.stringify(EXTENSIONS_PRESENT_BUT_EMPTY),
        PINNED_NOW_UNIX_SECS,
      ),
    ).not.toThrow();
  });

  it('the fixtures are genuinely signed for their own AID, so a tampered signature still fails (they are not passing because verification is somehow disabled)', () => {
    const { verifyManifestJson } = require('aitp');
    const tampered = JSON.parse(JSON.stringify(EXTENSIONS_PRESENT_BUT_EMPTY));
    tampered.manifest.signature = `${tampered.manifest.signature.slice(0, -4)}AAAA`;

    let code: string | undefined;
    try {
      verifyManifestJson(JSON.stringify(tampered), PINNED_NOW_UNIX_SECS);
      throw new Error('expected a tampered signature to be rejected');
    } catch (err) {
      code = codeOf(err);
    }
    expect(code).toBe('signature_invalid');
    expect(CONTROL.manifest.aid).toBe(FIXTURE_AID);
  });

  it('the pinned clock is load-bearing: without it the fixtures read as expired, not as verified', () => {
    // Guards the fixtures against a future edit that drops `nowUnixSecs` and
    // leaves the tests "passing" for the wrong reason.
    const { verifyManifestJson } = require('aitp');
    let code: string | undefined;
    try {
      verifyManifestJson(JSON.stringify(CONTROL));
      throw new Error(
        'expected a long-expired fixture to be rejected without a pinned clock',
      );
    } catch (err) {
      code = codeOf(err);
    }
    expect(code).toBe('expired');
  });
});
