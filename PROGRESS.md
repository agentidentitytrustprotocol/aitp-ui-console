# Progress: absorb-cp-playground-changes

Plan: `plans/absorb-cp-playground-changes.md` — the **merged** plan, and the only active one.

> Two independent sessions wrote competing plans for the same upstream drift. They were merged
> on 2026-09-23. `plans/upstream-drift-absorption.SUPERSEDED.md` is retained for reference only;
> do not implement from it. This repo map is the merged one — **one active plan's map at a time,
> never appended**, per this repo's existing convention.

## Repo map (refreshed post-implementation — Phase 7, 2026-09-23)

Phases 1–6 have landed and are committed on `feature/absorb-cp-playground-changes`
(`c67f73c`…`95ba08f`; see the Phase log below for the exact commits per phase). This section
originally described the **pre-implementation** tree, read during planning to guide the six
phases; Phase 7 rewrites it in place to describe what actually shipped, so a future reader
doesn't mistake planning-era "current behaviour" claims (e.g. "`formatOffset` treats `evt.ts` as
milliseconds since run start") for the state of `main` today. Line numbers still drift — **re-grep
before editing, never edit by line number alone.** The **Sibling-repo ground truth** subsection
below describes `aitp-control-plane`, `aitp-rs`, the spec repo, and `aitp-playground` as they
stood during planning, none of which this branch touches, so it remains valid reference for the
next person absorbing upstream drift — but it has been **condensed**, not retained as written:
per-round provenance markers (`[R2]`/`[R3]`/`[R4]`), the `aitp-verifier-py` fixture-generation
recipe, and most line-level citations describing pre-Phase-1 code that Phases 1–6 have since
rewritten were cut. Treat it as a pointer to re-verify against the sibling repos directly, not as
a forensic record of the original planning pass — that fuller record lives in this branch's own
Phase-log entries below and in the git history up to Phase 7.

### New files this branch added

From `git diff --name-status 6b0ec52..HEAD` (`6b0ec52` is the pre-branch tip):

- `src/lib/federation-errors.ts` + `federation-errors.test.ts` (Phase 5) — the handshake-outcome
  classifier and its tests.
- `src/hooks/use-run-time-base.ts` + `use-run-time-base.test.tsx` (Phase 4) — the monotonically-
  lowering run time base.
- `src/test/fixtures/minted-manifests.ts` (Phase 1) — committed Tier-2 evidence fixtures (`.ts`
  module, not raw JSON — see the Phase 1 assumption entry for why).
- `src/test/sdk-verification.integration.test.ts` (Phase 1) — ungated Tier-0 evidence; runs in CI
  (no live service needed, only the native addon).
- `src/components/federation/federation-view.test.tsx` (Phase 5) — did not exist before.
- `src/components/runs/run-summary.test.tsx`, `run-timeline.test.tsx` (Phase 4).
- `ASSUMPTIONS.md`, `PROGRESS.md` (this file) — process docs, not shipped product code.

No files were deleted. `git diff --stat 6b0ec52..HEAD` (excluding `package-lock.json`'s mechanical
diff): 36 files changed, ~6,200 insertions, ~130 deletions.

### Prerequisites and environment hazards

- **`node_modules/` is absent in a fresh checkout.** `npm ci` is a hard gate for every phase.
  `AGENTS.md`'s instruction to read `node_modules/next/dist/docs/` is only followable afterward.
  `package.json:6` requires Node `>=22.13.0`.
- **`plans/` is gitignored** (`.gitignore:15`, alongside `temp/` and `CLAUDE.md`);
  `git ls-files plans/` is empty. Two consequences:
  1. **The default `grep` here respects `.gitignore`**, so a recursive `grep -rn <pattern> .`
     silently skips `plans/`. Any acceptance criterion phrased as a repo-wide grep must **name
     its paths explicitly**. Do **not** rely on `--no-ignore` — where `grep` is ugrep 7.8.4 it
     silently matches nothing (a "returns zero hits" criterion would pass on an untouched
     checkout); where it is BSD grep it is rejected outright. The working ugrep flag is
     `--no-ignore-files`, but the portable answer is explicit paths.
  2. Plan-file edits (including Phase 7's optional one in
     `plans/playground-federation-and-run-label.md`) never appear in a commit and are **not
     recoverable from git history**. Anything that must survive belongs in `docs/`, a commit
     message, or `DECISIONS.md`.
- **Coverage ratchet `79/63/70/80`** — `jest.config.js:30-34`. `verification-display.ts` and
  `event-cards.tsx` are at or near 100% and should stay there.
- `npm run` scripts (`package.json:8-19`): `dev`, `build`, `start`, `analyze`, `typecheck`,
  `lint`, `format`, `format:check`, `test` (jest), `test:watch`,
  `test:integration` (`jest.integration.config.js`).

### Dependency surface (Phase 1) — shipped

- `package.json:24` — `"aitp": "npm:@agentidentitytrustprotocol/aitp@^0.12.0"`, raised from the
  unbounded `>=0.7.0`. `package.json:21` carries the `//aitp` sibling key documenting the floor's
  rationale (the two false-rejection fixes 0.12.0 brings a *verifier*, and why CP's own `//aitp`
  reaches the opposite conclusion about the same release).
- `package-lock.json:4221` — `node_modules/aitp` now resolves to **`0.12.0`** (was `0.10.0`).
  `0.13.0` is deliberately declined; see the `//aitp` comment and the plan's Open question 2 for
  why raising the range is a decision for a human, not an automatic lockfile refresh.
- Evidence for the floor is now checked in, not just argued: `src/test/sdk-verification.integration.test.ts`
  (ungated Tier-0, exercises the real `0.12.0` install) and `src/test/fixtures/minted-manifests.ts`
  (Tier-2, externally-minted fixtures with a provenance header, verified against both `0.10.0` and
  `0.12.0` — including a third `CONTROL` fixture that verifies on both, isolating which SDK member
  actually caused each 0.10.0 failure).
- Only two SDK symbols are imported anywhere in this repo, unchanged by this branch:
  `verifyManifestJson` (`src/lib/api/verify-manifest.ts:1`) and `verifyManifestJson`,
  `verifyRevocationList` (`src/lib/api/verify-revocation.ts:1`).

### Verification core (Phase 2) — shipped

- `src/lib/verification-display.ts` now **exports** `isUnassessedManifestCode` (`:85`) and
  `isUnassessedRevocationCode` (`:222`) as predicates over the module-private
  `MANIFEST_UNASSESSED_CODES` / `REVOCATION_UNASSESSED_CODES` sets (`:76`, `:208`) — Phase 3 reuses
  the *rule*, never a second copy of the code lists.
- `manifestVerdictBadge` no longer buckets `pop_failed` / `identity_hint_malformed` with
  `signature_invalid`: a manifest whose outer signature checked out but which then fails a later
  proof-of-possession or identity-hint check now renders as rejected *and* as having had a valid
  signature — never as a signature failure it demonstrably wasn't, and never as verified.
- `docs/FEATURES.md`'s Config → CP identity bullet already carries this distinction (added by
  Phase 2, confirmed still present — no further edit needed from Phase 7 on that bullet).
- `plans/cp-signed-artifact-verification.md`'s tracked cross-repo follow-up item was marked
  RESOLVED by Phase 2 (gitignored, so this edit is not visible in `git log`).

### Proxy layer and `client.ts` (Phase 5) — shipped

- `src/lib/api/client.ts` now exports an `ApiError` class (`:51-72`) and `MAX_ERROR_BODY_CHARS`
  (`:8`, = 500). `ApiError` carries `status`, `method`, `path`, `body` (sliced, never reworded),
  and `bodyTruncated` — additive: `.message` is preserved byte-for-byte from the pre-`ApiError`
  message, so every existing `error.message` / `String(error)` consumer is unaffected. This is the
  one repo-wide-reach change from the whole plan (see "Long-term posture" in the plan).
- `client.ts` still holds **only** the five generic verb wrappers (`getJSON`, `postJSON`,
  `putJSON`, `patchJSON`, `delJSON`) — no per-resource named helpers were added. This is exactly
  why `plans/playground-federation-and-run-label.md:26-29`'s claim ("that layer does not exist ...
  hooks call the generic wrappers directly") is still accurate as written; Phase 7 added a
  one-line note there about the new `ApiError` export, nothing more.
- `src/lib/api/proxy.ts` is unchanged by this branch — `runProxy`, `makeError`, `proxyGetVerified`,
  `proxySse`, etc. all read as they did during planning.

### Routes using the verified proxy (three, documented as three)

- `src/app/api/cp/well-known/aitp-manifest/route.ts`
- `src/app/api/cp/well-known/aitp-revocation-list/route.ts`
- `src/app/api/cp/registry/agents/[aid]/manifest/route.ts`

Each has a colocated `route.integration.test.ts`, unchanged by this branch. `docs/PROXIES.md`
previously said "the two manifest routes"; Phase 7 fixed the count to three and clarified that the
revocation route verifies in two tiers rather than via a bare `verifyManifestJson` call, and added
the missing `(verifying — see note above)` marker to the revocation-list table row.

### Federation (Phase 5) — shipped

- `src/lib/federation-errors.ts` (new) — `classifyFederationError(error): FederationErrorView |
  null`, a pure classifier over the seven documented `resolve-and-handshake` failure shapes plus
  proxy-generated 502/504, playground's `{error:{code,message}}` envelope, and a no-response case.
  Exports `FederationOutcome` (12 members), `FederationTone` (`'blocked' | 'input' | 'failed'`),
  and `parseFederationErrorBody`. Keys off an anchored `detail.startsWith(...)` prefix, never
  `.includes`, so a peer-controlled response body embedded in outcome 6's `detail` cannot spoof
  another outcome's marker text.
- `src/components/federation/federation-view.tsx` — `HandshakeErrorBanner` (new) renders
  `classifyFederationError`'s output for the resolve-and-handshake mutation only; the host, invoke,
  and stop mutations still use the older generic `ErrorBanner` (`String(error)`), which was judged
  sufficient since none of those three has more than one or two plausible failure shapes.
- The two 409 outcomes (`loopback_refused`, `origin_mismatch`) render in the `blocked` tone
  (amber) with copy stating outright that a fail-closed control fired correctly. Every 502 outcome
  explicitly disclaims a verification verdict (`FLATTENED_502` constant in `federation-errors.ts`)
  and points at the run timeline's `manifest.verify_failed` card as the place that distinction
  actually lives.
- `docs/FEATURES.md` and `docs/PROXIES.md` did not document any of this, or the four
  `hosted-agents/*` BFF routes, until Phase 7 (this phase) added a Federation section and the four
  playground-table rows.

### Run events (Phases 3 and 4) — shipped

- `src/lib/types/playground.ts` — `RunEvent` gained `cause`, `source_url`, `detail`, `reason`,
  `serves`, `fail_mode`, `delegatee_aid`, `role`, `peer_aid`, `peer_port`, `tct` (Phase 3), all
  optional.
- `src/components/runs/event-cards.tsx` — six dedicated card components handle the playground's
  trust/delegation vocabulary that used to fall through to the generic grey default row:
  `ManifestVerifyFailedCard`, `RevocationVerifyFailedCard`, `RevocationDegradedServeCard`,
  `DelegationIssuedCard`, `DelegationRedeemedCard`, `DelegationRejectedCard`. `delegation.redeeming`
  is handled inline via the existing generic `Line` component rather than a dedicated card. Each
  card renders the producer's own classified cause verbatim and routes amber/red through Phase 2's
  exported predicates rather than a second hardcoded list — except `manifest.verify_failed`'s
  playground-only `"unknown"` literal (not an SDK code), which gets one explicit amber branch since
  the exported predicate doesn't cover it.
- `src/lib/utils.ts` — `runOffsetMs(ts, baseTs)` (`:70`) replaces the old raw-division math;
  interprets `ts` as **epoch seconds** (`time.time()`, as the playground actually stamps it), not
  milliseconds since run start. `formatOffset` in `event-cards.tsx` now consumes this delta and
  renders a signed offset (a negative delta from cross-process clock skew is shown as such, not
  clamped to zero).
- `src/hooks/use-run-time-base.ts` (new) — `useRunTimeBase(events)` holds a run's time base as
  React state, monotonically lowering (`Math.min`) across both live-buffer eviction (500-event cap,
  drops from the front) and the SSE→persisted-events source swap in `run-detail.tsx`'s
  `mergeRunEvents`. `src/app/runs/[id]/page.tsx:18` now renders `<RunDetail key={runId} .../>` so a
  run-identity change forces a remount rather than letting one run's base leak into the next.
- `src/components/runs/run-summary.tsx` and `run-timeline.tsx` were updated to consume the same
  base/offset math instead of their own raw `ts / 1000`.
- **Deliberately deferred, not fixed by any phase 1–7, tracked in `ASSUMPTIONS.md`:**
  `src/components/runs/run-deliveries.tsx:119` still renders `` `+${(ts / 1000).toFixed(1)}s` `` —
  the identical unit bug in a different component/tab. And the six dedicated trust/delegation
  cards above (everything except `delegation.redeeming`, which uses the generic timestamped `Line`)
  plus the generic `run.failed` card still render **no timestamp at all** — they don't take
  `baseTs` as a prop. Both are one-prop additions and were explicitly named as Phase 7 or follow-up
  candidates when Phase 4 landed; Phase 7's actual scope (per the plan) is documentation and
  regression only, so neither was fixed here. `docs/FEATURES.md`'s Runs section now says so
  explicitly rather than implying every event has a timestamp.

### CP event feed (Phase 6) — shipped

- `src/lib/types/cp.ts` — the `CpEventType` union gained `delegation.rejected` and
  `delegation.redeemed` alongside the pre-existing `delegation.issued` / `delegation.revoked`.
  `AuditEvent.type` and `CpEvent.type` remain plain `string` passthroughs (CP's `/api/events`
  ingestion accepts arbitrary type strings), so this union still has **zero** use sites by design —
  `grep -rn "CpEventType" src/` returns exactly one hit, the definition itself. It documents the
  vocabulary; it must never be used to filter or validate.
- This remains a distinct surface from the Phase 3 run-timeline work: Phase 3 types the same two
  strings as playground `RunEvent`s and renders timeline cards; Phase 6 types them as CP audit-feed
  names. Neither implementation covers the other.

### RFC copy (Phase 6, tightened by a same-day follow-up fix) — shipped

- `src/components/config/cp-identity.tsx:128` and `src/components/trust/revocation.tsx:224` now
  read "RFC-AITP-0008 (Draft)" and "a signed empty list is a meaningful assertion" — never
  "compliant". No conformance suite exists anywhere in this repo, and the RFC's own status line is
  still Draft (all thirteen RFCs are Draft or better; none has graduated).
- Both captions are now **suppressed entirely** (not just re-worded) whenever
  `badge.entriesGreyed` is true — i.e. whenever the revocation snapshot's verification could not
  be established or failed. Before this fix, an empty list with an unverified or failed signature
  got the identical reassuring caption as a genuinely verified empty list, which is exactly the
  suppression-attack scenario RFC-AITP-0008 §1 describes the console narrating in the attacker's
  favor. This closes a real overclaim, not just a wording one — see commit `95ba08f`.

### Docs (Phase 7 — this phase)

- `docs/FEATURES.md`:
  - Top summary table gained a `Federation` row.
  - New `## Federation` section added after `## Trust` (existing order preserved: Dashboard →
    Scenarios → Runs → Monitor → Registry → Trust → Federation → Audit → Config → Cross-cutting).
    Documents hosting an agent, resolve-and-handshake, invoke, the two 409 fail-closed refusals as
    features (rendered amber, not red), and states explicitly that a 502 at the federation
    boundary cannot distinguish "peer manifest failed verification" from "peer unreachable" — that
    distinction lives on the run timeline's `manifest.verify_failed` card, not in this banner.
  - "Live timeline behaviour" (under `## Runs`) now names all seven trust/delegation event types
    with dedicated or inline handling, and states the timestamp semantic (epoch seconds, not
    ms-since-start) plus which of those seven types don't yet render a timestamp at all.
- `docs/PROXIES.md`:
  - The `proxyGetVerified` exception paragraph now says "three routes", names the two-tier
    revocation path explicitly, and no longer implies `verifyManifestJson` alone covers it.
  - The playground route table gained all four `hosted-agents/*` rows, verbs confirmed against the
    actual route files (not inferred from the path).
  - The `well-known/aitp-revocation-list` CP-table row gained the `(verifying — see note above)`
    marker its two sibling verified rows already carried.
- `plans/playground-federation-and-run-label.md:26-29` — left as accurate (the file exists and was
  not touched by the "does not exist" claim, which is about the *named-helpers layer*, not the
  file); a one-line note about the now-exported `ApiError` was appended. Gitignored — this edit
  does not appear in `git diff`/commits.
- `docs/ARCHITECTURE.md:81-82` — verified unchanged (still correctly states
  `plans/cp-signed-artifact-verification.md` is "local, not tracked in this repo," which remains
  true — `plans/` is gitignored). Not edited by Phase 7, per the plan's explicit instruction.
- `ASSUMPTIONS.md` — header verified to still name `plans/absorb-cp-playground-changes.md` as the
  single active plan, with `upstream-drift-absorption.md`/`.SUPERSEDED.md` mentioned only as
  accurate history, never as current. No edit was needed.
- `DECISIONS.md` — append-only, all entries RESOLVED. Left untouched, per the plan.

### Tests

- `src/test/` — `bff-routes.integration.test.ts` (CI-safe, mocked upstream; now covers the four
  `hosted-agents/*` routes' 2xx paths), `proxies.integration.test.ts` (live-gated),
  `cp-mutations.integration.test.ts`, `scenario-run.integration.test.ts`,
  `sdk-verification.integration.test.ts` (new, Phase 1, ungated), `integration-utils.ts`,
  `setup.ts`, `setup-integration.ts`, `test-utils.tsx` (`renderWithClient`), `lucide-stub.tsx`,
  `recharts-stub.tsx`, `polyfills.ts`, `fixtures/minted-manifests.ts` (new, Phase 1).
- `src/lib/verification-display.test.ts` — extended for Phase 2's post-signature distinction;
  at/near 100% coverage.
- `src/components/runs/event-cards.test.tsx` — extended with captured real wire frames for all
  seven trust/delegation event types (Phase 3), at 100% line/function coverage.
- `src/components/runs/run-summary.test.tsx`, `run-timeline.test.tsx` (new, Phase 4).
- `src/hooks/use-run-time-base.test.tsx` (new, Phase 4) — includes a mutation-style regression test
  for the `key={runId}` remount fix.
- `src/lib/api/client.test.ts` — extended for `ApiError` (Phase 5).
- `src/lib/federation-errors.test.ts`, `src/components/federation/federation-view.test.tsx` (new,
  Phase 5) — including an adversarial test proving a peer-controlled response body cannot spoof
  another outcome's classification.
- `src/components/config/cp-identity.test.tsx`, `src/components/trust/revocation.test.tsx` —
  extended across Phases 2 and 6 for the post-signature badge distinction and the
  `entriesGreyed`-suppressed RFC caption.
- Conventions unchanged: mock `@/lib/api/client`, never global `fetch`; one `it` per rendered
  state; assert color token **and** literal text; in `*.integration.test.ts` use `require('aitp')`
  inside the test body, never a top-level ESM import.

### Sibling-repo ground truth (verified during planning — do not re-derive)

Unchanged by this branch (these describe other repositories); retained as reference for whoever
next absorbs upstream drift.

**`aitp-control-plane`:**
- `package.json:19` — the `//aitp` documented-floor convention Phase 1 mirrors. States
  `0.5.0`/`0.6.0`/`0.7.0` as real wire floors and `0.11.0`/`0.12.0` as explicitly **not** floors
  for CP. Documents the `^`-on-`0.x` caret trap and names "the bump-aitp workflow" as CP's escape
  from it — a workflow this repo does not have, which is the honest cost of Phase 1's caret.
  `aitp` itself is pinned `^0.12.0`.
- `src/lib/identity/cp-agent.ts` — `MANIFEST_TTL_SECS = 86_400` at `:13`,
  `MANIFEST_REBUILD_MARGIN_SECS = 3_600` at `:21`, `initCpIdentity` at `:37`,
  `getCpManifestJson` at `:68` (rebuild-in-place). Fixed by `4c62641` (PR #74, 2026-08-28) and
  `c74a190` (PR #77, 2026-08-29) — pre-cutoff.
- `src/lib/revocation/producer.ts:28-33` — signs an **empty** list when its DB read fails. Known
  limitation; not actionable here; decision recorded as "do not file a cross-repo issue."
- `src/app/api/events/route.ts:75` — unverified caller-supplied `source`. Guardrail only;
  `src/components/audit/audit-table.tsx` has **zero** references to it.
- `src/lib/registry/enrollment.test.ts:26-43` — the forward-compat contract: assert
  `typeof err.code === 'string'`, never pin a value for the unknown-field class.

**`aitp-rs`** — read the tags, never `CHANGELOG.md`, for release boundaries — and check
`bindings/aitp-node/package.json` at the tag, because a tag here is not necessarily an npm release.
- `CHANGELOG.md` has **no `## [0.12.0]`, `## [0.11.0]` or `## [0.13.0]` header at all** —
  `## [Unreleased]` at `:8` runs to `## [SDK 0.4.1]` at `:645`.
- The `aitp-v0.10.0` tag is **not** the npm `0.10.0` release. At that tag
  `bindings/aitp-node/package.json` is `"0.5.0"`; `c7a7159` is the real npm-`0.10.0` tree. Tags and
  npm agree from `aitp-v0.11.0` onward.
- The two fixes `0.12.0` brings this console: `accepted_signature_algorithms` becoming a known
  `Manifest` member (absent before, so an authentic manifest carrying it threw `malformed` — a
  false amber), and `extensions` becoming `Option<ExtensionsMap>` instead of a bare map that
  silently dropped a wire-present `"extensions":{}` from the signing input (causing
  `signature_invalid` — a false red — on 0.10.0/0.11.0).
- `UnknownField` / `UNKNOWN_FIELD` does **not** reach this console: its only construction site,
  `parse_manifest_wire`, has no caller under `bindings/`. `deny_unknown_fields` on `Manifest`
  itself is an invariant across the bump, not a tightening.
- `0.12.0 → 0.13.0` changes nothing this console reaches (`aitp-tct`/`aitp-manifest` crates
  untouched by the Node binding's dependency graph); declined anyway as a deliberate, documented,
  reversible-but-not-free choice.
- `crates/aitp-manifest/src/verifier.rs` — `verify_manifest`'s actual check order: version → expiry
  → AID→key → **outer signature** → PoP → identity-hint. Its own rustdoc lists PoP before the
  signature (the RFC's nominal order); the code does the reverse. Phase 2 is built on the code's
  order, confirmed via the error-construction sites, not the rustdoc prose.
- `bindings/aitp-node/src/lib.rs` — `manifest_verification_cause`, catch-all `"malformed"`;
  documented 8-code taxonomy, only 6 reachable: `malformed`, `version_unknown`, `expired`,
  `signature_invalid`, `pop_failed`, `identity_hint_malformed`. `AidMismatch` has no construction
  site anywhere — genuinely dead code, not a gap.
- `bindings/aitp-node/src/revocation.rs` — `verification_cause`, catch-all `"malformed"`; five
  codes only, and `revocationVerdictBadge` already branches on every one.

**`agentidentitytrustprotocol` (spec repo):**
- All thirteen RFCs read `Community Standards Track (Draft)`, `Reserved`, or `Planned` — nothing
  has graduated.
- `rfcs/RFC-AITP-0008-revocation.md:110` (§1) — the empty-list MUST, verbatim: "Even when an
  issuing peer has revoked nothing, it MUST publish a signed snapshot with an empty `entries`
  array." Status line: `0.2.7-draft`.
- `rfcs/RFC-AITP-0003-manifest.md` §5 — nominally orders PoP before signature; the implementation
  deliberately inverts this (see above).

**`aitp-playground`:**
- `src/aitp_playground/runner/context.py` — `RunEvent.ts = time.time()` (epoch seconds);
  `RunContext.emit` appends with no `exclude_none`, so nulls are on the wire (cards must treat
  `null` and `undefined` identically).
- Three field-name families for the trust vocabulary, not one `cause`: `manifest.verify_failed`
  (`cause`, `source_url`), `revocation.verify_failed` (`cause`, `detail` — four real causes:
  `no_expected_issuer`, `sdk_cannot_verify`, an SDK code or `signature_invalid` fallback, and
  `malformed_body`), `revocation.degraded_serve` (`reason`, `serves`, `fail_mode`, no `cause` at
  all), `delegation.rejected` (`error` only), and `delegation.redeemed` (three emit sites, three
  different shapes — one carries only `peer_port`, and its card must not imply a TCT it never saw).
- Narration and metrics coverage is uneven: `manifest.verify_failed`, `revocation.verify_failed`,
  and `revocation.degraded_serve` have **zero** narrator or metrics coverage upstream — the
  console's dedicated cards are the *only* surface where they become observable at all.
- `src/aitp_playground/errors.py:46-52` — `PlaygroundError` → `{"error": {"code", "message"}}`, a
  third error-body shape (object) alongside FastAPI's `{detail}` (string) and this console's proxy
  `{error, target, upstream_status}` (string) — `error` collides on key but not on type across two
  of the three, so discriminate on `typeof`, never key presence.
- `src/aitp_playground/api/hosted.py:110-189` — `resolve_and_handshake`'s seven fail-closed
  outcomes, all `HTTPException(detail="<f-string>")`, no `cause` field: 404 (agent gone), 400 (not
  did:web), 502 (did:web resolution failed), 409×2 (loopback, origin mismatch), 502×2 (peer
  rejected / handshake incomplete).
- `agents/base/agent_admin.py:110-119` — where "flattens back to 502 at the federation boundary"
  actually lives, and where it says `manifest.verify_failed`'s `cause` field is the only channel
  that survives. The hard honesty constraint behind Phase 5's copy and this phase's FEATURES.md
  Federation section: a 502 must never claim a manifest verification verdict.

## Phase log

**PR strategy:** single PR covering all 7 phases. Reasoning: all seven phases serve one
objective (absorb confirmed CP/playground drift), Phase 3 has an explicit `Depends on`
edge into Phase 2's exported predicates so they're not independently meaningful to a
reviewer split apart, none is individually large enough to justify its own review cycle,
and this repo's own history bundles related fixes into one PR (e.g. #46, #48). Each phase
still lands as its own commit for phase-by-phase reviewability inside that one PR.

Branch: `feature/absorb-cp-playground-changes` (off `main`).

_(appended by `/implement` as phases land)_

| Phase | Status |
| --- | --- |
| 1 — Dependency refresh and a documented SDK floor at `^0.12.0` | DONE |
| 2 — `verification-display.ts`: post-signature gap, stale CP attribution, shared export | DONE |
| 3 — Absorb playground's trust-event vocabulary (5 typed cards) | DONE |
| 4 — Settle the run-event timestamp unit mismatch | DONE |
| 5 — Federation handshake error fidelity | DONE |
| 6 — Declarative accuracy: Draft-spec copy and the `CpEventType` catalogue | DONE |
| 7 — Documentation sweep, `PROGRESS.md` refresh, full regression | DONE |

### Phase 1 — 2026-09-23 — DONE

- **Verdict:** PASS on round 1 (no re-verify rounds needed). Verifier tier: Opus (fresh
  agent, independent). Why: this phase's whole justification rests on an empirical
  measurement claim — the right tier to check that is an independent agent that re-runs
  the measurement itself, not a lighter-weight review.
- **Rounds:** 1.
- **Files touched:** `package.json` (range `&gt;=0.7.0` → `^0.12.0` + `//aitp` rationale
  comment), `package-lock.json` (aitp 0.10.0 → 0.12.0, net dependency subtraction —
  `jose@6.2.10` removed, nothing added), `src/lib/verification-display.test.ts` (+90
  lines, additive block only), `src/test/sdk-verification.integration.test.ts` (new),
  `src/test/fixtures/minted-manifests.ts` (new, plus a post-verify doc addition for the
  0.10.0 re-measurement recipe), `.gitignore` (+`.drive.lock`, closing a real risk the
  verifier flagged — an untracked, ungitignored harness file that a future `git add -A`
  would have committed).
- **Verified, not just argued:** aitp SDK 0.10.0 really does false-reject two classes of
  authentic manifest (`accepted_signature_algorithms` → `malformed`; wire-present
  `"extensions":{}` → `signature_invalid`, i.e. a red badge on a real artifact); both pass
  clean on 0.12.0. Measured twice independently (executor, then verifier from scratch) via
  real `aitp-verifier-py`-minted fixtures against a real 0.10.0 install — not inferred from
  `.d.ts` diffing, which both prior planning rounds showed is a trap for this SDK.
- **What's next:** Phase 2 (`verification-display.ts` post-signature gap + stale CP
  attribution + shared classification export). No blockers.

### Phase 2 — 2026-09-23 — DONE

- **Verdict:** PASS on round 1. Verifier tier: Opus (fresh agent, independent, re-traced
  the SDK check order itself against `aitp-rs` source rather than trusting the plan or
  executor's retelling — this phase's whole basis is a claim about check *order*, so that
  independent re-trace is exactly what an Opus gate should spend its effort on).
- **Rounds:** 1.
- **Files touched:** `src/lib/verification-display.ts` (all 3 fixes),
  `src/lib/verification-display.test.ts` (+300 lines), `src/components/config/cp-identity.test.tsx`,
  `src/components/registry/agent-detail.test.tsx`, `src/components/trust/revocation.test.tsx`
  (pinned-literal updates), `docs/FEATURES.md` (one sentence), `plans/cp-signed-artifact-verification.md`
  (RESOLVED the tracked cross-repo follow-up, gitignored so not part of the git commit),
  plus two Phase-1-owned test/fixture files corrected for a badge-name reference Phase 2
  itself falsified (logged in `ASSUMPTIONS.md`).
- **Two logged assumptions**, both verified sound by the reviewer: `Object.hasOwn` over
  the plan's literal suggestion (closes a real prototype-pollution-shaped gap the plan's
  own edge-case guidance missed), and the two-word prose fix in Phase 1's files.
- **Carried forward to Phase 3, not fixed here (out of Phase 2's scope, both confirmed
  non-live today):** `revocationVerdictBadge`'s catch-all renders an unrecognized code as
  `SIGNATURE INVALID` rather than the manifest side's safer generic failure text; the
  `isUnassessedRevocationCode` doc names one post-signature example (`malformed_body`)
  but not the pre-signature one (`no_expected_issuer`).
- **What's next:** Phase 3 (absorb playground's trust-event vocabulary). No blockers.

### Phase 3 — 2026-09-23 — DONE

- **Verdict:** PASS on round 2 (round 1: GAPS, 5 citation typos + 1 plan-text undercount,
  all minor; round 2 confirmed 4/5 code fixes converged, caught 1 that hadn't actually
  landed + 1 adjacent inconsistency, fixed directly by the orchestrator and reconfirmed
  manually rather than spending a 3rd full agent round on an already-cross-verified
  single-line comment fix). Verifier tier: Opus, both rounds — this phase's central claim
  is an empirical one (real wire frames from running playground's code), which only an
  independent agent re-running the capture itself can actually check.
- **Rounds:** 2.
- **Files touched:** `src/lib/types/playground.ts` (RunEvent extended), `src/components/runs/event-cards.tsx`
  (6 new typed cards + 2 verdict functions + shared helpers), `src/components/runs/event-cards.test.tsx`
  (captured wire frames + exhaustiveness mirror + 79 new tests), `ASSUMPTIONS.md` (4 new entries).
- **What was independently verified, not just argued:** the round-2 verifier re-ran the
  wire-capture recipe from scratch against playground's live source and got byte-identical
  frames; separately confirmed two captured tokens carry valid Ed25519 signatures and
  correct JWK thumbprints, which rules out fabrication (a fabricated-but-plausible JSON
  frame cannot carry a real signature over its own claimed content).
- **Carried forward, tracked, not fixed here:** the `pop_failed`/`identity_hint_malformed`
  generic-red deferral (see plan Phase 3 note above); 8 other trust-adjacent event types
  (`trust.failed`, `tct.revoked`, etc.) still hit the grey default, correctly per this
  phase's explicit scope boundary.
- **What's next:** Phase 4 (run-event timestamp unit mismatch). No blockers.

### Phase 4 — 2026-09-23 — DONE

- **Verdict:** PASS on round 2 (round 1: GAPS, 6 non-blocking items — 4 closed by a
  targeted fixer pass, 2 resolved naturally at commit/tracking time). Verifier tier: Opus,
  both rounds. Round 2 mutation-tested the run-identity-keying fix directly (removed
  `key={runId}`, confirmed the test catches it; restored, confirmed green).
- **Rounds:** 2.
- **Files touched:** `src/lib/utils.ts` (new `runOffsetMs`), `src/hooks/use-run-time-base.ts`
  (new), `src/components/runs/event-cards.tsx`, `run-timeline.tsx`, `run-summary.tsx`,
  `run-detail.tsx`, `src/app/runs/[id]/page.tsx` (the `key={runId}` fix, outside the
  plan's original Files list — logged), plus new/updated tests in all of the above.
- **What was independently verified, not just argued:** the bug was reproduced against a
  real in-process playground service (actual SSE stream, actual `ts` ≈ 1.79e9); the
  regression tests were confirmed to actually fail against the old broken code (reverted
  and re-run); the ref→state pivot was confirmed forced by direct lint testing, not
  preference.
- **Deferred, tracked in `ASSUMPTIONS.md`, not fixed here:** `run-deliveries.tsx:119`
  (third instance of the same unit bug, different tab); 7 event types that render no
  timestamp at all (unaffected by this phase either way). Both flagged as Phase 7 or
  follow-up candidates.
- **What's next:** Phase 5 (federation handshake error fidelity). No blockers.

### Phase 5 — 2026-09-23 — DONE

- **Verdict:** PASS on round 2 (round 1: GAPS, 2 substantive + 5 minor; round 2 confirmed
  all 6 non-bookkeeping items closed — the 7th, updating this file and the plan's Status
  line, was explicitly deferred to phase close-out rather than the fixer). Verifier tier:
  Opus, both rounds — round 1 independently re-derived the full 7-outcome error shape
  itself by driving `aitp_playground.api.hosted.router` under a real `TestClient`, and
  round 2 re-ran the adversarial classification test and re-checked the corrected copy
  against `resolver.py`/`hosted.py` directly rather than trusting the fixer's self-report.
- **Rounds:** 2.
- **Files touched:** `src/lib/api/client.ts` (`ApiError` class, `MAX_ERROR_BODY_CHARS`),
  `src/lib/api/client.test.ts`, `src/lib/federation-errors.ts` (new — outcome classifier),
  `src/lib/federation-errors.test.ts` (new), `src/components/federation/federation-view.tsx`
  (`HandshakeErrorBanner`), `src/components/federation/federation-view.test.tsx` (new),
  `src/test/bff-routes.integration.test.ts` (non-2xx hosted-agents coverage), `ASSUMPTIONS.md`
  (5 entries after round 1's fix pass corrected/retitled one).
- **What was independently verified, not just argued:** round 1 captured all seven real
  `HTTPException` bodies (plus a 422 array-`detail` shape) by running playground's actual
  router, confirmed no `cause` field exists anywhere, and confirmed the shipped classifier
  reproduces all seven distinct outcomes from those real bodies. Round 1 also found a real,
  triggerable bug — `.includes`-based matching let a peer-controlled 502 body collide with
  a different outcome's marker, and a "peer never contacted" claim was factually false for
  three outcomes since DID resolution performs a real HTTP GET first. Round 2 proved the
  fix by running the new adversarial test directly (not reading the diff and trusting it)
  and by re-deriving the "handshake request never sent to the peer's agent endpoint" copy
  against `resolver.py`/`hosted.py`'s actual call order.
- **Fixed between rounds (fixer pass, not carried forward):** anchored-prefix (`startsWith`)
  matching replacing order-dependent `.includes`, with the loopback marker corrected to its
  true prefix; corrected "never contacted" copy for 3 outcomes; added coverage for a 5th
  body shape (`proxy.ts`'s 403 CSRF guard) and updated the ASSUMPTIONS.md entry that had
  undercounted it as a 4th; `MAX_ERROR_BODY_CHARS` referenced instead of a hardcoded "500";
  a brittle DOM-position test assertion replaced with `data-testid`; the `ApiError` type
  discriminator changed from `instanceof` to a duck-typed structural check so a module-
  duplication edge case fails safe instead of into a false claim.
- **What's next:** Phase 6 (declarative accuracy: draft-spec copy and the `CpEventType`
  catalogue). No blockers.

### Phase 6 — 2026-09-23 — DONE

- **Verdict:** PASS on round 1. Verifier tier: Opus (fresh agent, independent) — re-ran the
  literal grep from the plan itself, `git blame`'d every extra hit to confirm it predated
  this phase, traced `revocationVerdictBadge`'s full branch set in already-committed Phase 2
  code to confirm `entriesGreyed` really is true exactly when the verdict was not
  established, and hand-mutated the suppression guard to confirm the new tests would
  actually catch its removal.
- **Rounds:** 1.
- **Files touched:** `src/components/config/cp-identity.tsx` (caption text + entriesGreyed
  guard), `src/components/config/cp-identity.test.tsx`, `src/components/trust/revocation.tsx`
  (EmptyState description + entriesGreyed guard, plus `entriesGreyed: true` added to its two
  local loading/error placeholder objects), `src/components/trust/revocation.test.tsx`,
  `src/lib/types/cp.ts` (`CpEventType` +2 literals +doc comment), `ASSUMPTIONS.md`.
- **What was independently verified, not just argued:** both captions now render only when
  `!badge.entriesGreyed` — an unverified or failed-verification empty list no longer gets an
  unconditional "meaningful assertion" claim (Part A′'s actual point, the suppression-attack
  framing RFC-AITP-0008 §1 describes). `CpEventType` addition confirmed zero-behavior-change
  (`grep -rn "CpEventType" src/` still exactly one hit, the definition; `CpEvent.type` stays
  `string`).
- **Logged divergence:** acceptance criterion 1's literal "exactly two RFC-AITP hits" count
  no longer holds — four pre-existing citations from already-merged Phases 2 and 5 land in
  between; confirmed via `git blame` to genuinely predate this phase and to not assert
  compliance. See plan Phase 6 note and `ASSUMPTIONS.md`.
- **Deliberately out of scope (per plan's own Rejected list):** no `delegation` branch added
  to `src/lib/colors.ts`'s `eventColor`; `CpEventType` not wired into the audit page's
  filter (must stay free-text).
- **What's next:** Phase 7 (documentation sweep, `PROGRESS.md` refresh, full regression) and
  the finalization pass. No blockers.

### Phase 7 — 2026-09-23 — DONE (last phase)

- **Verdict:** PASS on round 1, with 2 minor gaps the orchestrator closed directly rather
  than spending a second full agent round (both mechanical: a self-description accuracy fix
  and a `prettier --write` on 9 files). Verifier tier: Opus (fresh agent, independent) — ran
  the full regression chain itself, re-derived route counts/verbs from the actual route
  files rather than trusting the doc text, diffed every claimed-untouched region against
  `95ba08f`, and used a throwaway worktree at the pre-branch tip (`6b0ec52`) to distinguish
  genuinely pre-existing `format:check` failures from ones this plan's phases introduced.
- **Rounds:** 1 (plus orchestrator-level mechanical fixes, not a second agent round).
- **Files touched:** `docs/FEATURES.md` (new Federation section, Live-timeline-behaviour
  update), `docs/PROXIES.md` (route count 2→3, two-tier revocation note, revocation-list
  marker, 4 new hosted-agents rows), `plans/playground-federation-and-run-label.md` (one
  clarifying sentence, gitignored — not in git history), `PROGRESS.md` (Repo map section
  rewritten to post-implementation state; this Phase log section append-only, untouched by
  the phase itself), `ASSUMPTIONS.md` (1 new entry, later corrected at close-out), plus a
  `prettier --write` pass (cosmetic only) on 9 files from Phases 1/4/5 that had never been
  formatted: `src/lib/federation-errors.ts`/`.test.ts`, `src/hooks/use-run-time-base.ts`/
  `.test.tsx`, `src/test/fixtures/minted-manifests.ts`,
  `src/test/sdk-verification.integration.test.ts`,
  `src/components/federation/federation-view.test.tsx`,
  `src/components/runs/run-summary.test.tsx`, `src/components/runs/run-timeline.test.tsx`.
- **What was independently verified, not just argued:** `proxyGetVerified` really is used by
  exactly 3 route files, and the revocation route genuinely does two-tier verification (not
  a bare `verifyManifestJson` call) — the doc's route-count fix is literally true of the
  code. All 4 hosted-agents route files' exported verbs read directly and matched the new
  table exactly. `federation-errors.ts`'s classifier genuinely never asserts a verification
  verdict on any 502 branch, and `event-cards.tsx`'s `manifestVerifyFailedVerdict` genuinely
  carries that distinction on the run timeline — the Federation doc section's central
  honesty claim is true of shipped code on both ends. `docs/ARCHITECTURE.md` confirmed
  byte-for-byte unchanged. Full regression chain re-run independently: typecheck/lint/build/
  test (625/625)/test:integration all green, matching the executor's numbers exactly.
- **2 gaps found and closed at close-out (mechanical, orchestrator-applied):** (1) this
  file's and `ASSUMPTIONS.md`'s own description of the Repo map condensation understated its
  size ("essentially as written" / "lightly trimmed" for a ~70% cut, 223→69 lines) — both
  corrected to name the actual figure. (2) `format:check` had drifted from `main`'s
  pre-existing 149 failing files to 158 — 9 files Phases 1/4/5 added were never run through
  `npm run format`. Fixed with `npx prettier --write` on exactly those 9 files (purely
  cosmetic; typecheck/lint/test/build/test:integration all re-confirmed green after);
  `format:check` is back to 149, matching `main`.
- **What's next:** all 7 phases DONE. Proceed to `/implement`'s finalization pass
  (whole-feature tests, cross-phase integration coverage, one final cumulative-diff Opus
  verify), then `/reconcile` (ASSUMPTIONS.md has accumulated UNCONFIRMED entries across every
  phase), then `/ship`.

### Finalization pass — 2026-09-23 — DONE

- **What it covered:** the 5 areas the finalization brief names — whole-feature test-gap
  analysis over cross-phase seams, an integration-test boundary review, a full regression from
  a clean state, a docs-staleness check against the cumulative diff, and a tracked-file
  consistency check. Full reasoning logged in `ASSUMPTIONS.md` under "Finalization pass — two
  whole-feature test gaps closed, none of them a phase regression"; a matching `## Finalization`
  note is appended to the plan file itself.
- **Already covered end-to-end, confirmed rather than assumed (no test added):** Phase 3's
  `manifest.verify_failed`/`revocation.verify_failed` cards route unassessed causes through
  Phase 2's real, unmocked `isUnassessedManifestCode`/`isUnassessedRevocationCode`
  (`event-cards.test.tsx:468-530,575-628`); Phase 6's caption suppression drives real
  `revocationVerdictBadge`/`manifestVerdictBadge` output, not a mock
  (`cp-identity.test.tsx:246-268`, `revocation.test.tsx:171-185`); Phase 1's SDK floor and
  Phase 2's display logic agree on a live SDK call, not just parallel unit tests
  (`sdk-verification.integration.test.ts:76-147`, real `verifyManifestEnvelope`/
  `verifyRevocationList` output fed through the real badge functions).
- **Two genuine gaps found and closed, additive only, no phase's shipped code touched:**
  `event-cards.test.tsx` gained a test rendering `delegation.redeeming` — the one Phase 3 card
  actually wired through `<Line ts={offset}>` — with a `baseTs`, mutation-tested against the
  production code to confirm it actually catches the offset's removal.
  `federation-view.test.tsx` gained a describe block rendering the real `HandshakeErrorBanner`
  and the real `manifest.verify_failed` `EventCard` together for the same underlying failure
  (outcome 6, `peer_rejected`), confirming the banner defers, the card supplies the verdict, and
  neither contradicts the other — the Phase 3 + Phase 5 payoff the plan's own Approach section
  names.
- **Docs:** fixed `docs/CONVENTIONS.md`'s integration-test bullet, which named only
  `bff-routes.integration.test.ts` and missed Phase 1's `sdk-verification.integration.test.ts`
  (also self-contained, also ungated). Reconsidered Phase 7's flagged `docs/ARCHITECTURE.md`
  federation gap and confirmed it's correctly left alone: the console's own topology is
  unchanged by federation, since the peer hop happens inside playground, not in this repo.
  `docs/FEATURES.md`/`docs/PROXIES.md` re-checked against the cumulative diff and found
  accurate, including the `delegation.redeeming`-is-the-only-offset-card detail Phase 7 already
  documented correctly.
- **Integration boundary review:** no new uncovered boundary found. The run-events SSE route
  shares its passthrough implementation with the already-tested CP-events route
  (`bff-routes.integration.test.ts:459-482`); Phase 5's non-2xx hosted-agents coverage and
  Phase 1's SDK integration coverage were both confirmed real and adequate, not duplicated.
- **Honestly not verifiable in this pass:** no repo-automated (non-manual, non-LLM-gated) test
  drives a live playground service into emitting one of the six new trust-event types over a
  real SSE connection. That verification happened manually during Phase 3's own review
  (independently re-run by its round-2 verifier) and would need a failure-injection harness this
  pass did not build.
- **Regression:** `typecheck`, `lint`, `format:check`, `test`, `build`, `test:integration` all
  re-run clean from this state after the additions above (see the finalization pass's own report
  for exact counts).
- **What's next:** `/reconcile` (ASSUMPTIONS.md has accumulated UNCONFIRMED entries across every
  phase plus this pass), then `/ship`.

### Reconcile — 2026-09-23 — DONE

- All 22 UNCONFIRMED entries settled in one pass by 6 parallel fresh-Opus agents (5 clustered by
  phase, 1 dedicated skeptical one-way-door scan). Verdicts: 19 CONFIRM, 2 CHANGE (applied), 1
  DEFER. Zero entries escalated to Fable or the user. Full disposition in `DECISIONS.md`'s
  "`/reconcile` of `plans/absorb-cp-playground-changes.md`" entry. Committed `7cdffcc`.
- Changes applied: exported `manifestPostSignatureDetail()` from `verification-display.ts`,
  wired into `event-cards.tsx` so `pop_failed`/`identity_hint_malformed` get proper
  post-signature wording; fixed a third instance of the Phase-4 timestamp-unit bug in
  `run-deliveries.tsx` (moved `formatOffset` to `lib/utils.ts`, threaded `baseTs`, added 10 new
  tests to a previously-untested component).
- `ASSUMPTIONS.md` now holds exactly one entry (deliberately deferred: whether seven event types
  should render a timestamp — a design decision, already documented honestly in
  `docs/FEATURES.md`, not blocking).
- Regression after reconcile: 665 tests (up from 625), coverage 84.24/75.03/76.27/85.38 (ratchet
  79/63/70/80), format:check at the pre-existing 149-file baseline, build clean, integration
  41/69 (28 gated).
- **What's next:** `/ship`.

### Ship — 2026-09-23

- Preflight: working tree clean, branch already based on current `main` (`6b0ec52`), no rebase
  needed. Full gate suite re-run clean immediately before the ship verification gate.
- Ship verification gate: **PASS** on round 1, fresh Opus, over the full cumulative diff
  `6b0ec52...7cdffcc` (9 commits, 41 files). Independently re-verified the two reconcile-pass
  changes in particular (the `manifestPostSignatureDetail` wiring and the `run-deliveries.tsx`
  fix), confirmed no doc drift, confirmed tracked-file consistency, confirmed the one remaining
  `ASSUMPTIONS.md` entry is genuinely non-blocking, and re-ran the full gate suite from scratch
  with numbers matching exactly. No gaps found; no fixes needed.
- pushed feature/absorb-cp-playground-changes 7cdffcc
- PR #50 opened: https://github.com/agentidentitytrustprotocol/aitp-ui-console/pull/50
