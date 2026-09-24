export interface ScenarioMeta {
  pack: string;
  scenario: string;
  version: string;
  name: string;
  summary?: string;
  tags?: string[];
}

export interface ScenarioSummary {
  ref: string;
  metadata: ScenarioMeta;
}

export interface PackSummary {
  pack: string;
  scenarios: ScenarioSummary[];
}

export interface JSONSchemaProperty {
  type: string;
  default?: unknown;
  enum?: string[];
  description?: string;
}

export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
}

export interface AgentSpec {
  id: string;
  ref: string;
  port_offset: number;
  org?: string;
  cloud?: string;
}

export interface TrustSpec {
  boundary: 'intra_org' | 'cross_org' | 'cross_cloud';
  discovery: 'static' | 'cp_registry' | 'did_web';
  eager?: boolean;
}

export interface WorkflowStep {
  id: string;
  type?: string;
  description?: string;
  agent?: string;
  capability?: string;
  input_template?: string;
  input_from?: string;
}

/** A named scenario template — a trust/agents/workflow override applied on
 *  top of the base scenario (the backend's docs also call these "variants").
 *  The playground exposes them as a flat `{ name, summary }` list, embedded
 *  top-level in `GET /scenarios/{ref}` and via `GET /scenarios/{ref}/templates`.
 *  There is no separate variant axis: `POST /runs` selects one by `name`. */
export interface ScenarioTemplate {
  name: string;
  summary?: string;
}

export interface ScenarioVersion {
  apiVersion: string;
  kind: string;
  metadata: ScenarioMeta;
  spec: {
    inputs: { schema: JSONSchema };
    agents: AgentSpec[];
    trust: TrustSpec;
    workflow: { steps: WorkflowStep[] };
  };
  /** Templates are attached top-level by the backend (`body["templates"]`),
   *  not under `spec`. */
  templates?: ScenarioTemplate[];
}

/** `GET /scenarios/{ref}/templates` → `{ ref, templates: [...] }`. */
export interface ScenarioTemplateList {
  ref: string;
  templates: ScenarioTemplate[];
}

/** Optional fault-injection knobs the run-create form can send. The
 *  playground may or may not act on them depending on SDK build. */
export interface FaultInjection {
  manifest_404?: string[];
  peer_offline?: string[];
}

export interface RunCreateInput {
  scenario_ref: string;
  inputs: Record<string, unknown>;
  /** Optional human-friendly label sent to `POST /runs` (`RunRequest.run_label`).
   *  Echoed back on `RunCreated`, `RunSummary`, and `RunResponse`. */
  run_label?: string;
  /** Name of a scenario template to merge before running (matched exactly
   *  against `ScenarioTemplate.name`). There is no separate `variant` field —
   *  the backend collapses template/variant into this single name. */
  template?: string;
  fault_injection?: FaultInjection;
}

export interface RunCreated {
  run_id: string;
  status: string;
  scenario_ref: string;
  run_label?: string | null;
}

export interface RunSummary {
  run_id: string;
  status: string | null;
  scenario_ref: string | null;
  run_label?: string | null;
  created_at: number | null;
  event_count: number;
}

export interface RunList {
  runs: RunSummary[];
}

/** One SSE frame from `GET /runs/{id}/events`.
 *
 *  The stream is a **union of two producers**, which is why the field names
 *  below differ per event type rather than sharing one vocabulary:
 *
 *  - Orchestrator events are playground's own pydantic `RunEvent`
 *    (`runner/context.py:11-38`) dumped with `model_dump()` and **no**
 *    `exclude_none` (`:55`), so every field that model declares is present
 *    on every such frame, carrying JSON `null` when unset.
 *  - Agent-subprocess events are the raw body POSTed to
 *    `/internal/telemetry` and appended unvalidated (`api/telemetry.py:13-22`),
 *    so their key set is whatever the emit site passed, wrapped in
 *    `{type, run_id, agent_id, ts, ...fields}` by `agents/base/telemetry.py:15-21`.
 *
 *  Hence `| null` on the trust-event fields below: `null` is a value this wire
 *  really carries, not a modelling flourish, and every consumer must treat it
 *  and `undefined` identically. (The older fields above the trust block keep
 *  their bare-optional typing; widening them is not this change's business.) */
export interface RunEvent {
  type: string;
  ts: number;
  run_id?: string;
  agent_id?: string;
  agent?: string;
  aid?: string;
  port?: number;
  step_id?: string;
  capability?: string;
  initiator?: string;
  target?: string;
  grants?: string[];
  peers?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  jti?: string;
  scenario_ref?: string;
  notes?: string;
  payload?: Record<string, unknown>;

  // --- playground's trust-event vocabulary -------------------------------
  // One comment per field naming the event type that carries it and the emit
  // site it was read from, mirroring how playground's own model documents the
  // same fields at `runner/context.py:34-37`. Every name below was confirmed
  // against a literal captured `/internal/telemetry` frame, not inferred from
  // the `emit()` kwargs — see `event-cards.test.tsx`'s CAPTURED_FRAMES.

  /** `manifest.verify_failed` (`runner/engine.py:641-645`;
   *  `agents/base/agent_admin.py:127-132`) and `revocation.verify_failed`
   *  (`agents/base/revocation_refresh.py:104-106`). Two different producers
   *  with two different vocabularies behind one name — see
   *  `manifestVerifyFailedVerdict` / `revocationVerifyFailedVerdict`. */
  cause?: string | null;
  /** `manifest.verify_failed` — whose manifest failed
   *  (`engine.py:644`, `agent_admin.py:131`). */
  source_url?: string | null;
  /** `revocation.verify_failed` — free text from the discard site
   *  (`revocation_refresh.py:105`). Not on playground's pydantic model; this
   *  field exists only on the agent-POSTed channel. */
  detail?: string | null;
  /** `revocation.degraded_serve` (`agents/base/aitp_server.py:345-355`).
   *  This event carries **no** `cause`. */
  reason?: string | null;
  /** `revocation.degraded_serve` — the ordinal of this degraded serve, not a
   *  total: the event is emitted on the 1st and every 100th occurrence only
   *  (sampling guard, `aitp_server.py:368`). */
  serves?: number | null;
  /** `revocation.degraded_serve` — the configured Axis-B mode
   *  (`aitp_server.py:345`); the event only fires under `soft_fail`. */
  fail_mode?: string | null;
  /** `delegation.redeemed` **site 1** (issuer side,
   *  `agents/base/aitp_server.py:616-621`), alongside `grants` and
   *  `role: "issuer"`. Also on `delegation.issued`
   *  (`agent_admin.py:572-580`). */
  delegatee_aid?: string | null;
  /** `delegation.redeemed` site 1 only (`aitp_server.py:620`), the literal
   *  `"issuer"`. Typed open rather than as that literal: one emit site sets it
   *  today and a second would not be a type error upstream. */
  role?: string | null;
  /** `delegation.redeemed` **site 2** (delegatee happy path,
   *  `agent_admin.py:625`), read from the fresh TCT's `iss` claim via
   *  `claims.get("iss")` — so it can legitimately be `null`. */
  peer_aid?: string | null;
  /** `delegation.redeemed` **site 3** (`agent_admin.py:631`) — the *only*
   *  field that site carries. Distinct from `port` above, which is
   *  `agent.ready`'s own listen port. */
  peer_port?: number | null;
  /** `delegation.redeemed` site 2 (`agent_admin.py:624`) and
   *  `delegation.issued` (`agent_admin.py:579`), both via `tct_event()`
   *  (`agents/base/tct_claims.py:52-65`). An **object**, never a string. Its
   *  `claims` is deliberately `{}` on a decode failure "so the event is never
   *  dropped", so an empty claims map is a legitimate state and not evidence
   *  of anything. */
  tct?: { token: string; claims: Record<string, unknown> } | null;
  /** `delegation.issued` (`agent_admin.py:580`) — the delegated capability
   *  list, named `scope` there rather than `grants`. */
  scope?: string[] | null;
}

export interface RunResponse {
  run_id: string;
  status: string;
  scenario_ref: string;
  run_label?: string | null;
  outputs: Record<string, unknown>;
  events: RunEvent[];
  error: string | null;
  created_at: number | null;
}

export interface RunStatus {
  run_id: string;
  status: string;
}

/** `GET /capabilities` returns:
 *    { sdk_available: bool; version: string|null; features: {...} } */
export interface PlaygroundCapabilities {
  sdk_available: boolean;
  version: string | null;
  features: Record<string, boolean>;
}

/** `GET /agents` returns the supervisor's RunningAgent list. */
export interface PlaygroundAgentProcess {
  run_id: string;
  agent_id: string;
  port: number;
  pid: number | null;
  aid: string;
  manifest_url: string;
  status: string;
  exit_code: number | null;
}

export interface PlaygroundAgentsResponse {
  agents: PlaygroundAgentProcess[];
}

/** `GET /runs/{id}/cp-deliveries` shape. Each delivery is the raw
 *  `cp.webhook.delivered` event dict — render generically. */
export interface RunDeliveriesResponse {
  run_id: string;
  subscribed: boolean;
  webhook?: Record<string, unknown> | null;
  deliveries: Array<Record<string, unknown>>;
  count: number;
}

/** `GET /runs/{id}/narrate` returns plain text (PlainTextResponse on
 *  the backend), not structured JSON. */

// ---------------------------------------------------------------------------
// Federation / hosted agents — the `/hosted-agents/*` cross-org, did:web
// handshake demo (playground `api/hosted.py`). Field names are verbatim from
// the backend request/response models.
// ---------------------------------------------------------------------------

/** A hosted agent process, as returned by every `/hosted-agents` endpoint
 *  (`hosting.hosted.HostedAgent`, a dataclass serialized with `asdict`). */
export interface HostedAgent {
  hosted_id: string;
  agent_id: string;
  ref: string;
  port: number;
  aid: string;
  did: string | null;
  origin: string;
  manifest_url: string;
  handshake_url: string;
  did_document_url: string | null;
}

/** `GET /hosted-agents` → `{ hosted: [...] }` (wrapped, not a bare array). */
export interface HostedAgentList {
  hosted: HostedAgent[];
}

/** `POST /hosted-agents` body (`HostRequest`). Only `ref` is required. */
export interface HostRequest {
  ref: string;
  public_host?: string;
  public_scheme?: string;
  signing_suite?: string;
  inputs?: Record<string, unknown>;
  port?: number;
}

/** `POST /hosted-agents/{id}/resolve-and-handshake` body (`HandshakeRequest`). */
export interface HostHandshakeRequest {
  peer_did: string;
  requested_grants?: string[];
}

/** `POST /hosted-agents/{id}/invoke` body (`InvokeRequest`). */
export interface HostInvokeRequest {
  peer_port: number;
  capability: string;
  peer_base_url?: string;
  payload?: unknown;
}

/** Response of `resolve-and-handshake`. The first five keys are set by the
 *  playground; the rest are spread from the downstream agent's
 *  `/admin/initiate-handshake` result, so treat them as best-effort. */
export interface HostHandshakeResult {
  trust: string;
  peer_did: string;
  resolved_manifest_url: string;
  peer_origin: string;
  peer_base_url: string;
  grants?: string[];
  peer_aid?: string;
  peer_port?: number;
  session_id?: string;
  jti?: string;
  [key: string]: unknown;
}

/** Response of `invoke` → `{ result: <peer capability response> }`. */
export interface HostInvokeResult {
  result: unknown;
}

/** `DELETE /hosted-agents/{id}` → `{ stopped: <hosted_id> }`. */
export interface HostStoppedResult {
  stopped: string;
}
