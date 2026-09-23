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
