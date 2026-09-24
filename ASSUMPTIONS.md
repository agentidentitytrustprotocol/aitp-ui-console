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

Reconciled 2026-09-23. All 22 entries `/implement` logged across this plan's 7 phases and its
finalization pass were settled by `/reconcile` in one pass — see
`DECISIONS.md`'s "`/reconcile` of `plans/absorb-cp-playground-changes.md`" entry for the full
per-entry disposition (19 confirmed as-is, 2 changed and resolved, both removed from here). One
entry is retained below because it was genuinely **deferred**, not resolved: it names a real
product/design decision no implementation or reconcile pass should make unilaterally, not a bug
or an open technical question.

## Phase 4's "Depends on" premise is false: seven event types render no time at all, and still do

**Plan:** plans/absorb-cp-playground-changes.md

**Assumed:** Phase 4's **Depends on** (plan `:1657-1659`) is the phase's stated reason it needs
to do nothing further about Phase 3's work: "Phase 3's new cards use the existing `formatOffset`
unchanged and therefore inherit whatever this phase settles, introducing no new divergence."

**Chose:** Record that the premise's first clause is **false** — and change nothing on the
strength of it. Measured, not inferred: `EventCard` computes `offset` once and threads it
**only** into the `<Line ts={offset}>` wrapper. Seven `case`s bypass `Line` entirely and render
**no time at all** — `run.failed`, `manifest.verify_failed`, `revocation.verify_failed`,
`revocation.degraded_serve`, `delegation.issued`, `delegation.redeemed` and `delegation.rejected`.
The six trust cards are `Card`-shaped components that receive `evt` only; `baseTs` never reaches
them, so none of them has **ever** called `formatOffset`, before this phase or after it. (Two
near neighbours do, which is what makes the list exact rather than a guess: `delegation.redeeming`
renders an offset through `Line`, and `run.complete` renders both the offset and the total-elapsed
figure.)

So the premise's *conclusion* survives by accident — there is indeed "no new divergence", because
there is no timestamp to diverge — while its reason is wrong. This is **not a regression Phase 4
introduces**: those seven cards rendered no time before this phase and render no time after it,
and no behaviour changed for them in either direction.

Not fixed in Phase 4, for scope reasons (its Files section names five source files and its
acceptance criteria are scoped to `formatOffset`'s single call site and `RunSummary`'s duration;
none of them mentions, or would detect, a card that renders no timestamp). Giving seven cards a
timestamp they never had is a **feature addition**, not a unit fix — it needs a design decision
this plan never took (does a bordered `Card`-shaped trust event carry its offset in the header row
like `run.complete` does, or not at all? the six trust cards were deliberately given a different
visual weight from the `Line` rows in Phase 3), plus a `baseTs` prop on six components and tests
for each.

**Reconciled 2026-09-23 (see `DECISIONS.md`):** re-verified the gap is unchanged after all 7
phases and the finalization pass. Confirmed `docs/FEATURES.md`'s "Live timeline behaviour" section
(added by Phase 7, commit `abc53a8`) already discloses this accurately — no further documentation
action needed. The design decision itself (should these seven event types carry a timestamp, and
in what visual treatment) remains genuinely open and was correctly **not** decided unilaterally by
any implementation or reconcile pass — it is a product/UX call, not a technical one with an
obviously-right answer. Retained here rather than moved to `DECISIONS.md`, since it isn't
resolved — it's deferred, on purpose, pending someone actually wanting the seven event types to
carry a timestamp.

**Alternatives:** Give the seven cards a timestamp now (rejected — a design decision, not a bug
fix, and not this reconcile pass's call to make unilaterally). Silently correct the plan's
"Depends on" sentence (rejected — the premise being wrong is exactly the kind of fact that should
be logged rather than quietly overwritten). Assert the gap in a test so it cannot be forgotten
(rejected — a test pinning "these seven cards render no time" reads as a *decision* that they
should not, which is precisely the claim this entry declines to make either way).

**Blast radius if wrong:** None to code — nothing was changed. The consequence of deferring is
that an operator reading a timeline sees offsets on the `Line` rows and none on the six trust
cards or `run.failed`, exactly as before this phase. If a reviewer decides the timestamps are in
scope after all, the work is additive (one prop, six components) and no part of the existing
`baseTs` threading has to be redone to accommodate it.

**Status:** UNCONFIRMED — DEFERRED (2026-09-23). Evidence that would settle it: a product decision
on whether these seven event types should carry a timestamp and in what visual treatment. Worth a
tracked GitHub issue if the team wants it actioned.
