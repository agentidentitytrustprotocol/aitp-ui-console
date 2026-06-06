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

export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

export interface WebhookCircuitBreaker {
  webhookId: string;
  state: CircuitBreakerState;
  failureCount: number;
  openedAt: string | null;
  halfOpenAt: string | null;
  lastError: string | null;
  threshold?: number;
  cooldownMs?: number;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  circuitBreaker?: WebhookCircuitBreaker;
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

export interface CpReadyz {
  ready: boolean;
  draining: boolean;
  checks: Record<string, 'ok' | 'fail'>;
}

export interface EnrollmentToken {
  token: string;
  jti: string;
  exp: number;
  agentAid?: string;
}

export interface Tct {
  jti: string;
  issuer: string;
  subject: string;
  audience: string;
  capability?: string;
  grants?: string[];
  issuedAt: string;
  expiresAt: string;
  revoked: boolean;
  revokedAt?: string | null;
  payload?: Record<string, unknown>;
}

export interface Delegation {
  jti: string;
  parentJti: string | null;
  subject: string;
  audience: string;
  capability?: string;
  grants?: string[];
  issuedAt: string;
  expiresAt: string;
  revoked: boolean;
  revokedReason?: string | null;
}

export interface DelegationNode extends Delegation {
  children?: DelegationNode[];
  depth?: number;
}

export interface TrustAnchor {
  id: string;
  namespace: string;
  issuerUrl: string;
  displayName?: string | null;
  jwksUri?: string | null;
  jwksCachedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PinnedKey {
  id: string;
  namespace: string;
  aid: string;
  spkiFingerprint: string;
  algorithm?: string;
  publicKeyPem?: string;
  notBefore?: string | null;
  notAfter?: string | null;
  createdAt: string;
}

export interface RevocationEntry {
  jti: string;
  revokedAt: string;
  reason?: string;
  cascadedFrom?: string | null;
}

export type CpEventType =
  | 'agent.registered'
  | 'agent.deregistered'
  | 'agent.expired'
  | 'handshake.started'
  | 'handshake.complete'
  | 'handshake.failed'
  | 'capability.invoked'
  | 'capability.denied'
  | 'tct.issued'
  | 'tct.renewed'
  | 'tct.revoked'
  | 'delegation.issued'
  | 'delegation.revoked'
  | 'oidc.identity.bound'
  | 'oidc.identity.refreshed'
  | 'session.bundle.committed'
  | 'session.bundle.replayed'
  | 'spki.pinned'
  | 'spki.rejected'
  | 'enrollment.token.issued'
  | 'enrollment.token.consumed'
  | 'enrollment.token.expired'
  | 'trust_anchor.added'
  | 'trust_anchor.removed'
  | 'fault.injected.manifest_404'
  | 'fault.injected.peer_offline'
  | 'p256.suite.negotiated'
  | 'webhook.delivered'
  | 'webhook.failed'
  | 'webhook.circuit_breaker.opened'
  | 'webhook.circuit_breaker.closed';

export interface CpEvent {
  id: string;
  type: string;
  ts: string;
  aidA?: string;
  aidB?: string;
  sessionId?: string;
  runId?: string;
  grants?: string[];
  jti?: string;
  payload: Record<string, unknown>;
  source?: string;
}
