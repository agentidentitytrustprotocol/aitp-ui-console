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
