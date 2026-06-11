# Features & Flows

What the console actually does, section by section, from an operator's
point of view. This is the console's own surface — for the meaning of the
data it renders, follow the links to the [playground](https://agentidentitytrustprotocol.io/playground) and
[control plane](https://agentidentitytrustprotocol.io/control-plane) docs rather than re-reading it here.

The console owns **none** of this state. It reads the playground
([`aitp-playground`](https://github.com/agentidentitytrustprotocol/aitp-playground)
— scenario definitions, run history, live run events) and the control plane
([`aitp-control-plane`](https://github.com/agentidentitytrustprotocol/aitp-control-plane)
— registry, sessions, audit, trust config, webhooks) and gives a human a
way to drive workflows against them. Every view renders explicit empty,
error, and loading states, so a section degrades to a friendly placeholder
when its backend is down rather than crashing.

| Section | Route(s) | Backend | What you do here |
| --- | --- | --- | --- |
| [Dashboard](#dashboard) | `/dashboard` | CP | Read KPIs and time-series at a glance |
| [Scenarios](#scenarios) | `/scenarios`, `/scenarios/[...ref]` | Playground | Browse packs, inspect a scenario, trigger a run |
| [Runs](#runs) | `/runs`, `/runs/[id]` | Playground (+CP) | Watch a run stream live, inspect its trace |
| [Monitor](#monitor) | `/monitor`, `/monitor/sessions/[id]` | CP | Live event ticker, delegation tree, TCTs |
| [Registry](#registry) | `/registry`, `/registry/[aid]` | CP | View agents, mint enrollment tokens, deregister |
| [Trust](#trust) | `/trust` | CP | Manage trust anchors, pinned keys, revocations |
| [Audit](#audit) | `/audit` | CP | Filter and export the admin audit trail |
| [Config](#config) | `/config` | Both | Health, identity, metrics, webhooks |

---

## Dashboard

A read-only overview backed by the control plane's dashboard aggregates.

- **KPI cards** — agents registered, handshakes in range, success rate,
  capability invocations, active sessions, pending webhook deliveries.
- **Charts** — handshakes over time (line), distribution by trust
  boundary (pie), top capabilities by invocation (bar). Each renders its
  own empty state when there's nothing to plot.
- **Time-range picker** — `1h / 24h / 7d / 30d`, synced to the URL so a
  view is shareable.
- **Auto-refresh picker** — `off / 10s / 30s / 1m`. On top of this, the
  underlying query refetches on a slow cadence by default.

If the control plane is unreachable the whole section collapses to a
single banner pointing the operator at **Config**.

## Scenarios

Browse the playground's scenario catalog and launch runs. Scenario
semantics (packs, workflow steps, boundaries) are defined by the
playground — see [scenarios](https://agentidentitytrustprotocol.io/playground/scenarios).

**List (`/scenarios`)** — a pack tree on the left (grouped by trust
boundary, with per-pack counts) filters a grid of scenario cards on the
right. Each card shows the name, boundary badge, summary, tags, and
version; clicking it opens the detail view.

**Detail (`/scenarios/[...ref]`)** — the scenario's agents and numbered
workflow steps, a **trust explainer** that describes what the scenario's
boundary (intra-org / cross-org / cross-cloud) implies, and the run
trigger form.

### Run-trigger flow

1. Open a scenario's detail page.
2. *(Optional)* Pick a **template**, then a **variant** of that template.
   Templates and variants come from the playground and pre-fill inputs.
3. Fill the **inputs** — the form is generated from the scenario's JSON
   schema, so you get text / number / boolean / enum controls with
   required-field markers automatically.
4. *(Optional)* Expand **Advanced → Fault injection** to deliberately
   break the run for testing: `manifest_404` (force a 404 when a peer's
   AITP manifest is fetched) and `peer_offline` (refuse handshakes from
   an agent), each toggled per agent. A badge shows how many faults are
   armed. The injection contract is the playground's — see
   [aitp-integration](https://agentidentitytrustprotocol.io/playground/aitp-integration).
5. Hit **Run scenario**. The console POSTs the run and navigates straight
   to its detail page, where the live timeline takes over.

A run started with non-empty fault injection is tagged with a
`fault-injected` chip on its detail header for visual triage.

## Runs

Watch scenario executions, live and historical.

**List (`/runs`)** — a table of runs (id, scenario, status, event count,
start time) with a header that calls out how many are in flight. The list
refetches **adaptively**: fast while any run is pending/running, slow once
everything is terminal.

**Detail (`/runs/[id]`)** — a sidebar plus a tabbed main area.

- **Sidebar** — an agent-status grid (which agents took part and their
  state, derived from the event stream), a run summary (status, duration,
  handshake / LLM-call / event counts, established grants), and an error
  card when the run failed.
- **Cancel** — for an active run, a confirm-guarded cancel button in the
  header; the outcome is surfaced as a toast.

The main area has five tabs:

| Tab | Source | Shows |
| --- | --- | --- |
| **Timeline** | Playground SSE | The live event stream (default tab) |
| **Narrate** | Playground | A narrated, human-readable trace of the run |
| **CP audit** | Playground→CP | Audit entries the CP recorded for this run |
| **CP sessions** | Playground→CP | Handshake sessions started by this run |
| **Deliveries** | Playground→CP | Webhook deliveries triggered by run events |

### Live timeline behaviour

The Timeline tab subscribes to the run's SSE stream and renders a typed
card per event. The playground emits the lifecycle (the card renderers
handle each shape):

`run.started` → `agent.spawning` → `agent.ready` → `trust.peers_resolved`
→ `trust.establishing` → `trust.established` (with its granted capability
badges) → `step.started` → `llm.started` / `llm.complete` →
`step.complete` → `run.complete`, plus the unhappy paths
`step.probing_no_trust`, `step.access_denied`, and `run.failed`. Anything
the console doesn't recognise falls back to a generic card rather than
being dropped. The event *shapes* are the playground's contract — see
[aitp-integration](https://agentidentitytrustprotocol.io/playground/aitp-integration).

The view **auto-scrolls** to the newest event unless you've scrolled up,
in which case a **jump-to-latest** control appears; a small indicator
shows whether the stream is *streaming* or *reconnecting*. Once a run is
terminal, the timeline switches from the SSE buffer to the authoritative
event list on the run record, so a reload shows the full, final trace
rather than a partial live capture.

### When the CP isn't wired up

The three CP-backed tabs depend on the playground having a `CP_BASE_URL`.
When it doesn't, those tabs render an explicit **"Control plane not wired
up"** state (telling you to set `CP_BASE_URL` on the playground) rather
than a generic error — distinct from the empty ("no entries for this run")
and error states.

## Monitor

A live window onto the control plane, in three tabs.

- **Events** — a real-time ticker of CP events (registry, handshake,
  audit), newest first, with a rolling client-side buffer (the most recent
  ~200 events) and a free-text filter over type / AID / session. A
  connection pill reflects the stream state: *connected*, *reconnecting*,
  *disconnected*, or **at capacity** (see [Live updates](#live-updates-sse)).
  A side panel lists active sessions; each links to its trace.
- **Delegations** — the delegation tree the console reconstructs in the
  browser from flat CP delegation records (`src/components/monitor/delegation-tree.tsx`).
  Beyond wiring parents to children it enforces three safety properties so
  bad data is visible rather than silently mis-rendered: records whose
  parent is missing are **promoted to roots**, records that would close a
  **cycle** are flagged and bucketed as orphans, and each child is attached
  at most once.
- **TCTs** — observed Trust Credential Tokens. TCT semantics live in the
  [spec](https://agentidentitytrustprotocol.io/spec/tct).

**Session trace (`/monitor/sessions/[id]`)** — the event-by-event trace
for a single handshake session.

## Registry

The control plane's agent registry, made operable.

- **Agent table** — display name, AID, status, boundary, offered
  capabilities, last activity. Filter by status (`all / active / expired /
  deregistered`) and search by name / AID / capability; both are synced to
  the URL. AIDs render through a copy-on-click cell, never raw.
- **Agent detail (`/registry/[aid]`)** — the agent's record and a
  **manifest viewer** for its signed AITP manifest.
- **Deregister** — a confirm-guarded action on an agent.

### Enrollment-token flow

1. Click **New enrollment**.
2. Paste the agent's **signed manifest envelope** (the JSON `{ manifest,
   signature, proof_of_possession }`). The form validates that it parses
   and has a top-level `manifest` before submitting.
3. The console asks the CP to mint a token and shows the result: a
   short-lived, single-use bearer token with a live **expiry countdown**
   and a hidden-by-default reveal/copy control.
4. Hand the token to the agent, which redeems it against the CP to
   register. Token mechanics (HMAC, ~5-minute TTL, JTI single-use) are the
   control plane's — see the [CP API](https://agentidentitytrustprotocol.io/control-plane/api).

## Trust

Three control-plane collections that together describe the system's trust
posture. Each tab is a small CRUD surface.

- **Trust anchors** — OIDC issuers accepted as identity sources for
  enrollment, scoped by namespace. Add / edit / delete, including bulk
  delete via row selection. Namespace is fixed after creation.
- **Pinned keys** — static SPKI key pins per `(namespace, aid)` for
  environments that bypass discovery.
- **Revocation** — add a JTI to the authoritative revocation list, with an
  optional reason.

### Revocation confirm flow

Revoking is a **two-step confirm**: enter a JTI (and optional reason),
then explicitly confirm. It's gated this way because, on the CP side, a
revocation cascades to every delegation chain that contains the JTI and is
itself written to the admin audit log — it is materially destructive. The
cascade rules are the control plane's; see
[revocation](https://agentidentitytrustprotocol.io/spec/revocation) and the [CP data model](https://agentidentitytrustprotocol.io/control-plane/data-model).

## Audit

A filterable, exportable view of the control plane's admin audit trail.

- **Filters** — actor, action, and result limit (`50 / 100 / 250 / 500`),
  all synced to the URL.
- **Rows** — timestamp, event type (colour-coded), actor AIDs, granted
  capabilities, and session/run links. Expanding a row reveals the full
  event payload as a copyable JSON tree.
- **Export** — download the current (filtered) result set as **CSV** or
  **NDJSON**. Column order is stable, and the export reports how many rows
  it wrote (or tells you the filter matched nothing).

## Config

Operational settings and health, split across two columns.

- **Service connections** — live health (and the CP's separate readiness)
  for both upstreams, with the configured URLs shown. A footnote makes the
  credential boundary explicit: URLs come from `PLAYGROUND_URL` / `CP_URL`
  on the server, and API keys never reach the browser.
- **CP identity** — the control plane's own AITP manifest: AID, display
  name, handshake endpoint, capability set, expiry countdown, and
  revocation-list pointer.
- **SDK matrix** — SDK / capability support reported by the playground.
- **Processes & metrics** — playground process list and the metrics
  panels for both services.
- **Webhooks** — list, create, edit, and delete CP webhook subscriptions.
  Each row exposes its **circuit-breaker** state (`closed` / `open` /
  `half-open` with a failure count) and a **reset** action when it's
  tripped. Circuit-breaker semantics are the CP's — see
  [CP events](https://agentidentitytrustprotocol.io/control-plane/events).

---

## Cross-cutting behaviour

### Live updates (SSE)

Two streams drive the live views: the per-run timeline
(`/api/playground/runs/[id]/events`) and the global CP event ticker
(`/api/cp/events/stream`). Both go through one client hook, `useSse`:

- **Auto-reconnect** with exponential backoff after a drop.
- **Page-visibility pausing** — the stream closes when the tab is hidden
  and reopens on focus, so a backgrounded tab costs nothing.
- **Capacity awareness** — the CP caps concurrent listeners and returns a
  503 at the limit. `useSse` probes for this and surfaces a distinct
  **"at capacity"** state (with a longer backoff) instead of a generic
  "reconnecting" spinner. See [PROXIES.md](https://agentidentitytrustprotocol.io/console/proxies#cp-sse-capacity-handling).

There is no WebSocket library — see [ARCHITECTURE.md](https://agentidentitytrustprotocol.io/console/architecture#sse-why-native-eventsource)
for why.

### Shareable URLs

Operator-visible filters, search boxes, and active tabs are synced to the
query string (via `useUrlState` / `useUrlEnum` / `useUrlInt`), so any view
is a deep link and survives reload and back/forward. Dashboard range +
refresh, the Runs and Monitor tabs, Registry search + status, and the
Audit filters all work this way.

### Feedback & primitives

- **Toasts** — mutations (create/cancel/delete/export/revoke/mint)
  confirm or report failure through transient toasts.
- **AIDs** are always shown through a copy-on-click cell, never raw.
- **Times** are shown as live relative timestamps that tick on their own.
- **Connection dots** in the topbar go red when an upstream is down and
  link to Config for troubleshooting.

For the conventions that keep these consistent across the codebase, see
[CONVENTIONS.md](https://agentidentitytrustprotocol.io/console/conventions).
