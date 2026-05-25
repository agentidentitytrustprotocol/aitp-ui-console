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
}

export interface RunStatus {
  run_id: string;
  status: string;
}
