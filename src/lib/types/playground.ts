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

export interface ScenarioVariant {
  id: string;
  name?: string;
  description?: string;
  workflow?: { steps: WorkflowStep[] };
  inputs?: Record<string, unknown>;
}

export interface ScenarioTemplate {
  id: string;
  name?: string;
  description?: string;
  variants?: ScenarioVariant[];
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
    templates?: ScenarioTemplate[];
  };
}

export interface FaultInjection {
  manifest_404?: string[];
  peer_offline?: string[];
}

export interface RunCreateInput {
  scenario_ref: string;
  inputs: Record<string, unknown>;
  template?: string;
  variant?: string;
  fault_injection?: FaultInjection;
}

export interface RunCreated {
  run_id: string;
  status: string;
  scenario_ref: string;
}

export interface RunSummary {
  run_id: string;
  status: string | null;
  scenario_ref: string | null;
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
  outputs: Record<string, unknown>;
  events: RunEvent[];
  error: string | null;
  created_at: number | null;
  fault_injection?: FaultInjection;
  template?: string;
  variant?: string;
}

export interface RunStatus {
  run_id: string;
  status: string;
}

export interface NarrateEntry {
  at: number;
  headline: string;
  detail?: string;
  refs?: {
    event_ids?: string[];
    step_id?: string;
  };
}

export interface NarrateResponse {
  run_id: string;
  entries: NarrateEntry[];
}

export interface PlaygroundCapabilities {
  sdk_version: string;
  features: Record<string, boolean>;
}

export interface PlaygroundAgentProcess {
  id: string;
  aid: string | null;
  org?: string | null;
  port?: number | null;
  pid?: number | null;
  started_at?: number | null;
  scenario_ref?: string | null;
  run_id?: string | null;
}

export interface PlaygroundAgentsResponse {
  agents: PlaygroundAgentProcess[];
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  url: string;
  eventType: string;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  signature?: string;
  createdAt: string;
  deliveredAt: string | null;
  responseStatus?: number | null;
  error?: string | null;
}

export interface RunDeliveriesResponse {
  run_id: string;
  deliveries: WebhookDelivery[];
}
