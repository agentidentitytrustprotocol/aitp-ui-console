# Assumptions

Working queue of UNCONFIRMED assumptions for the current plan, to be settled by
`/reconcile`. Resolved entries move to `DECISIONS.md` and are removed from here.

Cleared 2026-09-23 when planning the upstream-drift absorption work. The two prior entries
(both from `plans/docs-tests-integration-coverage-recent-fixes.md`, both RESOLVED in PR #47)
were removed rather than archived here because `DECISIONS.md` already carries each of them in
full, original-assumption text included.

Repointed 2026-09-23 at the merged plan. Two independent sessions had each written a full plan
for the same drift (`plans/absorb-cp-playground-changes.md` and
`plans/upstream-drift-absorption.md`); this file previously named the latter. They are now
merged into **`plans/absorb-cp-playground-changes.md`**, which is the single active plan. The
other file is retained as `plans/upstream-drift-absorption.SUPERSEDED.md` for reference only —
do not implement from it.

_`/implement` logs this plan's defaults here as it lands each phase — see the Open questions
section of `plans/absorb-cp-playground-changes.md` for the nine already decided during planning
and merging. Items 1–3 there were escalated by a review round or by the two-plan conflict and
are recorded as resolved-by-merge rather than as open defaults. Open entries from `/implement`
follow._

## Shape and location of Phase 1's Tier-2 evidence

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 1's Files section says the behavioural evidence goes in "one
`*.integration.test.ts` — extend `src/test/cp-mutations.integration.test.ts` or add a colocated
one", and that Tier-2 fixtures land "under `src/test/fixtures/`" with "the exact generating
snippet in a header comment". It does not say which of the two test homes to pick, nor in what
file format the envelopes should be stored.

**Chose:** (a) A **new, ungated** suite, `src/test/sdk-verification.integration.test.ts`, rather
than extending `cp-mutations.integration.test.ts`. Measured reason: `cp-mutations` is gated on
`RUN_INTEGRATION=1` and *skips* in CI (confirmed — it is one of the three skipped suites in
every `npm run test:integration` run), so evidence placed there would never actually execute on
a PR. The new file needs no running service, only the native addon, so it is left ungated and is
real CI coverage. (b) Fixtures committed as a **`.ts` module** (`src/test/fixtures/minted-manifests.ts`)
exporting object literals, not as raw `.json`. Reasons: JSON cannot carry the provenance header
the plan requires, and welding the generating snippet to the data is the whole point of
committing it; and re-serializing is provably safe because the manifest signature covers the JCS
canonicalization of the body minus `signature`, never the transmitted bytes — verified
empirically (every fixture was minted, re-parsed, `JSON.stringify`d and accepted by
`verifyManifestJson` on 0.12.0). (c) Added a **third `CONTROL` fixture** the plan did not name,
carrying neither disputed member. It is the scientific control: it verifies on 0.10.0 *and*
0.12.0, which is what makes the other two fixtures' 0.10.0 failures attributable to the one
member that differs rather than to the external minter being incompatible with `aitp-rs`.

**Alternatives:** Extend `cp-mutations.integration.test.ts` (rejected — skips in CI, so the
phase's headline evidence would be dead weight). Store fixtures as `.json` plus a sibling
`README.md` for provenance (rejected — splits data from provenance, the exact failure mode the
plan's "provenance must be auditable from inside this repo" requirement exists to prevent).
Store the byte-exact minted wire text as a single-line string constant (rejected — unreviewable,
and buys nothing, since the signed bytes are the JCS canonical form, not the wire form). Ship
only the two named fixtures without a control (rejected — without it, "these two fail on 0.10.0"
is indistinguishable from "anything this minter produces fails on 0.10.0").

**Blast radius if wrong:** Contained to test code. The worst case is that a reviewer prefers the
fixtures in a different file or format and the module moves; the measured evidence, the
provenance header and the generating snippet travel with it unchanged. Nothing in `src/` outside
the two test files and the fixture module depends on any of it.

**Status:** UNCONFIRMED

## Phase 1 leaves `npm run format:check` failing, as it found it

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 1's acceptance gate is `npm ci && npm run typecheck && npm run lint &&
npm test && npm run test:integration && npm run build`. `format:check` is not named, and the
plan is silent on it.

**Chose:** Leave it failing and not run `prettier --write`. `npm run format:check` reports style
issues in **151 files** on this branch, including many this phase never touches
(`src/lib/utils.ts`, `src/lib/colors.ts`, `src/lib/verification-display.ts`,
`src/test/bff-routes.integration.test.ts`, ...) — verified pre-existing by running prettier
against a file the phase does not modify. The cause is structural: `.prettierrc.json` sets
`printWidth: 80` while the codebase is written at ~100, and **`.github/workflows/ci.yml` does not
run `format:check` at all** (its steps are `npm ci`, `typecheck`, `lint`, `test --coverage`,
`test:integration`, `build`). So the script is repo-wide-red by long-standing practice, not by
anything in this phase.

**Alternatives:** Run `prettier --write` over the repo (rejected outright — it would touch ~151
files and directly violate Phase 1's own acceptance criterion "No file under `src/` other than
the named test files is modified by this phase", and would bury a security-relevant dependency
bump under whole-repo formatting churn). Run prettier over only the three files this phase
touches (rejected — it would reformat `verification-display.test.ts` wholesale at
`printWidth: 80`, making the Phase 1 diff unreadable and colliding with Phase 2, which edits the
same file; and it would leave the repo in a *more* inconsistent state, with three files at 80
columns and the rest at 100).

**Blast radius if wrong:** None to behaviour. If the project decides it wants the repo prettier-
clean, that is a standalone formatting commit (and probably a `printWidth` correction first),
independent of this plan and best done when no phase has the same files open.

**Status:** UNCONFIRMED

## Phase 2 corrects two badge-name references inside Phase 1's files

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 2's Files section names six edit sites and its acceptance criterion 11 names
four pinned literals. It does not mention `src/test/sdk-verification.integration.test.ts` or
`src/test/fixtures/minted-manifests.ts`, and the executor brief says not to touch Phase 1's
files. But both contain **prose** describing the badge that `signature_invalid` renders as —
`it('DELTA: … a RED "VERIFICATION FAILED" badge on an authentic artifact')`
(`sdk-verification.integration.test.ts:204`) and "throws `signature_invalid`, which this console
renders as a RED \"VERIFICATION FAILED\" badge" (`minted-manifests.ts:210-211`). Phase 2 makes
both statements **false**: `signature_invalid` now renders `· SIGNATURE INVALID
(signature_invalid)`. The plan is silent on who fixes prose that this phase itself invalidates.

**Chose:** Fix both, minimally — swap the quoted badge headline `"VERIFICATION FAILED"` →
`"SIGNATURE INVALID"` in each, and nothing else. No assertion, fixture, measurement or test
behaviour changed; both edits are inside a string that is documentation. Reason: the whole point
of this phase is that the console must not state things it has not established, and leaving a
freshly-falsified claim in the repo — in the very files that are Phase 1's evidence of honesty —
would be the same failure mode one layer up. A future auditor reading
`minted-manifests.ts:210` would be told `signature_invalid` renders as VERIFICATION FAILED and
could reasonably conclude Phase 2 was reverted.

**Alternatives:** Leave both stale and note them for Phase 7's documentation sweep (rejected —
Phase 7 is four phases away, and a claim that is false the moment this commit lands should not
survive four commits; also, neither file is in Phase 7's named doc list, so nothing guarantees
anyone would look). Widen the prose to something version-neutral like "a red badge" (rejected —
it throws away the specific, checkable fact, and this repo's convention is to name badge strings
exactly so drift breaks something). Leave them and relax the brief's "don't touch Phase 1's
files" by asking first (rejected — a two-word prose correction in a comment is not a one-way
door or a cross-repo write).

**Blast radius if wrong:** Nil functionally — both edits are inside a doc comment and an `it`
title. If a verifier prefers Phase 1's files untouched, reverting is two one-line edits and the
only cost is that the two stale sentences come back.

**Status:** UNCONFIRMED

## Phase 2's `Record` membership test uses `Object.hasOwn`, not `in`

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 2's "Edge cases & failure modes" calls the `Record<string, string>` lookup a
typing trap and prescribes "Membership-test it (`code in MAP`, or `const detail = MAP[code]; if
(detail !== undefined)`), never truthiness-test the result". Both suggested forms close the
`undefined`-in-the-badge hole the plan is worried about. Neither closes a second one the plan did
not consider: `verdict.code` is an arbitrary SDK string, and **both** forms match inherited
members — `'toString' in MAP` is `true`, and `MAP['toString']` is a function, not `undefined`. A
code of `toString` or `constructor` would render a stringified function into the badge.

**Chose:** `Object.hasOwn(MANIFEST_POST_SIGNATURE_DETAIL, verdict.code)`. It is a membership test
(so it satisfies the plan's instruction as written), it is a single ES2022 call available under
this repo's `target: "ES2022"` and Node `>=22.13.0` floor, and it is own-property-only, so an
inherited member falls through to the generic catch-all like any other unmodelled code. Pinned by
an `it.each(['toString', 'constructor', 'hasOwnProperty'])` case asserting exactly that, plus a
`__proto__` case on the predicates.

**Alternatives:** `code in MAP` verbatim as the plan's first suggestion (rejected — reintroduces
the prototype hole; the codes are snake_case today, but "today's SDK only emits snake_case" is
precisely the kind of assumption this plan's forward-compat discipline forbids relying on).
`const detail = MAP[code]; if (detail !== undefined)` (rejected for the same reason — an
inherited function is not `undefined`). Switch the container to a `Map`, which has no prototype
chain (rejected — the plan explicitly specifies a `Record`, and `Object.hasOwn` gets the same
safety without deviating from the named data structure; a `Map` would also read as a silent
disagreement with the plan rather than a hardening of it).

**Blast radius if wrong:** Nil. If a reviewer prefers the literal `in`, it is a one-token change
and the two prototype-chain test cases are the only thing that would have to be deleted with it.

**Status:** UNCONFIRMED

## Phase 3 types the new trust fields `T | null`, not bare-optional

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 3's type list says "Keep them optional and flat, matching the existing style",
and every one of `RunEvent`'s twenty pre-existing fields is bare-optional (`error?: string`). But
the same phase's Edge cases say "`cause` may arrive as `null`, not absent — cards must handle
`null` and `undefined` identically", which bare-optional typing cannot express. The plan does not
say which of the two instructions wins.

**Chose:** `?: T | null` for all eleven new trust fields (`cause`, `source_url`, `detail`,
`reason`, `serves`, `fail_mode`, `delegatee_aid`, `role`, `peer_aid`, `peer_port`, `tct`), and the
twenty pre-existing fields left exactly as they were. Reading "optional and flat" as the
instruction it is contrasted against in the plan's own next sentence — *"**Do not** invent a
shared `cause` alias over `reason`/`error`/`detail`"* — i.e. flat-and-per-producer rather than
nested-or-aliased, not a rule about nullability. Three measured reasons for the `| null`:
(a) `null` is a value this wire demonstrably carries — `cause`/`source_url` are declared on
playground's pydantic `RunEvent` and `runner/context.py:55` dumps with `model_dump()` and no
`exclude_none`, so an orchestrator frame that sets neither carries both as JSON `null`, and
`delegation.redeemed` site 2 reads `peer_aid`/`jti`/`grants` from `claims.get(...)`
(`agent_admin.py:625-627`), which returns `None` on a token lacking them; (b) this file already
uses the form (`RunSummary.created_at: number | null`, `RunCreated.run_label?: string | null`), so
it is *an* existing style, not a new one; (c) it makes the tests the plan mandates —
"`cause` explicitly `null`" — expressible without a cast, so the null path is actually type-checked
rather than cast past. The one place a cast remained is the `delegation.rejected` `error: null`
case, because `error` is pre-existing and was deliberately not widened; that cast carries a comment
saying so.

**Alternatives:** Bare-optional for the new fields too, with `as unknown as RunEvent` casts in every
null test (rejected — the null-handling requirement is the honesty-relevant part of this phase, and
a cast is the one construct that makes a type stop checking it; it would also read as agreement
with a shape the wire contradicts). Widen all twenty pre-existing fields for uniformity (rejected —
outside this phase's Files, and it would bury eleven additions inside a thirty-one-field churn on a
diff whose whole value is auditability). Model the two channels as separate interfaces (rejected —
a much larger change than Phase 3 authorises, and `run-timeline.tsx` consumes one flat list).

**Blast radius if wrong:** Contained and mechanical. Every consumer reads these fields through a
truthiness or `!== null && !== undefined` guard, so dropping `| null` is a find-and-replace in one
interface plus casts in the null test cases; no card logic or copy changes either way.

**Status:** UNCONFIRMED

## Phase 3 takes the discretionary `delegation.issued` / `delegation.redeeming` extension

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 3 offers a "Discretionary in-phase extension" — cards for `delegation.issued`
and `delegation.redeeming`, so the flow does not read issued (grey) → redeeming (grey) → redeemed
(card) — and calls it "Recommended if cheap, not required". It says to note the decision in the
commit message *if skipped*, and says nothing about how to record taking it. It also does not list
`scope`, the one field `delegation.issued` needs and that no other event in the phase carries.

**Chose:** Take it, and add `scope?: string[] | null` alongside the eleven fields the plan lists.
It was cheap exactly as the plan predicted: `delegation.redeeming` is orchestrator-side and reuses
the already-modelled `initiator`/`target` (`runner/engine.py:441-443`), so it needed no new field
and no capture — it goes through the pydantic model, the channel the plan says needs no further
confirmation. `delegation.issued` needed one field and one more literal frame capture, which cost
about thirty lines on a harness that was already standing up real agents for the `delegation.redeemed`
captures. Recording the decision here rather than in a commit message because this executor pass
does not commit, and the plan's "note it so it reads as a decision rather than an oversight" is the
actual requirement — the commit message was only its suggested venue.

Also chosen, and deliberately narrow: `delegation.issued`'s `tct` is rendered with the labels
`TOKEN`/`CLAIMS`, not `TCT`. Playground puts a *delegation* envelope through the same `tct_event()`
helper (`agent_admin.py:579`), and the captured frame's token carries `"typ":"aitp-delegation+jwt"`,
so calling it a TCT on that card would be a small fresh overclaim of precisely this plan's class.
The shared `TokenClaims` component therefore names neither, and a test pins that
`delegation.issued` renders no `/tct/i` at all.

**Alternatives:** Skip both and note it (rejected — the plan recommends taking it, the cost was
measured rather than estimated, and the asymmetric grey-grey-card sequence is a real
readability defect an operator meets on every delegation scenario). Take `delegation.redeeming`
only, since it is free (rejected — it closes the cheaper half and leaves the more informative event
grey, which is the asymmetry the extension exists to remove, just moved one step). Take
`delegation.issued` without capturing a frame for it, on the strength of its `emit()` kwargs
(rejected — it is an agent-channel event, so it is exactly the class the plan forbids inferring
from kwargs; capturing it also turned up that its `scope` claim name differs from `grants`, which a
kwargs read would have shown but a shape assumption would not).

**Blast radius if wrong:** Two components, one interface field and four tests, all additive. Reverting
is a deletion: no other card, type or test depends on either addition, and `delegation.issued` /
`delegation.redeeming` would simply return to the grey default row they occupied before.

**Status:** UNCONFIRMED

## Phase 3's captured frames live in `event-cards.test.tsx`, not a fixtures module

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 3's acceptance criterion 1 requires "a literal captured example frame for each
of the four agent-side event types — and one per `delegation.redeemed` emit site, three in total"
to be "recorded in the commit message or a test fixture". This executor pass is explicitly told not
to commit, which removes one of the two venues; and the phase's Files section names only
`playground.ts`, `event-cards.tsx` and `event-cards.test.tsx`, so it does not contemplate a
`src/test/fixtures/` module the way Phase 1 did.

**Chose:** A `CAPTURED_FRAMES` constant at the top of the new section of `event-cards.test.tsx`,
carrying eleven verbatim frames, a provenance header giving the reproduction recipe per frame, and
two tests over it: every key of every frame must be a declared `RunEvent` key (via a
`Record<keyof RunEvent, true>` mirror that TypeScript rejects if it drifts from the interface in
either direction), and every frame must render a typed card rather than the grey default. Reasons:
the frames are evidence *for these cards*, so welding them to the cards' own test file is what makes
a future reader of either find the other; and a fixture that only sits there proves nothing, whereas
the exhaustive-key mirror turns "the TypeScript field names match them exactly" from a claim in a
commit message into a check that fails on a typo.

**Alternatives:** A new `src/test/fixtures/playground-trust-events.ts` mirroring Phase 1's
`minted-manifests.ts` (rejected — Phase 3's Files section does not name it, and the frames have
exactly one consumer, so a second file buys separation this evidence does not need). Record them in
the commit message only (rejected — not available to this pass, and a commit message cannot be
re-run; the field-name claim would become unfalsifiable the moment upstream changed). Store them as
`.json` (rejected for the same reason Phase 1 rejected it — JSON cannot carry the provenance header,
and the recipe is half the evidence).

**Blast radius if wrong:** Test-only. If a reviewer prefers the fixtures in `src/test/fixtures/`,
the constant and its header move verbatim and the two tests import it instead of declaring it;
nothing under `src/` outside this one test file reads it.

**Status:** UNCONFIRMED

## Phase 3's manifest card leaves `pop_failed` / `identity_hint_malformed` to the generic red wording

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 3 requires the `manifest.verify_failed` card to route severity through Phase 2's
`isUnassessedManifestCode`, decide `unknown` explicitly, and never assert a signature verdict the
cause does not support. It is silent on the two manifest codes Phase 2 established are reachable
*only after* the outer signature verified — `pop_failed` and `identity_hint_malformed` — both of
which `_classify_manifest_verify_failure` will happily pass through as `getattr(exc, "code")`. Phase
2 gave those their own post-signature wording on the CP badge but exported only the *unassessed*
predicates, not `MANIFEST_POST_SIGNATURE_DETAIL`.

**Chose:** Do not refine them on the card. They take the generic red branch, whose wording is
`verification failed (pop_failed)` — which names the producer's cause and asserts nothing about a
signature, so it is honest, just less specific than the badge. The reason is the phase's own
criterion: the only way to word them as post-signature here is to restate that map's key list in
`src/components/`, and "**never** a second copy of the code list" / "`grep` shows no second copy of
either code list in `src/components/`" is the constraint Phase 3 is most explicit about. A
duplicated list that drifts is a worse failure than a true-but-vaguer sentence. This is recorded in
a comment on `manifestVerifyFailedVerdict` so the next reader sees it as a decision, and the
revocation side's `malformed_body` — which the plan *does* mandate as post-signature — is
unaffected, because that literal is playground's own and is enumerated here rather than borrowed
from Phase 2.

**Alternatives:** Copy the two keys into `event-cards.tsx` with the post-signature wording (rejected
— directly violates the criterion, and two copies of a two-entry map is exactly how the eight-code
taxonomy drifted in the first place). Export `MANIFEST_POST_SIGNATURE_DETAIL` (or a
`manifestPostSignatureDetail(code)` predicate) from `verification-display.ts` and reuse it (rejected
here, not on the merits — it is the *right* long-term shape, but `verification-display.ts` is Phase
2's file, this brief says not to touch Phase 2's files beyond what Phase 3's spec requires, and
Phase 3's spec does not require it). Widen the red wording to mention that some causes are
post-signature (rejected — it would be true of two codes and misleading about the other six).

**Blast radius if wrong:** One branch and one test. If a later phase exports a post-signature
predicate, the manifest card gains a fourth branch above the generic red one and nothing else moves;
no copy currently exists to delete.

**Status:** UNCONFIRMED

## Phase 4's run-relative base is a shared hook called once in `run-detail.tsx`

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 4's Approach names two homes for the base timestamp — "computed once in
`run-timeline.tsx` (which already maps over the full `events` array at `:100`) and passed down,
or derived in `use-run-events.ts` where the array is owned" — and separately requires (edge
cases 2 and 3) that the base survive **both** the live buffer's front-drop **and**
`mergeRunEvents`' live→persisted source swap, via a monotonically-lowering hold. It does not
reconcile the two: neither named home can satisfy the requirement for both consumers.
`use-run-events.ts` owns only the live buffer and never sees the persisted array, so it cannot
see the swap at all; `run-timeline.tsx` does see the merged array but is a *sibling* of
`run-summary.tsx` under `run-detail.tsx`, so a base held there is unreachable by the duration
figure, which needs the same value and has the same eviction problem.

**Chose:** A third home — a new `src/hooks/use-run-time-base.ts` (`useRunTimeBase`) called
**once in `run-detail.tsx`**, immediately after the `mergeRunEvents` `useMemo`, and threaded
into both surfaces as an optional `baseTs` prop (`RunTimeline` → `EventCard`, and `RunSummary`).
`run-detail.tsx` is the only place that sees both event sources, which is exactly where a value
that must be stable *across* the two belongs. Keeping it a prop rather than having each
component call the hook means there is one base per run, not two independently-converging ones,
and keeps the plan's own "prefer passing a `baseTs` prop over mutating events in the hook"
intact — nothing translates the wire shape. The unit fact itself lives in exactly one place,
`runOffsetMs` in `src/lib/utils.ts`, with the live-captured `ts` values in its doc comment.

**Alternatives:** Hold it in `run-timeline.tsx` per the plan's first suggestion (rejected —
`run-summary.tsx:12` is the plan's *own* second fix site and could not reach it; it would have
had to re-derive a base from `events[0]`, reintroducing the eviction bug in the duration figure
alone). Derive it in `use-run-events.ts` (rejected — it cannot observe the swap, which the plan
itself establishes is the case where a too-late base turns every offset negative). Call
`useRunTimeBase` separately in both components (rejected — two refs converge to the same value
in practice, but "in practice" is doing load-bearing work there, and a reader has to prove it;
one call site needs no proof).

**Blast radius if wrong:** One new hook file, one `useMemo`-adjacent line in `run-detail.tsx`,
and one optional prop on each of two components. The prop is optional and defaults to "render no
offset", so moving the hold elsewhere is a matter of deleting the two prop threadings; no data
shape, no wire type and no other component changes.

**Status:** UNCONFIRMED

## The monotone base is held in state, not the ref the plan specifies

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 4's edge-case 3 states the rule as "a **monotonically-lowering base** held in
a ref: `base = base === undefined ? events[0].ts : Math.min(base, events[0].ts)`". A `useRef`
implementation of exactly that was written first — and **`npm run lint` rejected it with four
`react-hooks/refs` errors** ("Cannot update ref during render", "Cannot access ref value during
render"). That rule is on in this repo's flat config, so the plan's literal instruction cannot
be followed and still pass the phase's own "lint green" acceptance criterion.

**Chose:** React's documented *adjusting-state-during-render* pattern instead — `useState` plus
a guarded render-time `setBase`, returning the freshly-computed `next` rather than the state
variable. The **rule the plan cares about is unchanged**: it is still
`base === undefined ? first : Math.min(base, first)`, still monotonically lowering, still held
across re-renders. Only the storage cell differs. Returning `next` (not `base`) preserves the
one property a ref had and naive `setState` would lose — the correct base is available in the
*first* render pass, so a timeline never paints a frame of offset-less rows. The `setBase` call
is guarded on `next !== base`, so it fires once per genuine lowering and cannot loop; a
StrictMode double-render test pins that down.

**Alternatives:** Keep the ref and add an `eslint-disable` (rejected — the rule is not a style
nit: a ref read during render is genuinely unsound under the React compiler, and silencing a
correctness lint to match a plan's incidental word choice inverts which of the two is the
authority on React). Compute the base inside an effect and store it in state (rejected — it
lands one render late, so every timeline would paint once with no offsets and then reflow).
Recompute from `events[0]` each render with no hold at all (rejected — it is the bug the edge
case exists to prevent).

**Blast radius if wrong:** One hook body, ~8 lines, fully covered by `use-run-time-base.test.tsx`
including the eviction, swap and StrictMode cases. Swapping the storage cell back to a ref (if a
future lint config drops the rule) is a local edit that no caller can observe.

**Status:** UNCONFIRMED

## Phase 4's "offsets unchanged across the swap" test is split in two, because it cannot hold in general

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 4's Tests section asks for "a `mergeRunEvents` source-swap case: render with a
truncated live buffer, then re-render with the full persisted array, and assert offsets are
non-negative **and unchanged for the events common to both**." Those two assertions contradict
each other under the phase's own mandated rule whenever the buffer *has* truncated: if the
persisted array reveals an earlier first event, `Math.min` lowers the base, and lowering the base
necessarily **moves** the common events' offsets (by exactly the amount that was missing). The
only way to leave them unchanged is to keep the too-late base — which is precisely what makes the
earlier persisted events render negative, the other half of the same sentence.

**Chose:** Split it into the two cases the sentence conflates, in a new
`src/components/runs/run-timeline.test.tsx` whose harness mirrors `run-detail.tsx`'s composition
exactly (`mergeRunEvents` → `useRunTimeBase` → `RunTimeline`). (1) **No eviction** — the live
buffer still holds the true first event, the terminal swap adds the final frame and the common
events' offsets are asserted *unchanged*; this is the ordinary case and the plan's literal
assertion. (2) **After eviction** — the persisted array starts 40s earlier, offsets are asserted
**non-negative** and re-anchored on the true run start, with a comment stating explicitly that
this case must *not* preserve the earlier offsets and why. A third case pins that a later
truncated array cannot push the base back up.

**Alternatives:** Assert only the non-negative half and drop "unchanged" (rejected — the
unchanged property is real and worth pinning in the case where it holds; that is the case a
reader will hit on nearly every real run). Assert both on one render pair (rejected — impossible;
one of the two assertions would have to be written false). Put the swap case in
`run-detail.test.ts` next to the existing `mergeRunEvents` unit tests (rejected — that file is
`.ts`, so a rendering test would force renaming it, and the assertion is about rendered offsets,
not about which array `mergeRunEvents` returns).

**Blast radius if wrong:** Test-only, one new file. `run-summary.test.tsx` is likewise new (the
plan's Files section says "edit", but no such file existed); if a reviewer wants these cases
elsewhere, both files move wholesale with no source change.

**Status:** UNCONFIRMED

## Negative offsets render with a sign rather than being clamped to `+0ms`

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 4's clock-skew edge case leaves the choice open: "Render a negative offset
honestly (**or clamp to `+0ms`**) rather than showing an absurd positive via unsigned
formatting." Both are permitted; the phase does not pick one, and the choice is user-visible
copy on every card in the timeline.

**Chose:** Render the sign — `-12ms`, `-1.5s`, `-1.5m`. `formatOffset` now derives `sign` from
the input and formats `Math.abs(ms)`, so the ordering it displays is the ordering the wire
actually reported. Reason: a clamp would present two events stamped 12ms apart as simultaneous,
and the skew it would be hiding is real information — it is the visible symptom of the two emit
channels (`runner/context.py`'s orchestrator model and `agents/base/telemetry.py`'s subprocess
POST) stamping `time.time()` in different processes. This console's whole discipline in this plan
is to not present a derived value as more settled than its inputs. `RunSummary`'s duration is
left unclamped for the same reason. Sub-second offsets are rounded (`Math.round`) rather than
truncated, because epoch-second floats otherwise render as `+294.31100010871887ms`.

**Alternatives:** Clamp to `+0ms` (rejected on the above; it is the option that makes the display
*look* tidier by discarding the one fact it had). Render negatives as `~0ms` or similar hedge
(rejected — invents a third vocabulary for a value that is simply negative). Leave sub-second
values unrounded (rejected — the float noise is an artifact of subtracting two ~1.79e9 doubles,
not a measurement).

**Blast radius if wrong:** One function, `formatOffset`, and three table rows in
`event-cards.test.tsx`. Clamping later is a one-line change (`Math.max(0, ms)` at the call site)
that no other code reads.

**Status:** UNCONFIRMED

## A third instance of the same unit bug, `run-deliveries.tsx:119`, is reported but NOT fixed in Phase 4

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 4's Files section names five source files (`event-cards.tsx`,
`run-summary.tsx`, `run-timeline.tsx`, `run-detail.tsx`, `lib/utils.ts`) and its acceptance
criteria are scoped to `formatOffset`'s single call site and `RunSummary`'s duration. While
sweeping `src/` for any other place that converts a run `ts` (`grep -rn "/ 1000\|/ 1_000" src/`),
a **third site with the identical defect** turned up that no plan round names:
`src/components/runs/run-deliveries.tsx:119` renders `` `+${(ts / 1000).toFixed(1)}s` `` for
every row of the run-detail **Deliveries** tab.

It is the same bug, confirmed the same way and not inferred: those rows are
`cp.webhook.delivered` events (`api/runs.py:222-225` filters the run's event list by that type)
and playground stamps them `"ts": time.time()` at `api/webhooks.py:91` — epoch seconds. So that
column reads `+1790199933.1s` today, and after this phase the same run's Timeline tab and its
Deliveries tab disagree about what a timestamp means.

**Chose:** Report it; do not fix it here. The phase brief is "implement exactly Phase 4, no
scope creep", the file is in none of the plan's Files sections, and the phase's acceptance
criteria neither mention nor would detect it — so fixing it would be an unreviewed, untracked
change riding in a phase commit. The fix is small and fully unblocked by this phase's work
(`RunDetail` now holds `baseTs`; `<RunDeliveries runId={runId} />` gains a `baseTs` prop and the
cell becomes `formatOffset(runOffsetMs(ts, baseTs))`, reusing what this phase already built), so
the cost of deferring is one follow-up commit, not a re-derivation.

**Alternatives:** Fix it in this phase (rejected — out of the phase's stated Files and criteria;
the same reasoning that kept Phase 2 from refining `pop_failed` wording that Phase 3 owned).
Say nothing and leave it for a docs sweep to notice (rejected — this plan's whole subject is
drift that went unnoticed because nobody swept for the second instance).

**Blast radius if wrong:** None to this phase's code. The consequence of deferring is that one
tab of the run-detail view keeps rendering an absolute epoch as an offset until a follow-up
lands — visibly wrong, but wrong in exactly the way it already was, not a regression this phase
introduces.

**Status:** UNCONFIRMED

## Phase 4's "Depends on" premise is false: seven event types render no time at all, and still do

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 4's **Depends on** (plan `:1657-1659`) is the phase's stated reason it needs
to do nothing further about Phase 3's work: "Phase 3's new cards use the existing `formatOffset`
unchanged and therefore inherit whatever this phase settles, introducing no new divergence."

**Chose:** Record that the premise's first clause is **false** — and change nothing on the
strength of it. Measured, not inferred: `EventCard` computes `offset` once
(`event-cards.tsx:49`) and threads it **only** into the `<Line ts={offset}>` wrapper. Seven
`case`s bypass `Line` entirely and render **no time at all** — `run.failed` (`:205-214`),
`manifest.verify_failed` (`:216`), `revocation.verify_failed` (`:219`),
`revocation.degraded_serve` (`:222`), `delegation.issued` (`:225`), `delegation.redeemed`
(`:238`) and `delegation.rejected` (`:241`). The six trust cards are `Card`-shaped components
that receive `evt` only; `baseTs` never reaches them, so none of them has **ever** called
`formatOffset`, before this phase or after it. (Two near neighbours do, which is what makes the
list exact rather than a guess: `delegation.redeeming` `:230` renders an offset through `Line`,
and `run.complete` `:193,200` renders both the offset and the total-elapsed figure.)

So the premise's *conclusion* survives by accident — there is indeed "no new divergence",
because there is no timestamp to diverge — while its reason is wrong. This is **not a regression
Phase 4 introduces**: those seven cards rendered no time before this phase and render no time
after it, and no behaviour changed for them in either direction.

Not fixed here, for the same reason `run-deliveries.tsx:119` above is not: **scope**. Phase 4's
Files section names five source files (`event-cards.tsx`, `run-summary.tsx`, `run-timeline.tsx`,
`run-detail.tsx`, `lib/utils.ts`) and its acceptance criteria are scoped to `formatOffset`'s
single call site and `RunSummary`'s duration; none of them mentions, or would detect, a card that
renders no timestamp. And giving seven cards a timestamp they never had is a **feature addition**,
not a unit fix — it needs a design decision this plan never took (does a bordered `Card`-shaped
trust event carry its offset in the header row like `run.complete` does, or not at all? the six
trust cards were deliberately given a different visual weight from the `Line` rows in Phase 3),
plus a `baseTs` prop on six components and tests for each. That does not belong in a commit whose
subject is "`ts` is epoch seconds".

**Flagged as a candidate** for **Phase 7's documentation sweep** (which already owns
`docs/FEATURES.md`'s "Live timeline behaviour", the one place a reader could be told which events
carry a time) **or a follow-up phase** alongside the `run-deliveries.tsx:119` deferral — the two
are the same shape of leftover and are cheapest done together, since both are now fully unblocked
by this phase: `RunDetail` holds `baseTs`, and each site needs only the prop plus
`formatOffset(runOffsetMs(ts, baseTs))`.

**Alternatives:** Give the seven cards a timestamp in this phase (rejected — out of the phase's
stated Files and criteria, and a design decision rather than a bug fix; it is also the larger of
the two changes this phase has now deferred, and would ride in unreviewed). Silently correct the
plan's "Depends on" sentence (rejected — this executor pass does not edit the plan, and the
premise being wrong is exactly the kind of fact that should be logged rather than quietly
overwritten; a reader of the plan alone would otherwise still believe those cards inherit the
fix). Assert the gap in a test so it cannot be forgotten (rejected — a test pinning "these seven
cards render no time" reads as a *decision* that they should not, which is precisely the claim
this entry declines to make either way).

**Blast radius if wrong:** None to code — nothing was changed. The consequence of deferring is
that an operator reading a timeline sees offsets on the `Line` rows and none on the six trust
cards or `run.failed`, exactly as before this phase. If a reviewer decides the timestamps are
in scope after all, the work is additive (one prop, six components) and no part of this phase's
`baseTs` threading has to be redone to accommodate it.

**Status:** UNCONFIRMED

## Phase 4's run-identity reset lands in `src/app/runs/[id]/page.tsx`, outside the phase's Files

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 4's edge case 3 states the base rule entirely in terms of **one** run's event
array (buffer eviction, the `mergeRunEvents` source swap) and never considers a **second** run.
The monotonically-lowering hold it mandates is correct within a run and unsafe across two: the
base can only ever fall, so if the component holding it ever re-rendered for a *different* run
without unmounting, run A's earlier start would persist into run B and permanently shift every
one of its offsets. `useRunTimeBase` takes only `events`, so it cannot see run identity and
cannot fix this itself; the plan's Files section names no file above `run-detail.tsx`.

**Chose:** `key={runId}` on `<RunDetail>` in the route segment, `src/app/runs/[id]/page.tsx:19`
— a file outside Phase 4's Files list, logged here for that reason. That segment is the only
place run identity is known *above* the hook, so it is the only level at which a run change can
be made a remount rather than a re-render. Stated honestly: the hazard is **currently
unreachable** — `RunDetail`'s only navigation is its `Link href="/runs"` back to the list, which
unmounts the subtree, so no in-place run swap exists today. It is closed anyway because the hook
is brand-new code in this phase, the cost is one JSX attribute, and the failure mode (every
offset in a run silently shifted, no error, no visual tell) is the class of bug this whole plan
exists to remove. Pinned by three cases in `run-timeline.test.tsx`: the keyed subtree re-anchors
on the new run, the unkeyed one demonstrably does not, and the route segment really does emit the
key — with the *decoded* id, the same value the prop carries, so an encoded run id keys once
rather than under two spellings.

**Alternatives:** Give `useRunTimeBase` a `runId` argument and reset when it changes (rejected —
an API change to the hook plus a second piece of identity state inside it, to reproduce what
React's own remount already does for free; the plan's rule stays a pure function of the event
array this way). Extract the `baseTs`-holding part of `RunDetail` into an inner component keyed
on `runId` (rejected — identical effect with more moving parts, and it puts the key further from
where the id actually enters the app). Leave it, since it is unreachable (rejected — "unreachable"
here is a property of today's routing, not of the hook; the next person to add a run-switcher
inside the detail view would reintroduce it with no test to catch them).

**Blast radius if wrong:** One JSX attribute. Removing it restores the previous behaviour
exactly. The only cost of keeping it is that a hypothetical in-place run navigation remounts
`RunDetail` instead of re-rendering it — which changes nothing observable, because every hook in
that subtree (`useRun`, `useRunEvents`) is already keyed on `runId` and would restart anyway, and
the tab is read from the URL rather than held in state.

**Status:** UNCONFIRMED

## Phase 5's `ApiError` deliberately does NOT set `name`

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 5 Step 1 requires a typed error "with the same `message` string as today for
backward compatibility". It says nothing about `name`, and the obvious reading of "introduce an
`ApiError extends Error`" is that the class sets `this.name = 'ApiError'` the way a named error
subclass normally does.

**Chose:** leave `name` inherited, so it stays the literal string `'Error'`.
`Error.prototype.toString` reads `this.name`, and **twelve** call sites render `String(err)`
straight into operator-facing text — `trust-anchors.tsx:94,111,377`, `pinned-keys.tsx:55,270`,
`revocation.tsx:41`, `webhook-form.tsx:42`, `webhook-list.tsx:388,403`,
`enrollment-modal.tsx:50`, `agent-detail.tsx:43` and `run-detail.tsx:78` — plus
`federation-view.tsx`'s remaining generic `ErrorBanner` on the host/invoke/stop paths. Setting `name` would silently retitle every one of
those from `Error: POST … failed: 409 — …` to `ApiError: POST …`, which is a user-visible copy
change across four features that this phase has no mandate to make and no tests covering.
"`message` is unchanged" is plainly meant to protect exactly those strings, and protecting
`message` while changing `toString()` would honour the letter and miss the point. Pinned by
`client.test.ts`: one case asserts `String(err)` is byte-identical and `err.name === 'Error'`,
and `federation-view.test.tsx`'s stop-path case asserts the full unchanged banner text.
`instanceof ApiError` is the documented way to detect the type, called out in the class doc
comment so nobody reaches for the name.

**Alternatives:** Set `name = 'ApiError'` and accept the copy change (rejected — an unrequested,
untested change to four features' error text, riding in on an unrelated fix). Set it and update
all twelve call sites to render `err.message` instead of `String(err)` (rejected — that is a
real improvement and a real diff, and it belongs to whoever owns those surfaces, not to this
phase; it would also quietly drop the `Error: ` prefix operators may be used to). Set it and
override `toString()` (rejected — two sources of truth for one string, and the next reader has
to find both).

**Blast radius if wrong:** One line in `client.ts` plus one assertion in `client.test.ts`.
Anyone who wants `'ApiError'` gets it by adding `this.name = 'ApiError'`; the only thing that
changes is the prefix on those twelve rendered strings.

**Status:** UNCONFIRMED

## Phase 5's 404 and 400 rows match a `detail` prefix, not the status alone

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 5's classification table lists `agent gone` as matching on `404` and
`not did:web` as matching on `400` — status only, no `detail` condition — while all five
remaining rows are given as status **plus** a `detail` prefix. Taken literally, any 404 reaching
the handshake mutation would render "The playground has no hosted agent with this id … refresh
the list".

**Chose:** gate both on a `detail` substring as well — `no hosted agent` for the 404,
`only did:web peers supported` for the 400 — so an unattributable 404 or 400 degrades to the
`unclassified` raw render instead. Reason: a 404 can reach that mutation without coming from
`hosted.py` at all (a missing or renamed console route returns Next.js's own HTML 404; an
intermediary can synthesize one), and "the hosted agent is gone, refresh the list" would then be
a confident, wrong, actionable instruction. That is precisely the class of overclaim the phase
exists to remove, and the plan's own edge-case guidance says the fallback must "render the raw
text honestly rather than mislabeling it — a mislabel is worse than the current generic banner."
Gating also makes all seven rows structurally identical, which is why the inconsistency looked
like an oversight in the table rather than a decision. The cost is stated: if playground rewords
either message, that outcome loses its specific copy and falls back to the honest raw render —
the same trade every other row already makes. Two cases in `federation-errors.test.ts` pin it
(an HTML 404 body and a FastAPI `{"detail":"Not Found"}`, both `unclassified`).

**Alternatives:** Follow the table exactly (rejected — ships a confident mislabel on a body
shape that genuinely occurs). Gate the 404 but not the 400 (rejected — a 400 with an unrelated
`detail` has the same problem and the asymmetry would be arbitrary). Add a `console`-vs-upstream
provenance flag in `proxy.ts` so a 404 can be attributed structurally (rejected — cross-cutting
change to a Phase-1–4 file for a case the substring match already handles).

**Blast radius if wrong:** Two `&& parsed.detail?.includes(…)` clauses. Deleting them restores
the plan's literal status-only behaviour, and the two tests naming `unclassified` for those
bodies are the only things that would need changing.

**Status:** UNCONFIRMED

## Phase 5's severity taxonomy is three tones, with "nothing was attempted" rendered blue

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 5 Step 3 mandates exactly one severity distinction — "the two 409s … should
read amber/informational rather than red" — and otherwise says only "a color token matching
severity". It assigns no token to the 404 or the 400, which are neither a control firing nor a
failure of anything.

**Chose:** three tones, resolved to tokens in one exported map (`FEDERATION_TONE_COLOR`):
`blocked` → `C.amber` (a fail-closed control refused it, and that is the control working — the
two 409s), `input` → `C.blue` (nothing was attempted; the caller's input or the console's own
stale list is what needs fixing — the 404 and the 400), `failed` → `C.red` (something went wrong
or is unknown — everything else). Blue for `input` because red would say a security-relevant
failure occurred when the request never left the validation step, and amber would borrow the
visual language this phase just reserved for "a control fired", diluting the one distinction the
plan actually mandates. Blue is also already this codebase's informational token
(`eventColor`'s `handshake`/`trust` prefix, `boundaryColor`'s `intra_org`).

**Alternatives:** Two tones, folding the 404/400 into amber (rejected — amber would then mean
both "a control refused you" and "you typed the wrong thing", and an operator learning to read
amber as the interesting case is the whole point). Two tones, folding them into red (rejected —
the status quo this phase removes: a typo in the DID field rendered as a red alert). A fourth
tone just for the 404 (rejected — no behavioural difference from the 400 to justify it; both
mean nothing was attempted).

**Blast radius if wrong:** One entry in `FEDERATION_TONE_COLOR`, plus the two component cases
asserting `C.blue` on the 404/400 headlines. No structural change — `tone` and `color` are
already separate fields, so a re-token is a one-line edit.

**Status:** UNCONFIRMED

## There are five handshake error-body shapes, plus a non-HTTP outcome, none in the plan

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 5's Context finding enumerates **three** error-body shapes a repo-wide typed
error will meet — FastAPI's `{"detail": "<string>"}`, the proxy's
`{error, target, upstream_status}`, and playground's `{"error": {"code", "message"}}` — and the
classifier is specified as a function of `{status, detail}`, i.e. always of a response.

**Chose:** handle three more cases the empirical pass (and a subsequent verification round) turned
up, and test all of them. (a) **FastAPI's `detail` is a JSON *array* for a request-validation
failure**, not a string — confirmed by driving the real router: `POST` with no `peer_did` returns
422 with `{"detail":[{"type":"missing","loc":["body","peer_did"],…}]}`. This is the same
type-collision hazard the plan flags for the key `error`, one level down and on the key the plan
treats as the reliable one, so `parseFederationErrorBody` only accepts `detail` when `typeof` is
`string` and the 422 degrades to the raw render. Reachable in principle rather than through
today's form, which always sends the field — but a shape that renders `[object Object]` is worth
one `typeof`. (b) **An error that never carried a status at all** — `client.ts`'s own 30s timeout
guard, a React Query abort, or a transport failure before the BFF route ran — is not an `ApiError`
and has no status to classify. It gets its own `no_response` outcome whose copy says the
handshake's outcome is *unknown and may still be in flight*, rather than being swept into
`unclassified` alongside real responses. Playground's own httpx timeout is also 30s
(`hosted.py:164`), so a console timeout racing a still-running handshake is a live possibility,
not a theoretical one. (c) **A fifth body shape, from a proxy layer the plan does not name**:
`src/proxy.ts` (the Next 16 root middleware, matcher `/api/cp/:path*` and
`/api/playground/:path*`) rejects a cross-site mutation with
`{error: 'Cross-site request rejected', code: 'csrf_blocked'}` at **403** — before the request
ever reaches `src/lib/api/proxy.ts`'s BFF route. Its `error` field is a string, so
`parseFederationErrorBody` reads it as `proxyError` exactly like shape 2 above — they share a
*discriminator*, not an origin — but the classifier's two proxy branches are gated on status
**and** shape (504/502 only, matching shape 2's own `makeError` call sites), so a 403 never
matches either and correctly falls through to `unclassified` with the raw body shown. That
fall-through was already correct by construction (the both-conditions guard already in place for
shapes 2/3), not by luck of an untested path — it is now pinned by a dedicated 403 test in
`federation-errors.test.ts` instead of resting on the guard conditions alone.

**Alternatives:** Trust the three-shape finding and let a 422 render `[object Object]` (rejected
— an explicit acceptance criterion forbids that string in any banner). Treat a non-`ApiError` as
`unclassified` (rejected — `unclassified` says "a response arrived that I cannot read", which is
a different and less honest claim than "no response arrived"). Report it as a failure (rejected —
the handshake may have succeeded upstream; claiming it failed is an overclaim in the opposite
direction). Leave the 403 CSRF shape untested on the strength of the existing guard conditions
(rejected — "it happens to degrade correctly today" and "a test pins that it degrades correctly"
are different claims, and only the latter survives a future refactor of the proxy guards).

**Blast radius if wrong:** Two branches in `federation-errors.ts` and one enum member for (a) and
(b); nil for (c), which added a test rather than a code path — the CSRF shape already flowed
through the existing string/status guards untouched. Removing `no_response` makes those errors
`unclassified`; removing the `typeof detail === 'string'` guard reintroduces `[object Object]` on
a 422; deleting the 403 test removes coverage but changes no behaviour.

**Status:** UNCONFIRMED
