# Decisions

## 2026-08-29 — AgentDetail provenance-line test coverage

- **Original assumption:** the acceptance criterion "a visible provenance line renders"
  was satisfied by the JSX rendering `badge.text`, even without a dedicated test
  asserting the text content — only `color`/`aidColor` were asserted in
  `agent-detail.test.tsx`, on the reasoning that `verification-display.test.ts` (Phase 2)
  already covers the badge-producing functions' text output.
- **Recommendation (Sonnet, low blast radius):** CHANGE. Confirmed the reasoning was
  only half right: `verification-display.test.ts` fully covers `manifestVerdictBadge`'s
  output, but two of `AgentDetail`'s five badge states (`'· checking manifest…'`,
  `'· manifest unavailable'`) are hand-written fallback strings local to
  `agent-detail.tsx`, not produced by that module, so they weren't covered anywhere.
  The fix was a trivial ~5-minute addition of `getByText`/`getAllByText` assertions.
- **My call:** Change now.
- **Status:** RESOLVED — fixed in PR #47 (`ffad029`), merged to `main`
  (`8962b3a`), CI green, production deploy verified.

## 2026-08-29 — AgentDetail aid-prop vs agent.aid coupling

- **Original assumption:** the `aid` prop passed into `AgentDetail` (used for
  `useAgentManifest(aid)`) is always identical to `agent.aid` (the value
  `ManifestViewer` is keyed on), so the two components' queries share one cache entry
  and no duplicate fetch occurs. Left `AgentDetail` using the raw prop directly.
- **Recommendation (Sonnet, low blast radius):** CHANGE. The equality holds today only
  because of upstream backend behavior this repo can't inspect or control — asserting
  it as a guarantee (CONFIRM) would be weak, but the fix is a safe one-line change
  (`useAgentManifest(agent?.aid ?? aid)`, matching `ManifestViewer`'s existing
  `aid={agent.aid}` pattern) that removes the assumption entirely rather than relying
  on it holding, so DEFER wasn't warranted either.
- **My call:** Change now.
- **Status:** RESOLVED — fixed in PR #47 (`ffad029`), merged to `main`
  (`8962b3a`), CI green, production deploy verified.

## 2026-09-23 — `/reconcile` of `plans/absorb-cp-playground-changes.md` (all 7 phases + finalization)

All 22 `UNCONFIRMED` entries this plan logged to `ASSUMPTIONS.md` were reconciled in one pass
after all 7 phases and the finalization pass were DONE and committed (`c67f73c`..`98a7d22`).
Ranking by blast radius first: every entry's own "Blast radius if wrong" section described a
reversible, contained change (test placement, doc wording, a UI copy/tone choice, a one-line
architectural home, or a deferred-but-small bug fix) — none touched a public contract, schema
shape, auth model, irreversible migration, external dependency in the one-way-door sense, or a
trust boundary (prod access, money, customer data). A dedicated independent Opus pass
specifically scrutinized the three candidates most likely to be mis-scoped as reversible — the
aitp SDK floor bump, Phase 5's repo-wide `ApiError` class, and the `RunEvent` `T | null`
widening — and confirmed empirically (not on the plan's word) that all three are genuinely
additive/reversible: `.message` is byte-identical for `ApiError`, every consumer of the widened
`RunEvent` fields already null-guards, and the SDK floor is a narrowing (tightens review, not
loosens it) with its own cost already documented inline. Nothing was escalated to Fable or to
the user — the entire set was correctly Opus-decidable per the reversible tier of the Autonomy
ladder, and every entry below was settled by a fresh, independent Opus subagent analyzing the
actual current code (not the plan's or executor's description of it) before deciding.

Verdicts: 19 CONFIRM, 2 CHANGE (both applied), 1 DEFER. Full regression after all changes:
typecheck/lint clean, 665/665 tests passing (up from 625 pre-reconcile), coverage 84.24/75.03/
76.27/85.38 (ratchet 79/63/70/80), `format:check` at the pre-existing 149-file baseline
(matching `main`), build clean, integration suite 41/69 passing (28 intentionally gated).

**Phase 1 (2 entries):**
- *Shape/location of Tier-2 evidence* (`sdk-verification.integration.test.ts` ungated + `.ts`
  fixture module with provenance + `CONTROL` fixture). **Opus: CONFIRM** — re-verified the suite
  genuinely runs ungated in CI and the gated `cp-mutations.integration.test.ts` does not; still
  the strongest home. **Status: CONFIRMED (2026-09-23).**
- *`format:check` left failing, as found* (repo-wide pre-existing `printWidth` mismatch, not run
  in CI). **Opus: CONFIRM** — re-ran `format:check` against a `main`-tip worktree and got the
  identical 149-file baseline; fixing it is an unrelated repo-wide reformat outside this plan's
  purpose. **Status: CONFIRMED (2026-09-23).**

**Phase 2 (2 entries):**
- *Two badge-name prose corrections inside Phase 1's files* (`"VERIFICATION FAILED"` →
  `"SIGNATURE INVALID"` in a test title and a fixture doc comment, made false by Phase 2's own
  fix). **Opus: CONFIRM** — both strings verified accurate against the actual current renderer.
  **Status: CONFIRMED (2026-09-23).**
- *`Object.hasOwn` over the plan's literal `in`/`!== undefined` suggestion*, closing a
  prototype-chain hole (`'toString' in MAP` is `true`). **Opus: CONFIRM** — pattern and its
  pinning tests (`it.each(['toString','constructor','hasOwnProperty'])`) still in place; no
  later phase introduced a weaker duplicate. Incidentally found the same unguarded-`in`/`??`
  shape pre-existing in two untouched, unrelated components (`boundary-badge.tsx`,
  `status-badge.tsx`) — out of this plan's scope, left alone, noted here as a possible future
  cleanup, not a follow-up this plan owns. **Status: CONFIRMED (2026-09-23).**

**Phase 3 (4 entries):**
- *`RunEvent`'s new trust fields typed `T | null`, not bare-optional.* **Opus: CONFIRM** — all
  eleven fields (plus `scope`) still typed this way; every Phase 4-6 consumer already
  null-guards; the one remaining cast (`delegation.rejected`'s pre-existing `error` field) still
  carries its explanatory comment. **Status: CONFIRMED (2026-09-23).**
- *Took the discretionary `delegation.issued`/`delegation.redeeming` card extension*, with
  `TOKEN`/`CLAIMS` labeling (not `TCT`) on `delegation.issued`. **Opus: CONFIRM** — both cards
  and the labeling still in place, still the right naming given the wire's own `typ` claim.
  **Status: CONFIRMED (2026-09-23).**
- *Captured wire frames live in `event-cards.test.tsx`, not a separate fixtures module.*
  **Opus: CONFIRM** — the exhaustive `Record<keyof RunEvent, true>` mirror genuinely fails to
  compile on a field rename (traced directly); the "exactly one consumer" reasoning still holds
  and doesn't warrant unifying with Phase 1's differently-shaped (multi-consumer) fixture
  convention. **Status: CONFIRMED (2026-09-23).**
- *`pop_failed`/`identity_hint_malformed` left to the manifest card's generic red wording*,
  because the better fix (export a post-signature predicate from Phase 2's file) was blocked by
  an artificial phase-sequencing boundary. **Opus: CHANGE, applied** — now that all phases are
  complete, that boundary no longer applies. Exported `manifestPostSignatureDetail()` from
  `src/lib/verification-display.ts:117-129` (mirroring the existing `isUnassessedManifestCode`
  precedent, `Object.hasOwn`-gated, the underlying `Record` still module-private) and wired it
  into `event-cards.tsx`'s `manifestVerifyFailedVerdict`, so both codes now render the same
  post-signature-aware phrasing the CP badge already uses instead of the generic branch. Added
  direct unit tests for the new export and updated/added card-render tests for both codes. No
  second copy of the code list was introduced (`grep` confirmed empty in `src/components/`).
  **Status: RESOLVED (2026-09-23)** — the change described here is the resolution; no further
  follow-up required.

**Phase 4 (7 entries):**
- *Shared `useRunTimeBase` hook, called once in `run-detail.tsx`.* **Opus: CONFIRM.**
  **Status: CONFIRMED (2026-09-23).**
- *Monotone base held in `useState`, not the plan's literal `useRef`*, forced by the
  `react-hooks/refs` lint rule. **Opus: CONFIRM** — independently reproduced the lint failure on
  a scratch `useRef` version (4 errors) rather than trusting the claim; this was never a
  preference, it's a hard constraint that still holds. **Status: CONFIRMED (2026-09-23).**
- *The plan's self-contradictory "offsets unchanged across the swap" test split into two cases
  (plus a third)*, since the single literal assertion cannot hold in general. **Opus: CONFIRM.**
  **Status: CONFIRMED (2026-09-23).**
- *Negative offsets rendered with a sign rather than clamped to `+0ms`.* **Opus: CONFIRM**, on
  its own judgment as requested — clamping two events 12ms apart to identical `+0ms` would be a
  worse dishonesty than an ugly negative number, consistent with this plan's whole discipline.
  **Status: CONFIRMED (2026-09-23).**
- *A third instance of the same unit bug, `run-deliveries.tsx:119`, reported but not fixed in
  Phase 4* (out of that phase's scope at the time). **Opus: CHANGE, applied** — the
  phase-sequencing restriction no longer applies now that the plan is complete, and the fix was
  genuinely as small as the original entry predicted. Moved `formatOffset` from
  `event-cards.tsx` to the shared `src/lib/utils.ts` (next to `runOffsetMs`, which it already
  conceptually pairs with — a strictly better long-term home now two components need it);
  threaded `baseTs` from `run-detail.tsx` into `RunDeliveries`; the Deliveries-tab cell now
  reads `formatOffset(runOffsetMs(ts, baseTs))` instead of the raw epoch-seconds bug. Added
  `run-deliveries.test.tsx` (10 cases; this component had zero tests before) plus direct unit
  tests for the now-exported `formatOffset`. **Status: RESOLVED (2026-09-23).**
- *Phase 4's own "Depends on" premise was false — seven event types render no timestamp at all,
  and still do after Phase 4* — correctly identified as a **design decision** (does a
  `Card`-shaped trust event show its offset in a header row?), not a bug, and correctly not
  invented by any implementation pass. **Opus: DEFER** — confirmed the gap is unchanged and
  confirmed Phase 7 already documented it accurately in `docs/FEATURES.md`'s "Live timeline
  behaviour" section (verified via `git blame`, commit `abc53a8`), so no further doc action is
  needed either. Evidence that would settle it: a product decision on whether these seven event
  types should carry a timestamp and in what visual treatment — worth a tracked GitHub issue if
  the team wants it actioned, not something a reconcile pass should decide unilaterally.
  **Status: DEFERRED (2026-09-23)** — tracked here; not a blocker to shipping.
- *`key={runId}` on the route segment (`src/app/runs/[id]/page.tsx`), outside Phase 4's named
  Files*, closing a currently-unreachable but silent run-identity leak in the new time-base
  hook. **Opus: CONFIRM** — attribute and all three pinning tests still present.
  **Status: CONFIRMED (2026-09-23).**

**Phase 5 (4 entries):**
- *`ApiError` deliberately does not set `.name`*, to avoid an unrequested copy change at 12
  existing `String(err)` call sites across four unrelated features. **Opus: CONFIRM** —
  confirmed all 12 sites still unchanged and still the dominant idiom (`.message` is used in
  exactly one place codebase-wide), so updating them now would be introducing a new pattern
  across unrelated surfaces, not catching up to an established one — real scope creep for a
  reconcile pass. **Status: CONFIRMED (2026-09-23).**
- *404/400 outcomes gated on a `detail` prefix, not status alone*, closing a real
  mislabel-on-an-unrelated-4xx risk. **Opus: CONFIRM.** **Status: CONFIRMED (2026-09-23).**
- *Three-tone severity taxonomy (amber/blue/red), blue for "nothing was attempted."*
  **Opus: CONFIRM**, on its own design judgment — independently verified blue is genuinely
  already this codebase's informational token elsewhere (`colors.ts`'s `eventColor`/
  `boundaryColor`), not retrofitted to justify the claim. **Status: CONFIRMED (2026-09-23).**
- *Five handshake error-body shapes plus a non-HTTP `no_response` outcome*, beyond the plan's
  named three (a 422 validation array, a transport-level no-status failure, and a 403 CSRF
  shape from `proxy.ts`). **Opus: CONFIRM** — all three additions and their tests still in
  place; this entry had already been corrected once during Phase 5's own verification loop
  (title fixed from "fourth" to "five, plus a non-HTTP outcome"). **Status: CONFIRMED
  (2026-09-23).**

**Phase 6 (1 entry):**
- *Acceptance criterion 1 ("exactly two `RFC-AITP` hits") cannot literally hold*, since Phases 2
  and 5 already added 4 pre-existing code-comment RFC citations before Phase 6 ran.
  **Opus: CONFIRM** — re-ran the literal grep (still 6 hits, none containing "compliant");
  independently agreed the 4 extra hits are engineering-rationale JSDoc comments, not
  operator-facing conformance claims, so adding `(Draft)` to them would be a category error, not
  a consistency fix. Left all 6 as-is. **Status: CONFIRMED (2026-09-23).**

**Phase 7 (1 entry):**
- *`PROGRESS.md`'s Repo map condensed ~70% rather than "retained as written"* (already corrected
  once during Phase 7's own close-out after a verifier caught the understatement).
  **Opus: CONFIRM** — spot-checked several of the condensed map's claims against actual current
  code (all accurate) and confirmed the `## Phase log` section is byte-for-byte undisturbed by
  either the Phase 7 or finalization commits. **Status: CONFIRMED (2026-09-23).**

**Finalization pass (1 entry):**
- *Two genuine cross-phase test gaps closed* (Phase 3×4 offset composition on
  `delegation.redeeming`; Phase 3×5 banner/timeline coherence), two other candidate seams
  confirmed already covered, one stale `docs/CONVENTIONS.md` bullet fixed, one documentation
  addition (`docs/ARCHITECTURE.md` federation topology) deliberately declined on the merits.
  **Opus: CONFIRM** — both new tests re-run directly and confirmed non-vacuous; this entry was
  already independently re-verified in the final cumulative-diff gate before reconcile started.
  **Status: CONFIRMED (2026-09-23).**

**Summary:** 19 confirmed as-is, 2 changed and resolved (both applied directly, no follow-up
required), 1 deliberately deferred (a genuine product/design decision, not a bug — tracked here,
non-blocking). Zero entries needed escalation to Fable or the user. All settled by independent
fresh-Opus analysis against the actual current code, not the plan's or an executor's prior
description of it; two of the six reconciling agents found and reported unrelated, out-of-scope
observations (a pre-existing prototype-safety gap in two untouched components; a concurrent
edit from a sibling reconcile task) without acting on either, correctly respecting scope.
