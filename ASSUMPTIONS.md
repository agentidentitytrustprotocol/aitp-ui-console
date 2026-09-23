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
