/**
 * Externally-minted manifest envelopes — Tier-2 evidence for the `aitp`
 * `0.10.0 → 0.12.0` floor bump (`package.json`'s `//aitp`).
 *
 * WHY THESE ARE NOT BUILT IN THIS REPO. The `aitp` Node SDK cannot emit
 * either of the two shapes below. `bindings/aitp-node/src/agent.rs`'s
 * `ManifestOpts` (`:36-57`) exposes neither `accepted_signature_algorithms`
 * nor `extensions`, and its builder hard-codes `extensions: None` at `:414`.
 * Nor can the Rust builder: `.extension(k, v)`
 * (`crates/aitp-manifest/src/builder.rs:168`) only ever yields a *non-empty*
 * map, and `builder.rs:223-231` says outright that a literal
 * `"extensions":{}` "is only reachable by constructing a `Manifest`
 * directly." Injecting either member into a builder-signed envelope after
 * the fact does NOT produce an authentic manifest — it produces one whose
 * signature genuinely does not match, which is exactly what the 0.10.0 defect
 * *looks* like, so such a fixture would pass for the wrong reason and prove
 * nothing.
 *
 * And they are NOT hand-rolled here. `src/lib/api/verify-manifest.ts:4-16`
 * forbids canonicalizing or signing by hand as a matter of module discipline.
 * Using another implementation's minter *outside* this repo and committing
 * its output does not violate that rule; adding a signer to this repo would.
 *
 * PROVENANCE — generated once by `aitp-verifier-py`, the independent
 * conformant Python implementation of the AITP verification core (a sibling
 * repo). Its minter signs whatever body it is handed:
 * `aitp_verifier/minter.py:356` `mint_input` → `_sign_manifest` (`:137-153`),
 * which computes `body = {k: v for k, v in man.items() if k != "signature"}`
 * then `sig = b64url(key.sign_digest(sha256(canonicalize(body))))` — the same
 * JCS-over-body-minus-signature input as `aitp-rs`'s `ManifestSigningView`.
 * So these are authentically signed, not injected. Signing keys are the spec
 * repo's pinned known-answer keypairs
 * (`agentidentitytrustprotocol/schemas/conformance/known-answer/keypairs.json`
 * via `aitp_verifier/keys.py`'s `load_kat_keys`), so no new key material
 * enters this repo. The body is `tests/test_unknown_fields.py:363-380`'s
 * `_manifest_input`, verbatim; each fixture differs from CONTROL by exactly
 * one optional member.
 *
 * EXACT GENERATING SNIPPET (run from `aitp-verifier-py/`, with the spec repo
 * as a sibling; `python3.13 -` and paste, or save as a file):
 *
 *     import json
 *     from pathlib import Path
 *     from aitp_verifier.b64 import b64url_encode
 *     from aitp_verifier.keys import load_kat_keys
 *     from aitp_verifier.manifest import verify_manifest
 *     from aitp_verifier.minter import mint_input
 *     from aitp_verifier.timeutil import REFERENCE_CLOCK
 *
 *     SPEC = Path("../agentidentitytrustprotocol")
 *     SUBJECT = "aid:pubkey:A6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg"
 *     NOW = REFERENCE_CLOCK  # 1711900000
 *
 *     def manifest_input(**body_extra):
 *         man = {
 *             "version": "aitp/0.2",
 *             "aid": SUBJECT,
 *             "handshake_endpoint": "https://b.agents.example.com/aitp/handshake",
 *             "accepted_trust_anchors": [],
 *             "offered_capabilities": ["macp.mode.task.v1"],
 *             "required_peer_capabilities": [],
 *             "proof_of_possession": {
 *                 "challenge": b64url_encode(b"\x11" * 16),
 *                 "signature": "__VALID_POP_SIG__",
 *             },
 *             "published_at": NOW,
 *             "expires_at": NOW + 86400,
 *             "identity_hint": {"type": "oidc", "issuer": "https://auth.example",
 *                               "subject": "agent"},
 *             "signature": "__VALID_MANIFEST_SIG__",
 *         }
 *         man.update(body_extra)
 *         return {"manifest": man, "now": NOW}
 *
 *     keys = load_kat_keys(SPEC)
 *     for name, extra in (
 *         ("control", {}),
 *         ("accepted_signature_algorithms",
 *          {"accepted_signature_algorithms": ["EdDSA", "ES256"]}),
 *         ("extensions_empty", {"extensions": {}}),
 *     ):
 *         minted = mint_input(manifest_input(**extra), REFERENCE_CLOCK, keys)
 *         assert verify_manifest(minted) == {"aid": SUBJECT}, name   # self-check
 *         print(name, json.dumps({"manifest": minted["manifest"]}, indent=2,
 *                                sort_keys=True))
 *
 * CLOCK. `published_at` is `REFERENCE_CLOCK` = 1711900000 and `expires_at` is
 * `+86400`, both long past. Every consumer MUST pass
 * `PINNED_NOW_UNIX_SECS` as `verifyManifestJson`'s `nowUnixSecs`, which the
 * binding's own doc comment invites ("pass a pinned value in tests",
 * `bindings/aitp-node/src/lib.rs:68-70`). Without it these expire.
 *
 * OBJECT LITERALS, NOT WIRE BYTES. These are stored parsed and re-serialized
 * at the call site. That is safe and deliberate: the signature covers the JCS
 * canonicalization of the body minus `signature`, never the transmitted
 * bytes, so key order and whitespace are not signed. Verified empirically —
 * every fixture here was minted, re-parsed, `JSON.stringify`d and accepted by
 * `verifyManifestJson` on 0.12.0.
 *
 * MEASURED BEHAVIOUR (this is the whole point of the phase; see
 * `sdk-verification.integration.test.ts` for the executable form):
 *
 *   fixture                        aitp 0.10.0                 aitp 0.12.0
 *   -----------------------------  --------------------------  -----------
 *   CONTROL                        ok                          ok
 *   ACCEPTED_SIGNATURE_ALGORITHMS  throws code 'malformed'     ok
 *   EXTENSIONS_PRESENT_BUT_EMPTY   throws 'signature_invalid'  ok
 *
 * CONTROL is the scientific control and is why the other two rows are
 * attributable to the member rather than to the minter: it proves an
 * `aitp-verifier-py`-minted envelope is accepted by `aitp-rs` on BOTH
 * versions, so the two failures on 0.10.0 isolate to the one member that
 * differs. Upstream's own end-to-end regression tests for the same two
 * deltas are `aitp-rs/crates/aitp-manifest/tests/round_trip.rs:254`
 * (`extensions_present_but_empty_now_verifies_end_to_end`) and `:378`
 * (`parse_manifest_wire_accepts_accepted_signature_algorithms`).
 *
 * RE-MEASURING THE 0.10.0 COLUMN. This repo installs exactly one `aitp`
 * version at a time, so the 0.10.0 column above cannot be asserted from a
 * test in this repo once the floor moves to `^0.12.0` (see
 * `sdk-verification.integration.test.ts`'s own note on this). To reproduce
 * it directly: in a scratch directory, `npm i
 * @agentidentitytrustprotocol/aitp@0.10.0`, then for each fixture below call
 * `require('aitp').verifyManifestJson(JSON.stringify(fixture),
 * PINNED_NOW_UNIX_SECS)` and observe which throw.
 */

/** The `nowUnixSecs` every consumer of these fixtures must pin. */
export const PINNED_NOW_UNIX_SECS = 1_711_900_000;

/** The AID all three fixtures are issued for (a spec KAT keypair). */
export const FIXTURE_AID = 'aid:pubkey:A6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg';

/**
 * Carries neither disputed member. Verifies on 0.10.0 AND 0.12.0 — the
 * control that makes the other two fixtures interpretable.
 */
export const CONTROL = {
  manifest: {
    accepted_trust_anchors: [],
    aid: FIXTURE_AID,
    expires_at: 1711986400,
    handshake_endpoint: 'https://b.agents.example.com/aitp/handshake',
    identity_hint: {
      issuer: 'https://auth.example',
      subject: 'agent',
      type: 'oidc',
    },
    offered_capabilities: ['macp.mode.task.v1'],
    proof_of_possession: {
      challenge: 'EREREREREREREREREREREQ',
      signature:
        'GqF-hMlil9NOtjtU6eRRkE0eUVQCUiCpG-pq4c_NBbMMOlZx2y5rEAV9KNAaKcz1vhhvkccMCrW2lZ0XAK42Aw',
    },
    published_at: 1711900000,
    required_peer_capabilities: [],
    signature:
      '-ohFfy0L024bFVsOTq--J1-HpV3uq6HV1FkHPct5kYM_AjtnHMGna3gHCaP-eHjgz-QMcIp2b2R6WqVwT4moAg',
    version: 'aitp/0.2',
  },
} as const;

/**
 * Authentic, carrying the spec-legal optional member
 * `accepted_signature_algorithms`. `Manifest` is `#[serde(deny_unknown_fields)]`
 * (`crates/aitp-manifest/src/types.rs:11`, at every version) and this member
 * was not declared until `types.rs:57` in 0.12.0 — so on 0.10.0 it is
 * rejected at `serde_json::from_str`, before any signature check, as
 * `malformed`. This console renders `malformed` amber
 * ("NOT VERIFIED · signature not assessed"), so the 0.10.0 defect is a false
 * amber on an authentic manifest.
 */
export const ACCEPTED_SIGNATURE_ALGORITHMS = {
  manifest: {
    accepted_signature_algorithms: ['EdDSA', 'ES256'],
    accepted_trust_anchors: [],
    aid: FIXTURE_AID,
    expires_at: 1711986400,
    handshake_endpoint: 'https://b.agents.example.com/aitp/handshake',
    identity_hint: {
      issuer: 'https://auth.example',
      subject: 'agent',
      type: 'oidc',
    },
    offered_capabilities: ['macp.mode.task.v1'],
    proof_of_possession: {
      challenge: 'EREREREREREREREREREREQ',
      signature:
        'GqF-hMlil9NOtjtU6eRRkE0eUVQCUiCpG-pq4c_NBbMMOlZx2y5rEAV9KNAaKcz1vhhvkccMCrW2lZ0XAK42Aw',
    },
    published_at: 1711900000,
    required_peer_capabilities: [],
    signature:
      'NB90gosajp5ViEtnh6hSwWMj0CCNYpLZ3MPVCT5BAQf7J0pEenZvhru_BSJ76BEzmWaXjEHbELyxhWC-lqHzBw',
    version: 'aitp/0.2',
  },
} as const;

/**
 * Authentic, signed WITH a literal wire-present `"extensions":{}`. Until
 * 0.12.0, `Manifest::extensions` was a bare `ExtensionsMap` skipped via
 * `skip_serializing_if = "ExtensionsMap::is_empty"`
 * (`crates/aitp-manifest/src/types.rs:62` at `c7a7159`, the real npm-0.10.0
 * tree), so the verifier silently dropped that member from its reconstructed
 * signing input and computed a different digest than the issuer did.
 * `builder.rs:332-334` records it verbatim: the old shape "silently dropped a
 * wire-present `"extensions":{}` from the signing input — a manifest signed
 * with that literal shape failed verification." The fix (`b78e608`) made it
 * `Option<ExtensionsMap>` at `types.rs:93`. On 0.10.0 this authentic manifest
 * throws `signature_invalid`, which this console renders as a RED
 * "VERIFICATION FAILED" badge.
 */
export const EXTENSIONS_PRESENT_BUT_EMPTY = {
  manifest: {
    accepted_trust_anchors: [],
    aid: FIXTURE_AID,
    expires_at: 1711986400,
    extensions: {},
    handshake_endpoint: 'https://b.agents.example.com/aitp/handshake',
    identity_hint: {
      issuer: 'https://auth.example',
      subject: 'agent',
      type: 'oidc',
    },
    offered_capabilities: ['macp.mode.task.v1'],
    proof_of_possession: {
      challenge: 'EREREREREREREREREREREQ',
      signature:
        'GqF-hMlil9NOtjtU6eRRkE0eUVQCUiCpG-pq4c_NBbMMOlZx2y5rEAV9KNAaKcz1vhhvkccMCrW2lZ0XAK42Aw',
    },
    published_at: 1711900000,
    required_peer_capabilities: [],
    signature:
      'IxLGPGVmS-kaxbvJ4g4n9ECdl4Aps1aV5HqXKSxbXJtsgVfztsm4QUZBwOCUuO_8DAzsRRw6aOGntVRQFXiBBg',
    version: 'aitp/0.2',
  },
} as const;
