/**
 * Evidence for the `aitp` SDK floor (`^0.17.0`; first raised `0.10.0 ->
 * ^0.12.0`) — see `package.json`'s `//aitp` key for the full rationale.
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
 *   Tier 0 (elsewhere) — the SDK-exercising suites that sign AND verify
 *     with the same SDK: `src/app/api/cp/well-known/aitp-manifest/` and
 *     `.../cp/registry/agents/[aid]/manifest/` `route.integration.test.ts`,
 *     plus the `aitp`-signed manifest case in
 *     `bff-routes.integration.test.ts`. Signer and verifier move together
 *     there, so they prove the bump BREAKS NOTHING and cannot prove what it
 *     fixes.
 *
 *   Tier 1 (below) — how wire-parse and version failures are classified.
 *     The INVARIANT cases hold on every floor so far; the PINNED cases assert
 *     the literal 0.15.0+ codes, so a future retaxonomy fails loudly; the
 *     CUTOVER case pins the aitp/0.2 -> aitp/0.3 mixed-version window.
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

/** Mirrors `verify-manifest.ts:22-23`: the code
 *  is an opaque string, never a pinned union. */
function codeOf(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** The `.code` a call throws, or a test failure if it does not throw. */
function codeOfCall(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return codeOf(err);
  }
  throw new Error('expected the SDK to reject this input');
}

const MANIFEST_OPTS = {
  displayName: 'Pinned CP',
  handshakeEndpoint: 'https://cp.example/handshake',
  offeredCaps: [],
  ttlSecs: 3600,
};

describe('aitp SDK floor — Tier 1: wire-parse and version codes render amber', () => {
  // Since `0.15.0` both entry points run the hardened wire parser before
  // verifying (`wire::manifest` / `wire::revocation_snapshot`,
  // `bindings/aitp-node/src/lib.rs:79-95`): a member outside the schema is
  // `unknown_field`, a duplicate key is `malformed`. On `0.10.0`–`0.14.x` the
  // stray-member case was `malformed` instead (serde `deny_unknown_fields`;
  // the parser that types `UnknownField` had no caller under `bindings/`).
  // Both run before the version check, so both are pre-signature.
  //
  // The INVARIANT tests assert only "a string, landing in the amber bucket",
  // the same forward-compat discipline
  // `aitp-control-plane/src/lib/registry/enrollment.test.ts:26-43` documents
  // for this class of error. The PINNED tests assert the literal codes the
  // installed SDK emits, so the next retaxonomy fails loudly here instead of
  // silently changing a badge.

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
    // No re-signing needed: the wire parser rejects the member strictly
    // before any signature check runs.
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

  // The console verifies no revocation list itself (the CP signs none since
  // CP1.1). These revocation cases pin the SDK codes a playground agent
  // reports in `revocation_verify_failed`, which the run cards classify
  // through `isUnassessedRevocationCode`.
  it('INVARIANT: a stray member on a validly-signed revocation snapshot is rejected with a typed string code classified as unassessed', () => {
    const { AitpAgent, verifyRevocationList } = require('aitp');
    const { isUnassessedRevocationCode } = require('@/lib/verification-display');

    const cp = AitpAgent.generate();
    const envelope = JSON.parse(cp.signRevocationList([], 3600));
    envelope.revocation_list.bogus = true;

    let code: string | undefined;
    try {
      verifyRevocationList(JSON.stringify(envelope), cp.aid);
      throw new Error('expected verifyRevocationList to reject a stray member');
    } catch (err) {
      code = codeOf(err);
    }
    expect(typeof code).toBe('string');
    expect(isUnassessedRevocationCode(code!)).toBe(true);
  });

  it('PINNED: a stray member is `unknown_field` on both entry points (0.10.0-0.14.x: `malformed`)', () => {
    const {
      AitpAgent,
      verifyManifestJson,
      verifyRevocationList,
    } = require('aitp');
    const agent = AitpAgent.generate();
    const manifest = JSON.parse(agent.buildManifest(MANIFEST_OPTS));
    manifest.manifest.bogus = true;
    const snapshot = JSON.parse(agent.signRevocationList([], 3600));
    snapshot.revocation_list.bogus = true;

    expect(codeOfCall(() => verifyManifestJson(JSON.stringify(manifest)))).toBe(
      'unknown_field',
    );
    expect(
      codeOfCall(() =>
        verifyRevocationList(JSON.stringify(snapshot), agent.aid),
      ),
    ).toBe('unknown_field');
  });

  it('PINNED: a duplicate key is `malformed` on both entry points, and renders amber', () => {
    const {
      AitpAgent,
      verifyManifestJson,
      verifyRevocationList,
    } = require('aitp');
    const {
      isUnassessedRevocationCode,
      manifestVerdictBadge,
    } = require('@/lib/verification-display');
    const { C } = require('@/lib/colors');
    const agent = AitpAgent.generate();
    const manifest = agent
      .buildManifest(MANIFEST_OPTS)
      .replace('{"manifest":{', '{"manifest":{"aid":"dup",');
    const snapshot = agent
      .signRevocationList([], 3600)
      .replace('{"revocation_list":{', '{"revocation_list":{"issuer":"dup",');

    const manifestCode = codeOfCall(() => verifyManifestJson(manifest));
    const revocationCode = codeOfCall(() =>
      verifyRevocationList(snapshot, agent.aid),
    );
    expect(manifestCode).toBe('malformed');
    expect(revocationCode).toBe('malformed');
    expect(
      manifestVerdictBadge({ checked: true, ok: false, code: manifestCode! })
        .color,
    ).toBe(C.amber);
    expect(isUnassessedRevocationCode(revocationCode!)).toBe(true);
  });

  it('CUTOVER: an `aitp/0.2` manifest or snapshot is `version_unknown` and renders amber, never red', () => {
    // Pins the mixed-version window of the aitp/0.3 cutover: a console on
    // 0.17 reading a CP still on aitp/0.2. The signature is irrelevant
    // (version is checked before expiry and signature), so restamping a
    // 0.3 artifact is a faithful stand-in for a real 0.2 one.
    const { AitpAgent, verifyRevocationList } = require('aitp');
    const { verifyManifestEnvelope } = require('@/lib/api/verify-manifest');
    const {
      isUnassessedRevocationCode,
      manifestVerdictBadge,
    } = require('@/lib/verification-display');
    const { C } = require('@/lib/colors');
    const agent = AitpAgent.generate();
    const manifest = JSON.parse(agent.buildManifest(MANIFEST_OPTS));
    manifest.manifest.version = 'aitp/0.2';
    const snapshot = JSON.parse(agent.signRevocationList([], 3600));
    snapshot.revocation_list.version = 'aitp/0.2';

    const verdict = verifyManifestEnvelope(JSON.stringify(manifest));
    expect(verdict).toEqual({
      checked: true,
      ok: false,
      code: 'version_unknown',
    });
    const badge = manifestVerdictBadge(verdict);
    expect(badge.color).toBe(C.amber);
    expect(badge.text).toContain('signature not assessed (version_unknown)');

    const revocationCode = codeOfCall(() =>
      verifyRevocationList(JSON.stringify(snapshot), agent.aid),
    );
    expect(revocationCode).toBe('version_unknown');
    expect(isUnassessedRevocationCode(revocationCode!)).toBe(true);
  });

  it('PINNED: PoP is checked before the outer signature (0.12.0-0.23.x: the reverse), so a manifest failing both is `pop_failed` and the badge claims nothing about the signature', () => {
    const { AitpAgent } = require('aitp');
    const { verifyManifestEnvelope } = require('@/lib/api/verify-manifest');
    const { manifestVerdictBadge } = require('@/lib/verification-display');
    const { C } = require('@/lib/colors');
    const agent = AitpAgent.generate();
    const tamper = (sig: string) => `${sig.slice(0, -4)}AAAA`;

    const both = JSON.parse(agent.buildManifest(MANIFEST_OPTS));
    both.manifest.signature = tamper(both.manifest.signature);
    both.manifest.proof_of_possession.signature = tamper(
      both.manifest.proof_of_possession.signature,
    );
    const verdict = verifyManifestEnvelope(JSON.stringify(both));
    expect(verdict).toEqual({ checked: true, ok: false, code: 'pop_failed' });
    const badge = manifestVerdictBadge(verdict);
    expect(badge.color).toBe(C.red);
    expect(badge.text).not.toContain('signature verified');

    // A signature-only tamper still reaches the signature check.
    const sigOnly = JSON.parse(agent.buildManifest(MANIFEST_OPTS));
    sigOnly.manifest.signature = tamper(sigOnly.manifest.signature);
    expect(verifyManifestEnvelope(JSON.stringify(sigOnly))).toEqual({
      checked: true,
      ok: false,
      code: 'signature_invalid',
    });
  });

  it('INVARIANT: the imported symbol is callable, so the native addon actually loaded', () => {
    // The napi-rs v3 loader regeneration that rides along with this bump
    // resolves the addon by try/catch rather than `existsSync`. A resolution
    // regression would NOT fail the build; it surfaces at runtime as a
    // code-less throw, which `verify-manifest.ts:24-29` correctly classifies
    // as `{checked: false, reason: 'sdk_unavailable'}` — the console degrades
    // honestly, but every badge silently turns amber. This asserts the
    // healthy state directly.
    const sdk = require('aitp');
    expect(typeof sdk.verifyManifestJson).toBe('function');

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

describe('aitp SDK floor — Tier 2: externally-minted aitp/0.3 manifests (the two false rejections 0.12.0 fixed)', () => {
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
