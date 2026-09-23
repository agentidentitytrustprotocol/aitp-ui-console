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
