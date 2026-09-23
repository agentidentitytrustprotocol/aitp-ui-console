# Progress: absorb-cp-playground-changes

Plan: `plans/absorb-cp-playground-changes.md` — the **merged** plan, and the only active one.

> Two independent sessions wrote competing plans for the same upstream drift. They were merged
> on 2026-09-23. `plans/upstream-drift-absorption.SUPERSEDED.md` is retained for reference only;
> do not implement from it. This repo map is the merged one — **one active plan's map at a time,
> never appended**, per this repo's existing convention.

## Repo map (written during planning — read this instead of re-scanning)

Every path and line number below was read during a planning pass, re-verified by an independent
review pass (round 2), re-verified a third time during the merge (round 3), and audited a fourth
time by an independent post-merge review (round 4). Corrections are marked inline: **[R2]** from
review round 2, **[R3]** from the merge, **[R4]** from the post-merge review. Line numbers drift
as phases land — **re-grep before editing, never edit by line number alone.**

> **Round 3 overturned three claims**, two of them load-bearing on Phase 1. The `aitp-rs` block
> below is the one that changed most: `UnknownField` is in `0.12.0` **but cannot reach this
> console**, and two of Phase 1's three proposed fixture tests are **not constructible from this
> repo**. See the plan's `## Plan review — merge` section for the full list.
>
> **Round 4 overturned six more, three of them load-bearing.** In short: **npm latest is
> `0.13.0`, not `0.12.0`**; the **`aitp-v0.10.0` git tag is not the npm `0.10.0` release**
> (Node binding `0.5.0` at that tag) so every "verified at the tag" claim about the installed
> SDK was anchored to the wrong tree (the conclusions survive, re-anchored to `c7a7159`); the
> **Tier-2 fixture generator the merge named (`bindings/aitp-py`) cannot build either fixture**;
> **`revocation.verify_failed`'s cause set was wrong** and Phase 3 as written would have shipped
> two fresh overclaims; **Phase 2's `--no-ignore` acceptance grep could never fail**; and
> **`verify_manifest`'s own rustdoc contradicts the check order Phase 2 rests on**. See the
> plan's `## Plan review — round 4 (post-merge)` section.

### Prerequisites and environment hazards

- **`node_modules/` is absent in this checkout.** `npm ci` is a hard gate for every phase.
  `AGENTS.md`'s instruction to read `node_modules/next/dist/docs/` is only followable afterward.
  `package.json:6` requires Node `>=22.13.0`.
- **`plans/` is gitignored** (`.gitignore:15`, alongside `temp/` and `CLAUDE.md`);
  `git ls-files plans/` is empty. **[R3]** Two consequences:
  1. **The default `grep` here respects `.gitignore`**, so a recursive `grep -rn <pattern> .`
     silently skips `plans/`. Any acceptance criterion phrased as a repo-wide grep must **name
     its paths explicitly**. **[R4] Do NOT use `--no-ignore`** — the fix R3 prescribed does not
     work here: where `grep` is **ugrep 7.8.4** it **silently matches nothing** (so a
     "returns zero hits" criterion passes on an untouched checkout), and where it is **BSD grep**
     it is rejected outright; both exist in this environment. The working ugrep flag is
     `--no-ignore-files`, but the portable answer is explicit paths.
  2. Plan-file edits never appear in a commit and are **not recoverable from git history**.
     Anything that must survive belongs in `docs/`, a commit message, or `DECISIONS.md`.
- **Coverage ratchet `79/63/70/80`** — `jest.config.js:30-34`. `verification-display.ts` is at
  100% and must stay there.
- `npm run` scripts (`package.json:8-19`): `dev`, `build`, `start`, `analyze`, `typecheck`,
  `lint`, `format`, `format:check`, `test` (jest), `test:watch`,
  `test:integration` (`jest.integration.config.js`).

### Dependency surface (Phase 1)

- `package.json:23` — `"aitp": "npm:@agentidentitytrustprotocol/aitp@>=0.7.0"`, the only declared
  SDK range. Phase 1 raises it to **`^0.12.0`** (decided; see the plan's Open question 2) and adds
  a sibling `//aitp` key immediately above `"dependencies"`, matching CP's position.
- `package-lock.json:4213-4217` — `node_modules/aitp` currently resolves to **`0.10.0`**.
  **[R4] npm latest is `0.13.0`, not `0.12.0`** (`npm view @agentidentitytrustprotocol/aitp
  version` → `0.13.0`; tag `aitp-v0.13.0` dated 2026-09-23). Two consequences: a plain
  `npm install` under the current uncapped range resolves `0.13.0`, so **Phase 1 must edit the
  range before installing**; and `^0.12.0` is a present decision to decline a released minor,
  which costs nothing here (`crates/aitp-tct/src/` and `crates/aitp-manifest/src/` are untouched
  `0.12.0→0.13.0`, and `bindings/aitp-node/src/` is unchanged).
- **Only two SDK symbols are imported anywhere in this repo**, in exactly two files:
  - `src/lib/api/verify-manifest.ts:1` — `import { verifyManifestJson } from 'aitp'`
  - `src/lib/api/verify-revocation.ts:1` — `import { verifyManifestJson, verifyRevocationList } from 'aitp'`

### Verification core

- `src/lib/api/verify-manifest.ts` — `verifyManifestEnvelope(rawText): Verdict`.
  - `:4-16` — the module's own discipline: "Never canonicalizes, never checks a signature by
    hand." **Load-bearing for Phase 1's test design** — it forbids hand-rolling a signed fixture.
  - `:22-23` branches on `typeof code === 'string'` (never pins a specific code — compliant with
    CP's forward-compat rule). `:24-29` classifies a code-less throw as
    `{checked: false, reason: 'sdk_unavailable'}`, **not** a failed verification — this is what
    makes a native-addon load failure degrade honestly.
- `src/lib/api/verify-revocation.ts` — `codeOf` (`:6-9`, same opaque-string discipline),
  `verifyAgainst` (`:11-22`), `resolveSelfConsistentIssuer` (`:34-50`),
  `verifyRevocationEnvelope` (`:66-79`). Two tiers: `'pinned'` when `serverConfig.cpAid` is set,
  `'self-consistent'` otherwise.
- `src/lib/verification-display.ts` — **the render contract; Phase 2 owns this whole file.**
  - `MANIFEST_UNASSESSED_CODES` at `:27` = `{version_unknown, malformed}`;
    `REVOCATION_UNASSESSED_CODES` at `:90` = the same. Pre-signature codes → amber, never red or
    green. **Both are module-private `const`, NOT exported** [R2] — Phase 2 exports
    `isUnassessedManifestCode` / `isUnassessedRevocationCode` **predicates** (not the sets) so
    Phase 3 reuses the *rule*, not a copy of the list. [R3: moved here from Phase 3.]
  - Comment block `:13-27` — states the module's own anti-overclaim standard at `:16-18`, and
    calls `aid_mismatch` "dead code" at `:22-26`. Phase 2 makes that precise, not reversed.
  - `manifestVerdictBadge` `:40-74` (5 branches). **`:62-68` is the generic red catch-all**
    `· VERIFICATION FAILED (${verdict.code})` — where `pop_failed` and
    `identity_hint_malformed` land today, in the **same bucket as `signature_invalid`**.
    **[R3]** They are *not* bucketed with the amber unassessed codes; a paraphrase claiming
    otherwise was wrong. The defect is conflation with a *signature failure*.
  - `revocationVerdictBadge` `:106-148` (7 branches).
  - **`:140-146`** — the `no_trusted_issuer` + `manifestCode` branch, whose `:145` return string
    ends `"(aitp-control-plane defect)"`. Phase 2's Part B.
- `src/lib/types/cp.ts:124-138,169-185` — `Verdict`, `RevocationVerdict`, `RevocationTier`. Three
  states, never a boolean. `verdict.code` is `string`, not a union (`:137`); `tsconfig.json:11`
  sets `strict` but **not** `noUncheckedIndexedAccess`, so a `Record` lookup types as `string`
  while returning `undefined` — membership-test it.
- `src/lib/colors.ts:4-29` — the `C` token map (`green`, `amber`, `red`, `blue`, `purple`, `teal`,
  `tealBright`, `text`, `textDim`, `textMuted`, `bg3`).
  - `eventColor` `:31-39` — prefix-matched over
    `agent`/`handshake`/`trust`/`capability`/`step`/`tct`/`revoc`/`run`/`llm`. **No `delegation`
    or `manifest` prefix**, so those fall to `C.textDim`. **[R3]** Its only consumers are
    `monitor/event-ticker.tsx:135`, `monitor/event-row.tsx:17` and `audit/audit-table.tsx:69` —
    the **CP event feed**, disjoint from the run timeline's `event-cards.tsx`. **[R4]** There is
    a fourth consumer, `src/lib/colors.test.ts:1,16`, but it is that function's own table test,
    not a rendering surface — the disjointness conclusion is unaffected. So Phase 3's cards
    and Phase 6's `CpEventType` additions change no `eventColor` output. Pre-existing cosmetic
    gap; **out of scope**.

### Proxy layer

- `src/lib/api/proxy.ts`:
  - `runProxy` `:75-112` — **forwards upstream status and body verbatim** (`:91-101`).
    **[R4]** Earlier rounds said "for non-2xx"; `:91-101` has **no status branch at all** — it
    forwards *every* response, which is stronger. The status-conditional pass-through is in
    `proxyGetVerified` at `:177-182`, a different function on different routes.
    Load-bearing for Phase 5.
  - `makeError` `:57-65` — proxy-generated errors use a **different body shape**:
    `{error, target, upstream_status}`, not FastAPI's `{detail}`. Returned for 504 timeout
    (`:105`) and 502 unreachable (`:108`). Phase 5's classifier must handle both.
  - `logUpstreamError` `:67-73` — proxy-internal error strings stay server-side by design;
    Phase 5 must not undo that.
  - `serviceHeaders` `:16-21` — upstream API keys never leave the server.
  - `proxyGetVerified` `:160-198`, `spliceVerification` `:135-141`, `fetchUpstreamText`
    `:206-219`, `proxyPost` `:221-229`, `proxySse` `:261-287`.
- `src/lib/api/client.ts` — five generic verb wrappers only (`getJSON` `:42`, `postJSON` `:48`,
  `putJSON` `:61`, `patchJSON` `:74`, `delJSON` `:87`). **No per-resource named helpers** — this
  is why `plans/playground-federation-and-run-label.md:26-29` is accurate as written, not stale.
  - **`failed()` `:14-16` is Phase 5's target**: flattens status + body into
    `Error("<M> <path> failed: <status> — <detail>")`, destroying the structure the proxy
    forwarded. `errorDetail` `:5-12` slices the body to **500 chars**.

### Routes using the verified proxy (3, not 2)

- `src/app/api/cp/well-known/aitp-manifest/route.ts`
- `src/app/api/cp/well-known/aitp-revocation-list/route.ts`
- `src/app/api/cp/registry/agents/[aid]/manifest/route.ts`

Each has a colocated `route.integration.test.ts`. `docs/PROXIES.md:10` still says "the two
manifest routes" — Phase 7 fixes the count.

### Federation (Phase 5)

- `src/components/federation/federation-view.tsx`:
  - `ErrorBanner` `:92-110` — renders `String(error)`; used at `:183` (host), `:303`
    (**handshake — Phase 5's target**), `:381` (invoke), `:477` (stop).
  - `JsonBlock` `:112-133`; success dump at `:331` (keep).
  - `HandshakePanel` `:267-334`, `InvokePanel` `:336-427`, `HostedAgentCard` `:429-522`,
    `FederationView` `:526-577`.
- `src/hooks/use-hosted-agents.ts` — `useHostedAgents` `:20-26`, `useHostAgent` `:28-35`,
  `useStopHostedAgent` `:37+`, plus `useInvokeHosted` / `useResolveAndHandshake`. Imports
  `delJSON, getJSON, postJSON` from `@/lib/api/client` at `:4`.
- BFF routes (all four undocumented in `docs/PROXIES.md`):
  - `src/app/api/playground/hosted-agents/route.ts`
  - `src/app/api/playground/hosted-agents/[id]/route.ts`
  - `src/app/api/playground/hosted-agents/[id]/invoke/route.ts`
  - `src/app/api/playground/hosted-agents/[id]/resolve-and-handshake/route.ts` — 10 lines,
    `proxyPost('playground', '/hosted-agents/{id}/resolve-and-handshake', req)`.

### Run events (Phases 3 and 4)

- `src/lib/types/playground.ts:128-148` — `RunEvent`. **Missing** `cause`, `source_url`, `detail`,
  `reason`, `serves`, `fail_mode`, and (**[R3]**, for `delegation.redeemed`) `delegatee_aid`,
  `role`, `peer_aid`, `peer_port`, `tct`. **Already has** `error?: string` `:143`,
  `grants?: string[]` `:140`, `jti?: string` `:144`, `port?: number` `:135`. No `RunEvent` **field**
  named `cause` exists. **[R4]** The bare identifier *does* occur in `src/` —
  `verification-display.ts:141,145` (a local) and two test titles — so `grep -rn cause src/` is
  not the emptiness check earlier rounds implied.
- `src/components/runs/event-cards.tsx`:
  - `formatOffset` `:20-24` — **treats `evt.ts` as milliseconds since run start** (Phase 4);
    single call site at `:27`, receiving the raw `evt.ts`.
  - `EventCard` `:26-200`: **14 named cases at `:30-189`** — `run.started`, `agent.spawning`,
    `agent.ready`, `trust.peers_resolved`, `trust.establishing`, `trust.established`,
    `step.started`, `step.probing_no_trust`, `step.access_denied`, `llm.started`, `llm.complete`,
    `step.complete`, `run.complete`, `run.failed`. **`default:` at `:191-198`** (bare grey
    monospace type string). **[R3] There is no `delegation.*` case at all**, so all five Phase 3
    events *plus* `delegation.issued` and `delegation.redeeming` land there today.
  - `:175` — `Total elapsed: {(evt.ts / 1000).toFixed(1)}s`.
  - `Line` `:202-231`, `TrustFlowCard` `:233-307`, `StepOutputCard` `:309-386`.
- `src/components/runs/run-summary.tsx:12` —
  `duration = events.length > 0 ? events[events.length - 1].ts / 1000 : 0` (Phase 4). The
  `events.length > 0` guard already exists; keep it.
- `src/components/runs/run-detail.tsx:43-51` — `mergeRunEvents`: `if (!active && queryEvents)
  return queryEvents; if (liveEvents.length > 0) return liveEvents; return queryEvents ?? []`.
  So it returns the **live SSE buffer** while active, the **persisted `run.data.events`** once
  terminal (`useMemo` `:62-65`). [R2] Phase 4's base timestamp must survive this swap as well as
  buffer eviction — hold it in a ref and **only ever lower it**
  (`Math.min(base, events[0].ts)`), or the swap drives every offset negative.
- `src/components/runs/run-list.tsx:13-17` — **[R4]** `formatCreatedAt` (the merge cited `:13-15`) already normalizes epoch with
  `ts < 1e12 ? ts * 1000 : ts`. Correct for `created_at`; **do not copy for offsets.**
- `src/components/runs/run-timeline.tsx:100` — maps events, key `${evt.type}-${evt.ts}-${i}`.
- `src/hooks/use-run-events.ts` — `maxBuffer = 500` (**[R4]** the destructured default at `:13`,
  not inside `:18-22`, which is the append + front-drop slice); drops from the **front**
  (`:18-22`); handles `stream.end` / `run.complete` / `run.failed` at `:27-36` (**[R4]** the `if`
  starts at `:27`). Consumes
  `/api/playground/runs/{id}/events` via `useSse`.
- `src/components/runs/run-narrate.tsx` — a `<pre>` of server-authored prose from
  `/runs/:id/narrate`. **Not a gap; add no narration UI.**
- `src/components/config/metrics-panel.tsx:38` — generic `Object.entries` render.
  **[R2] Nothing new surfaces here** — playground has no counter for three of the five Phase 3
  events. Confirm, do not edit, and do not cite it as observability coverage.

### CP event feed (Phase 6)

- `src/lib/types/cp.ts:271-302` — the `CpEventType` union. Carries `delegation.issued` and
  `delegation.revoked` (`:283-284`); **missing** `delegation.rejected` and
  `delegation.redeemed`. `grep -rn "CpEventType" src/ docs/ README.md` returns **exactly one
  hit — the definition itself.** Nothing imports it.
- `src/lib/types/cp.ts:34,306` — `AuditEvent.type` and `CpEvent.type`, both `string`
  passthroughs. So the two missing literals already reach `/audit` and the Monitor ticker today,
  untyped.
- `src/app/audit/page.tsx:109-116` — the event-type filter is a free-text `<input>`; its only
  enum-ish content is a `placeholder`. **Must stay free-text** (CP accepts arbitrary type
  strings).
- **This is a different surface from Phase 3.** Phase 3 types the same two strings as playground
  `RunEvent`s in `src/lib/types/playground.ts` and renders timeline cards; Phase 6 types them as
  CP audit-feed names in `src/lib/types/cp.ts`. Neither covers the other.

### RFC copy (Phase 6)

- `grep -rn "RFC-AITP" src/ docs/ README.md` returns **exactly two hits**:
  - `src/components/config/cp-identity.tsx:127` — `RFC-AITP-0008 compliant · empty list is a
    meaningful assertion`, a `fontSize: 10` mono caption `div`. **Asserts compliance nothing here
    checks.**
  - `src/components/trust/revocation.tsx:218` — `An empty revocation list is a meaningful
    assertion under RFC-AITP-0008.`, an `EmptyState` `description` prop. Cites rather than
    claims; only the status qualifier is missing.
- **[R3] No conformance suite exists in this repo.**
  `grep -rni "conformance" src/ docs/ package.json README.md` returns exactly one hit, and it is
  a *comment* at `verification-display.ts:24` referring to the *spec's* suite.

### Tests

- `src/test/` — `bff-routes.integration.test.ts` (CI-safe, mocked upstream),
  `proxies.integration.test.ts` (live-gated), `cp-mutations.integration.test.ts`,
  `scenario-run.integration.test.ts`, `integration-utils.ts`, `setup.ts`,
  `setup-integration.ts`, `test-utils.tsx` (`renderWithClient`), `lucide-stub.tsx`,
  `recharts-stub.tsx`, `polyfills.ts`.
- `src/lib/verification-display.test.ts` — table-style; `:65` is the "never says verified"
  **absence assertion** pattern every new copy test should follow. Currently asserts
  `signature_invalid` → "VERIFICATION FAILED" (lines ~37-44); **Phase 2 replaces that case.**
- **Phase 2's four pinned literals — all four break in Phase 2:**
  - `src/components/config/cp-identity.test.tsx:105` —
    `getByText('· VERIFICATION FAILED (signature_invalid)')`
  - `src/components/registry/agent-detail.test.tsx:123` —
    `provenanceNode('· VERIFICATION FAILED (signature_invalid)')`
  - `src/components/config/cp-identity.test.tsx:203` — the full `(aitp-control-plane defect)`
    string via `findByText`; enclosing `it` at `:190` is "names the upstream cause…" → misnomer
  - `src/components/trust/revocation.test.tsx:145` — same full literal; misnomer at `:139`
  - Plus `cp-identity.test.tsx:187` — a `queryByText(/SIGNATURE INVALID/)` absence guard that
    **weakens quietly rather than breaking** [R2]; re-scope it in the same commit.
- `src/components/runs/event-cards.test.tsx` — `evt()` helper at `:8-10` defaults `ts: 1_500`
  (inherited by **every** test in the file); offset table `:14-24`; `run.complete` at `:179`
  uses `5_000`; `:195` asserts `+1.5s` inside the *unknown-type* regression case;
  `step.complete` at `:200` uses `2_000`. **All millisecond-shaped — this is what hides the
  Phase 4 bug**, and rebasing them is file-wide churn.
- `src/components/runs/agent-status-grid.test.tsx:15-38` — same millisecond-shaped values, but
  **out of scope for Phase 4** [R2]: `agent-status-grid.tsx` never reads `evt.ts`
  (`deriveAgents` at `:113` keys off `type`/`agent_id` only). Leave it alone.
- `src/test/bff-routes.integration.test.ts` — **all four `hosted-agents/*` routes already have
  cases** (`:234, 250, 260, 274, 290`; shared mock upstream `:95-107`) [R2]. All are 2xx-forward
  assertions; **no non-2xx case exists**, and `GET /hosted-agents/[id]` has no case at all.
  The two `aitp`-signed cases: the `it(` titles are at `:313`/`:350` and the `require('aitp')`
  lines at `:314`/`:351` (**[R4]**). **[R4] `GET /api/playground/hosted-agents/[id]` DOES exist**
  (`route.ts:7` exports `GET`) and has no case; only `DELETE` at `:260`. **No hosted-agents case
  exercises a non-2xx upstream** — all five mock arms answer 200 (arms run `:95-109`). The file's
  only non-2xx coverage is the SSE 503 at `:390` and the unreachable-502 describe at `:402-403`.
- `src/components/federation/federation-view.test.tsx` — **does not exist** (confirmed;
  `src/components/federation/` holds only `federation-view.tsx`). Phase 5 creates it.
- `src/lib/api/verify-manifest.test.ts` / `verify-revocation.test.ts` — **do not exist**
  (confirmed). `src/lib/api/` holds `client.ts`, `client.test.ts`, `proxy.ts`, `proxy.test.ts`,
  `verify-manifest.ts`, `verify-revocation.ts`. Do not create them.
- `src/lib/colors.test.ts` — `eventColor` table test at `:3-16`.
- The four SDK-exercising integration suites that are Phase 1's **Tier 0** evidence:
  `src/app/api/cp/well-known/aitp-manifest/route.integration.test.ts`,
  `.../aitp-revocation-list/route.integration.test.ts` (six-case tier matrix),
  `.../registry/agents/[aid]/manifest/route.integration.test.ts`, and the two `aitp`-signed
  cases in `bff-routes.integration.test.ts`. They **sign and verify with the same SDK**, so they
  prove no regression and **cannot** prove what the bump fixes. Say exactly that.
- Conventions: mock `@/lib/api/client`, never global `fetch`; one `it` per rendered state;
  assert color token **and** literal text; in `*.integration.test.ts` use `require('aitp')`
  **inside the test body**, never a top-level ESM import.

### Docs (Phase 7)

- `docs/FEATURES.md` — headings at `:1` (title), `:30` Dashboard, `:47` Scenarios, `:82` Runs
  (`:110` "Live timeline behaviour", `:129` "When the CP isn't wired up"), `:137` Monitor,
  `:160` Registry (`:172`), `:185` Trust (`:203`), `:211` Audit, `:229` Config, `:260`
  Cross-cutting (`:262` SSE, `:279` URLs, `:287` primitives). **Zero mentions of
  federation/hosted-agents** (grepped). New section goes after Trust. The Config → CP identity
  bullet gains Phase 2's post-signature state.
- `docs/PROXIES.md`:
  - `:10` — "the two manifest routes" → **three** routes use `proxyGetVerified`.
  - `:34-53` — playground route table; **all four `hosted-agents/*` routes missing**. `:53` is
    the current last row (SSE `/runs/[id]/events`).
  - `:73` and `:92` carry `(verifying — see note above)`; **`:93`
    (`well-known/aitp-revocation-list`) does not** — add it.
  - `:95-124` — the "Adding a new proxy" convention checklist (**[R4]** heading `:95`, step 1 at
    `:97`; the merge's `:115-124` is only steps 4a-6).
- `docs/ARCHITECTURE.md` — **[R3] already correct on both counts an earlier draft flagged.**
  `:68-69` reads "The three routes serving CP-signed artifacts"; `:83-86` describes the
  revocation route's two tiers accurately; `:90-97` covers the `src/proxy.ts` CSRF gate (**[R4]** the merge cited `:90-95`). And
  **`:81-82`'s "local, not tracked in this repo" about `plans/cp-signed-artifact-verification.md`
  is TRUE** — `plans/` is gitignored. Round 2 flagged it as stale without checking;
  **do not "fix" it.** The only genuine gap is that federation is absent here too.
  `docs/CONVENTIONS.md` — **still not audited.**
- `plans/cp-signed-artifact-verification.md` — Phase 2's doc target, **two sites**:
  - `:1357` — a verdict-table row (row 7) quoting the full `(aitp-control-plane defect)`
    literal. **[R3] Invisible to a default recursive grep** because `plans/` is gitignored.
  - `:1636-1650` — "Cross-repo follow-ups" item 1, still reading as an open filed issue. Its
    body at `:1645-1647` cites `cp-agent.ts:35-44` and `:52-55`, **both now stale** (see the CP
    block below). Needs a RESOLVED marker *and* corrected citations.
  - `:1587-1609` — Criterion 8 **already recorded closed** (2026-08-29), naming CP PR #74.
    (**[R4]** the merge's `:1587-1605` is short at the end; follow-up item 1 runs `:1638-1654`
    under the heading at `:1636`.)
    Cross-reference it so the two do not read as contradicting.
  - **[R3] The literal occurs 4 times repo-wide, not 5** — **[R4] it occurs 5 times in
    source-or-reference files, plus 2 generated.** R2 said 5 and named the wrong five; R3 said 4
    and missed one. The real list: `verification-display.ts:145`, `cp-identity.test.tsx:203`,
    `revocation.test.tsx:145`, `plans/cp-signed-artifact-verification.md:1357`, and
    **`plans/upstream-drift-absorption.SUPERSEDED.md:76`** (reference-only — **do not edit**,
    just exclude it from the criterion), plus 2 generated `coverage/lcov-report/**` hits,
    and however many `PROGRESS.md` and the plan file accumulate discussing it by name (both are
    excluded by the criterion, so the number does not matter). The `:1636`-heading follow-up entry is an *edit site*, not an occurrence.
- `plans/playground-federation-and-run-label.md:26-29` — **accurate as written**; the research
  claim that it is stale was wrong. Optional clarifying parenthetical only.
- `DECISIONS.md` — all entries RESOLVED. **Leave untouched**; `/implement` and `/reconcile`
  append below.
- `ASSUMPTIONS.md` — **repointed at the merged plan on 2026-09-23.** It previously named
  `plans/upstream-drift-absorption.md` and cited that plan's "seven already decided during
  planning." Phase 7 step 8 verifies it still reads correctly after `/implement` logs into it.
- `plans/upstream-drift-absorption.SUPERSEDED.md` — the retired competing plan. Kept for
  reference; **do not implement from it.** Its unique content (post-signature verdict codes,
  Draft-spec copy, `CpEventType` literals, the `^0.12.0` justification, the measured lockfile
  diff) is folded into Phases 1, 2 and 6 of the merged plan.

### Sibling-repo ground truth (verified — do not re-derive)

**`aitp-control-plane`:**
- `package.json:19` — the `//aitp` documented-floor convention Phase 1 mirrors. States
  `0.5.0`/`0.6.0`/`0.7.0` as real wire floors and `0.11.0`/`0.12.0` as explicitly **not** floors
  for CP. Documents the `^`-on-`0.x` caret trap and names "the bump-aitp workflow" as CP's escape
  from it — **a workflow this repo does not have**, which is the honest cost of Phase 1's caret.
  `aitp` itself is pinned `^0.12.0`.
- `src/lib/identity/cp-agent.ts` — `MANIFEST_TTL_SECS = 86_400` at `:13`,
  `MANIFEST_REBUILD_MARGIN_SECS = 3_600` at `:21`, `initCpIdentity` at **`:37`**,
  `getCpManifestJson` at **`:68`** (rebuild-in-place). Fixed by `4c62641` (PR #74, 2026-08-28)
  and `c74a190` (PR #77, 2026-08-29) — **pre-cutoff**, which is what makes
  `verification-display.ts:145`'s attribution stale. **The `:35-44` / `:52-55` citations in
  `plans/cp-signed-artifact-verification.md:1645-1647` are stale against these.**
- `src/lib/revocation/producer.ts:28-33` — signs an **empty** list when its DB read fails. Known
  limitation; not actionable here; decision recorded as "do not file a cross-repo issue."
- `src/app/api/events/route.ts:75` — unverified caller-supplied `source`. Guardrail only;
  `src/components/audit/audit-table.tsx` has **zero** references to it.
- `src/lib/registry/enrollment.test.ts:26-43` — the forward-compat contract: assert
  `typeof err.code === 'string'`, never pin a value for the unknown-field class.

**`aitp-rs`** — **read the tags, never `CHANGELOG.md`, for release boundaries — and [R4] check
`bindings/aitp-node/package.json` at the tag, because a tag here is not necessarily an npm
release.**
- `CHANGELOG.md` has **no `## [0.12.0]`, `## [0.11.0]` or `## [0.13.0]` header at all** —
  `## [Unreleased]` at `:8` runs to `## [SDK 0.4.1]` at `:645` (14 `## [` headers total). The
  heading carries **zero** release information.
- **[R4] The `aitp-v0.10.0` tag is NOT the npm `0.10.0` release.** At that tag
  `bindings/aitp-node/package.json` is `"0.5.0"` and the tagged commit's subject is
  `chore: release v0.9.0 (#120)`. The binding was five releases out of lockstep until `44eec51`;
  **`c7a7159`** (`chore(release): aitp-node v0.10.0 (lockstep with aitp crate)`, 2026-08-29) is
  the real npm-`0.10.0` tree. Tags and npm agree from `aitp-v0.11.0` onward. Use `c7a7159` for
  any "what does the installed SDK do" question.
- **The two fixes `0.12.0` brings this console (the whole reason the floor moves)** —
  **[R4] re-verified at `c7a7159` and `aitp-v0.11.0`, the right trees:**
  `Manifest` is `#[serde(deny_unknown_fields)]` at `crates/aitp-manifest/src/types.rs:11` at
  `c7a7159`, `v0.11.0`, `v0.12.0` **and** `v0.13.0`.
  - `accepted_signature_algorithms: Option<Vec<String>>` — at `aitp-v0.12.0:types.rs:57`;
    **absent at `c7a7159` and at `aitp-v0.11.0`**. On 0.10.0 an authentic manifest carrying it
    throws `malformed` (a false amber).
  - `extensions` — a bare `ExtensionsMap` with `skip_serializing_if = "ExtensionsMap::is_empty"`
    at **`c7a7159:types.rs:62`** and `aitp-v0.11.0:types.rs:62`; `Option<ExtensionsMap>` at
    `aitp-v0.12.0:types.rs:93`. The fix is `b78e608` (2026-08-30), **not** an ancestor of
    `aitp-v0.11.0`. `builder.rs:332-334` records the consequence verbatim: the old shape
    "silently dropped a wire-present `\"extensions\":{}` from the signing input — a manifest
    signed with that literal shape failed verification." On 0.10.0 that is
    **`signature_invalid` — a RED badge on an authentic artifact.**
  - **[R4] `git diff c7a7159 aitp-v0.12.0 -- bindings/aitp-node/src/{lib,revocation}.rs` is
    empty**, so the byte-identical-entry-point claim holds for the real npm versions.
- **[R3] `UnknownField` / `UNKNOWN_FIELD` does NOT reach this console.** It exists at
  `aitp-v0.12.0` and is absent at `aitp-v0.10.0`/`v0.11.0` (round 2 got that part right), but:
  - its only construction site is `parse_manifest_wire`
    (`crates/aitp-manifest/src/verifier.rs:174,181,185`; variant at `error.rs:50`), and
  - **`parse_manifest_wire` has no caller in `bindings/`** — every reference outside its
    definition at `verifier.rs:168` is a test or `aitp-rs`'s own notes citing the Rust adapter.
    `verify_manifest_json` (`bindings/aitp-node/src/lib.rs:71-88`) calls `serde_json::from_str`
    then `verify_manifest`; `verify_manifest` (`:49-137`) starts at the version check.
  - **And `deny_unknown_fields` is on `Manifest` at line 11 at BOTH tags** — so a stray
    top-level member arrives as `malformed` before *and* after the bump. **Unknown-member
    handling is an invariant across the bump, not a tightening.** Round 2's "present behavior
    change" claim is retracted; Phase 1's `//aitp` comment must record this as a non-change.
- **[R3] Phase 1's fixture tests 1 and 2 are NOT constructible from this repo.**
  `bindings/aitp-node/src/agent.rs`'s `ManifestOpts` (`:36-57`) exposes **neither**
  `accepted_signature_algorithms` **nor** `extensions`, and the builder hard-codes
  `extensions: None` at `:414`. Injecting either into a builder-signed envelope yields an
  *inauthentic* manifest whose signature genuinely fails — such a test would pass on 0.12.0 for
  the wrong reason. See Phase 1's evidence tiers. `nowUnixSecs`
  (`bindings/aitp-node/src/lib.rs:68-70`, documented as "pass a pinned value in tests") is what
  makes a committed external fixture viable without it expiring.
- **[R4] Nor from `bindings/aitp-py` — the generator R3 proposed and flagged unvetted.**
  `bindings/aitp-py/src/agent.rs:118-128`'s `build_manifest` takes
  `display_name, handshake_endpoint, offered_caps, required_caps, ttl_secs, identity_type,
  oidc_issuer, oidc_subject, accepted_trust_anchors` — neither field. A grep for
  `extensions|accepted_signature_algorithms` across `bindings/aitp-py/src/` returns one hit,
  `revocation.rs:149`. **Nor from the Rust builder**: `.extension(k,v)`
  (`crates/aitp-manifest/src/builder.rs:168`) only yields a *non-empty* map, which serializes
  fine even on 0.10.0, and `builder.rs:223-231` states that a literal `"extensions":{}` "is only
  reachable by constructing a `Manifest` directly."
- **[R4] The viable Tier-2 generator is `aitp-verifier-py`** (sibling repo, on disk):
  `_manifest_input(**body_extra)` (`tests/test_unknown_fields.py:363-380`) +
  `mint_input(inp, REFERENCE_CLOCK, keys)` (`aitp_verifier/minter.py:356`) →
  `_sign_manifest` (`:137-153`), which signs `sha256(canonicalize(body minus signature))` — the
  same JCS input as `aitp-rs`'s `ManifestSigningView`, so the result is authentic, not injected.
  `REFERENCE_CLOCK = 1711900000` (`aitp_verifier/timeutil.py:15`), `expires_at = NOW + 86400`.
  Its own suite already mints fixture (a): `test_manifest_optional_fields_are_not_rejected`
  (`:410-424`). KAT keys come from the spec repo's
  `schemas/conformance/known-answer/keypairs.json`.
- **[R4] Free evidence nobody cited — upstream's own regression tests:**
  `crates/aitp-manifest/tests/round_trip.rs:254`
  `extensions_present_but_empty_now_verifies_end_to_end` (doc comment `:242-252` describes the
  whole bug; assertion at `:278-279`) and `:378`
  `parse_manifest_wire_accepts_accepted_signature_algorithms`.
- **[R4] `parse_manifest_wire` has TWO non-test callers, not one** — `aitp-rs-adapter/src/lib.rs:1269`
  and `aitp-transport-http/src/client.rs:376`. Still **none under `bindings/`**, which is the
  load-bearing half. R3 sourced "one" from `aitp-rs/PROGRESS.md:295` rather than a grep.
- **[R4] `verify_manifest`'s own rustdoc (`crates/aitp-manifest/src/verifier.rs:28-44`) lists PoP
  as step 3 and the outer signature as step 4** — the RFC's nominal order, the **reverse** of what
  the code does. The numbered step comments (`:68`, `:101`, `:113`) and the error-construction
  sites (`:96/:99` `SignatureInvalid`, `:105/:108/:111` `PopFailed`, `:117/:122/:129`
  `IdentityHintMalformed`) govern. **Phase 2 rests entirely on this; whoever audits it will read
  the rustdoc first and conclude Phase 2 is wrong unless warned.**
- **[R4] `0.12.0 → 0.13.0` changes nothing this console reaches.** `bindings/aitp-node/src/revocation.rs:18-21`
  binds `aitp_tct::verify_revocation_list`; `git diff aitp-v0.12.0 aitp-v0.13.0 -- crates/`
  leaves `crates/aitp-tct/src/` and `crates/aitp-manifest/src/` untouched (only `aitp-manifest`'s
  *tests*). `30b673b`'s retaxonomy lands in `aitp-transport-http`, which the Node binding does not
  use. So R3's conclusion holds — but R3 argued it from a `--stat` of `bindings/`, the same
  shortcut its own "What did not survive" section condemns.
- `crates/aitp-manifest/src/verifier.rs` — **the check order Phase 2 rests on.**
  `verify_manifest` at `:49`; version `:53`; expiry `:58`; AID→key `:66`; **outer signature
  `:68`** (with the `mh-002` conformance rationale at `:68-75`); PoP `:101`; identity-hint
  `:113`. So `pop_failed` and `identity_hint_malformed` **imply a verified outer signature.**
  `check_identity_type_compatibility` at `:213` — one non-test caller
  (`crates/aitp/src/facade.rs:506`), **not `#[napi]`-exported**.
- `bindings/aitp-node/src/lib.rs` — `manifest_verification_cause` `:45-56`, catch-all
  `_ => "malformed"` at `:54`; `AidMismatch` mapped at `:50`; the documented **8-code** taxonomy
  at `:62-66`. **Only 6 are reachable**: `malformed`, `version_unknown`, `expired`,
  `signature_invalid`, `pop_failed`, `identity_hint_malformed`.
- `crates/aitp-manifest/src/error.rs:18` — `AidMismatch` declared. **No construction site
  anywhere**; every other reference is a binding map (`lib.rs:50`,
  `bindings/aitp-py/src/manifest.rs:49`), a match arm, a comment, or a test
  (`aitp-transport-http/src/server.rs:1461`, `aitp-rs-adapter/src/lib.rs:1299,3572`). The
  existing "dead code" comment in this repo was **right**; it needs precision, not reversal.
- `bindings/aitp-node/src/revocation.rs` — `verification_cause` `:31-38`, catch-all
  `_ => "malformed"` at `:36`; five codes only (`signature_invalid`, `issuer_mismatch`,
  `version_unknown`, `expired`, `malformed`), and `revocationVerdictBadge` already branches on
  every one. **No revocation badge gap. No phase.**
- **The surface is a trap, not a gate:** `index.d.ts` declares both symbols identically (0.10.0
  `:196`/`:291` vs 0.12.0 `:524`/`:542`), and `git diff aitp-v0.10.0 aitp-v0.12.0 --
  bindings/aitp-node/src/lib.rs bindings/aitp-node/src/revocation.rs` is **empty**. Every delta
  above is invisible to both.
- **Lockfile consequences, measured** (not assumed): `aitp@0.10.0` depends on `jose ^6.2.3`;
  `aitp@0.12.0` has **no runtime dependencies at all**, only four native `optionalDependencies`
  (`darwin-arm64`, `darwin-x64`, `linux-arm64-gnu`, `linux-x64-gnu` — so CI's `ubuntu-latest` is
  covered). The lock diff therefore **removes `jose@6.2.10`** and adds nothing. Six nested
  `@tailwindcss/oxide-wasm32-wasi/node_modules/*` entries also appear — npm churn, not SDK
  fallout. `npm audit` unchanged (one pre-existing low `@babel/core` via `ts-jest`). Published
  `engines` is `{node: ">=16"}`.
- `30b673b` (2026-09-23, `fix!` on revocation snapshot codes) **is** genuinely post-0.12.0 and
  does **not** touch the node binding — but it is exactly the class of change an unbounded `>=`
  range would accept unreviewed.
- `63f2223` (0.11.0's pinned-key erratum) touches only `crates/aitp-handshake` + the adapter —
  unreachable from either symbol.

**`agentidentitytrustprotocol` (spec repo):**
- **[R3] All thirteen RFC status lines read directly.** `RFC-AITP-0001` through `-0011` each
  carry `**Status:** Community Standards Track (Draft)`; `-0012` is `Reserved`; `-0013` is
  `Planned`. **Nothing has graduated.**
- `rfcs/RFC-AITP-0008-revocation.md` — `**Version:** 0.2.7-draft`, `**Status:** … (Draft)` at
  `:6`. The empty-list MUST is verbatim at **`:110`** (§1): "Even when an issuing peer has
  revoked nothing, it MUST publish a signed snapshot with an empty `entries` array."
- `rfcs/RFC-AITP-0003-manifest.md` §5 — manifest verification steps; nominally orders PoP
  (step 4) before signature (step 5), which the implementation deliberately inverts (see
  `verifier.rs:68-75`). Its Security section requires rejecting a manifest failing *any* step —
  which is why Phase 2 keeps `aidColor` muted even when the signature verified.

**`aitp-playground`:**
- `src/aitp_playground/api/runs.py:347-382` — the SSE endpoint (**[R4]** `return StreamingResponse`
  is at `:378-382`). Frames are
  `data: {json.dumps(evt)}\n\n`, flat keys; backlog replayed first (`:359-363`); closes with
  `{"type":"stream.end"}`. `json.dumps` at `:359-374` does **not** rewrite `ts`.
- `src/aitp_playground/runner/context.py` — `RunEvent` model `:11-38` (**`cause` and
  `source_url` declared at `:37-38`**, comment at `:34-36`, `error` at `:30`,
  **`ts` = `time.time()` at `:13`**); `RunContext.emit` `:50-66` →
  `store.append_event(run_id, event.model_dump())` at `:55` (**no `exclude_none`, so nulls are
  on the wire** — cards must treat `null` and `undefined` identically).
- `src/aitp_playground/api/telemetry.py:13-22` — agent-subprocess events POST here and are
  appended **verbatim, unvalidated**. `logger.info(...body=%s)` at `:18` is the easiest way to
  capture a literal frame for Phase 3's gate.
- `agents/base/telemetry.py:13-29` — `emit_event`; builds
  `{type, run_id, agent_id, ts: time.time(), **fields}` at `:15-21`. **`ts` is at `:19`**
  (`:18` is `agent_id`) — corrected in R2.
- `src/aitp_playground/runner/store.py:41-55` — `append_event`; **no `ts` rewriting.**
- **Emit sites and their actual field names — three different names, not one `cause`:**
  - `manifest.verify_failed` — `agents/base/agent_admin.py:127-132` (`cause`, `source_url`) and
    `src/aitp_playground/runner/engine.py:641-645` (+ `step_id`, `agent_id`).
    **[R4] `_classify_manifest_verify_failure` is DEFINED at `engine.py:32-53`**; `:640` is its
    call site. Its body: `cause = getattr(exc, "code", None)`, else `"malformed"` for a
    `ValueError`, else **`"unknown"`**. `unknown` is not in `MANIFEST_UNASSESSED_CODES`, so it
    would render **red** by default — it is a "could not classify" state and needs an explicit
    **amber** branch, exactly like `sdk_cannot_verify`.
  - `revocation.verify_failed` — `agents/base/revocation_refresh.py:104-106` (`cause`,
    `detail`). **[R4] The cause set every earlier round recorded is WRONG.** `:105` is the
    `emit(...)` inside `_discard` and enumerates nothing. The four real `_discard` sites are:
    `no_expected_issuer` `:116` (**amber** — nothing checked, no CP AID pinned);
    `sdk_cannot_verify` `:122` (**amber** — SDK lacks `verify_revocation_list`);
    `getattr(exc, "code", None) or "signature_invalid"` `:130` (an SDK code, or that literal
    fallback — route through the predicate); `malformed_body` `:151` (**red, POST-signature** —
    the source comment says "A snapshot that VERIFIES (so it was signed by the pinned CP key)
    but whose body is malformed"). There is **no bare `malformed` literal**, so
    `isUnassessedRevocationCode('malformed_body')` → `false` → a card would render a *verified*
    snapshot as a signature failure. **The set is open**, not closed. See the plan's round-4
    Context section and Phase 3.
  - `revocation.degraded_serve` — `agents/base/aitp_server.py:341-346` (`reason`, `serves`,
    `fail_mode`); sampling guard at `:340`. **No `cause`.** `serves` is sampled at the 1st and
    every 100th occurrence — **not a total.** Emitted via `_emit_soon` (`:269-289` — **[R4]** `:285-289` is task bookkeeping), which
    **drops the event when no asyncio loop is running** — so it never appears from a direct
    unit-test call, only from a live server.
  - `delegation.rejected` — `agents/base/aitp_server.py:607-609` (`error` only, a stringified
    exception).
  - **[R3] `delegation.redeemed` — THREE emit sites, THREE different field sets:**
    1. `agents/base/aitp_server.py:616-621` (issuer side) — `delegatee_aid`, `grants`,
       `role: "issuer"`.
    2. `agents/base/agent_admin.py:621-627` (delegatee, happy path) — `tct` (a
       `{token, claims}` **object** from `tct_event()`, `agents/base/tct_claims.py:52-65`, which
       emits `claims: {}` on decode failure "so the event is never dropped"), `peer_aid`,
       `grants` (from an **unvalidated** JWS claim — `Array.isArray` before mapping), `jti`.
    3. `agents/base/agent_admin.py:631` (delegatee, `except (ValueError, KeyError)` fallback) —
       **`peer_port` only.** The peer returned 2xx but its body was not parseable as a TCT, so
       the card **must not claim a fresh TCT or any claims.**
    Playground documents the divergence itself at its own `PROGRESS.md:624`.
- **[R3] Narration and metrics coverage is uneven — do not generalize either way:**
  - `src/aitp_playground/observability/narrator.py` covers `delegation.issued` `:76`,
    `delegation.redeeming` `:78`, `delegation.redeemed` `:80`, `delegation.rejected` `:82`,
    `revocation.list_fetched` `:94`, `revocation.refresh_failed` `:99` (**not**
    `revocation.refused`, which does not exist). **Zero** coverage of `manifest.verify_failed`,
    `revocation.verify_failed`, `revocation.degraded_serve`.
  - `src/aitp_playground/observability/metrics.py:149-159` counts the whole `delegation.*`
    family into `_DELEGATIONS_TOTAL{outcome=…}` (plus `_TCTS_ISSUED_TOTAL` on redeem). **No
    counter** for any of the three trust-failure events.
  - So Phase 3's cards are the **only** surface for those three, and an **additional** surface
    for the delegation pair.
- `src/aitp_playground/errors.py:46-52` — a `PlaygroundError` handler returning
  **`{"error": {"code", "message"}}`** — a third error-body shape alongside FastAPI's
  `{detail}` and this console's proxy `{error, target, upstream_status}`. Note `error` is an
  **object** here and a **string** there: **discriminate on type, not key presence**, or a
  banner renders `[object Object]`.
- `src/aitp_playground/api/hosted.py:110-189` — `resolve_and_handshake`. **7 fail-closed
  outcomes**, all `HTTPException(detail="<f-string>")` → `{"detail": "…"}`, **no `cause`
  field**: 404 `:120`, 400 `:122-125`, 502 `:126-132`, 409 `:143-150` (loopback), 409 `:153-160`
  (origin mismatch), 502 `:174-178` (peer rejected — carries peer status+body), 502 `:179-180`
  (peer unreachable). Docstring `:116-117` says nothing about flattening.
  `AITP_FEDERATION_ALLOW_LOOPBACK` gate at `:140-143` (so the loopback case is unreachable in
  playground's own in-process suite — test it synthetically). **No custom `HTTPException`
  handler is installed**, so FastAPI's default shape is intact for all seven.
- `agents/base/agent_admin.py:110-119` — **where the "flattens back to 502 at the federation
  boundary" statement actually lives**, and where it says the `manifest.verify_failed` event's
  `cause` is the only channel that survives. **The hard honesty constraint on Phase 5's 502
  copy**: a 502 must not claim a manifest verification verdict.

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
| 2 — `verification-display.ts`: post-signature gap, stale CP attribution, shared export | NOT STARTED |
| 3 — Absorb playground's trust-event vocabulary (5 typed cards) | NOT STARTED |
| 4 — Settle the run-event timestamp unit mismatch | NOT STARTED |
| 5 — Federation handshake error fidelity | NOT STARTED |
| 6 — Declarative accuracy: Draft-spec copy and the `CpEventType` catalogue | NOT STARTED |
| 7 — Documentation sweep, `PROGRESS.md` refresh, full regression | NOT STARTED |

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
