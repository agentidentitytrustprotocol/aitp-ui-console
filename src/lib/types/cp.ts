export type AgentStatus = 'active' | 'expired' | 'deregistered';

export interface Agent {
  aid: string;
  displayName: string;
  handshakeEndpoint: string;
  offeredCaps: string[];
  status: AgentStatus;
  registeredAt: string;
  lastSeenAt: string | null;
  manifestUrl: string;
  agentManifestHint: string | null;
}

export type SessionStatus = 'started' | 'complete' | 'failed';

export interface HandshakeSession {
  sessionId: string;
  aidA: string | null;
  aidB: string | null;
  status: SessionStatus;
  grants: string[];
  runId: string | null;
  boundary: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  type: string;
  ts: string;
  aidA?: string;
  aidB?: string;
  sessionId?: string;
  runId?: string;
  grants?: string[];
  payload: Record<string, unknown>;
  source?: string;
}

export type Range = '1h' | '24h' | '7d' | '30d';

export interface DashboardOverview {
  range: Range;
  kpis: {
    agentsRegistered: number;
    handshakesTotal: number;
    handshakesInRange: number;
    handshakesSuccessInRange: number;
    capabilityInvocationsInRange: number;
    activeSessions: number;
    pendingWebhookDeliveries: number;
  };
  recentSessions: Array<Pick<HandshakeSession,
    'sessionId' | 'aidA' | 'aidB' | 'status' | 'grants' | 'boundary' | 'startedAt' | 'completedAt'>>;
  charts: {
    handshakesByBoundary: Array<{ boundary: string; count: number }>;
    handshakesOverTime: Array<{ bucket: string; count: number }>;
    topCapabilities: Array<{ capability: string; count: number }>;
  };
}

export interface AgentMetrics {
  aid: string;
  displayName: string;
  status: string;
  registeredAt: string;
  lastSeenAt: string | null;
  handshakesAsInitiator: number;
  handshakesAsResponder: number;
  capabilityInvocations: number;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ManifestEnvelope {
  manifest: {
    aid: string;
    display_name?: string;
    handshake_endpoint?: string;
    offered_capabilities?: string[];
    expires_at?: number;
    namespace?: string;
    [key: string]: unknown;
  };
  signature?: string;
  proof_of_possession?: string;
  [key: string]: unknown;
}

export interface RevocationList {
  entries: Array<{ jti: string; revokedAt: string; reason?: string }>;
  issuedAt: string;
  expiresAt: string;
  signedBy?: string;
}
