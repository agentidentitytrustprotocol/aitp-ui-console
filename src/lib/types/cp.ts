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

/** Per-webhook circuit breaker snapshot, returned by
 *  `GET /api/cp/webhooks/[id]/circuit-breaker`. Timestamps are millis
 *  since epoch (Date.now()) on the upstream — not ISO strings. */
export interface WebhookCircuitBreaker {
  state: CircuitBreakerState;
  failures: number;
  consecutiveSuccesses: number;
  openedAt: number | null;
  nextProbeAt: number | null;
}

/** The webhook list endpoint does NOT embed the circuit breaker — it
 *  has to be fetched per-id. */
export interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Matches the wire type exactly (`aitp-manifest/src/types.rs`'s
 *  `ManifestEnvelope`, `#[serde(deny_unknown_fields)]` over exactly one
 *  field): `signature` and `proof_of_possession` live *inside* `manifest`,
 *  never as siblings of it. Do not add top-level fields here, and do not
 *  add a top-level index signature — either would silently license an
 *  invented shape the CP rejects with `malformed`. See Finding 3 in
 *  plans/cp-signed-artifact-verification.md. */
export interface ManifestEnvelope {
  manifest: {
    aid: string;
    display_name?: string;
    handshake_endpoint?: string;
    offered_capabilities?: string[];
    expires_at?: number;
    namespace?: string;
    signature?: string;
    proof_of_possession?: unknown;
    [key: string]: unknown;
  };
}

/** The BFF's verification verdict for a CP-signed artifact it checked
 *  server-side, via the SDK, never in the browser. Three states, kept
 *  distinct on purpose:
 *  - `{checked: true, ok: true}` — the SDK's check passed.
 *  - `{checked: true, ok: false, code}` — the SDK checked and rejected it.
 *    `code` is the SDK's own error code (e.g. `signature_invalid`,
 *    `expired`); branch on it, never on `.message` — the SDK states the
 *    code is the contract and the wording is not.
 *  - `{checked: false, reason}` — the check could not run at all (e.g. the
 *    native addon failed to load). Never conflated with `ok: false`: an
 *    unchecked artifact and a rejected one are different facts. */
export type Verdict =
  | { checked: true; ok: true }
  | { checked: true; ok: false; code: string }
  | { checked: false; reason: string };

/** What the BFF actually returns from a verifying-proxy route: the
 *  upstream envelope, byte-for-byte under `manifest`, plus `_verification`
 *  as a sibling namespaced key that can never collide with a spec field. */
export type VerifiedManifestEnvelope = ManifestEnvelope & { _verification: Verdict };

/** The CP serves the revocation list as a signed envelope:
 *  `{ revocation_list: { ... entries }, signature }` — mirroring
 *  `ManifestEnvelope`. The inner list follows RFC-AITP-0008. */
export interface RevocationList {
  revocation_list?: {
    version?: string;
    issuer?: string;
    published_at?: number;
    expires_at?: number;
    entries?: Array<{
      jti: string;
      reason?: string;
      revoked_at?: string | number;
      revokedAt?: string | number;
      [key: string]: unknown;
    }>;
  };
  signature?: string;
  [key: string]: unknown;
}

/** `/api/readyz` returns just { ready } on success, or
 *  { ready: false, reason } / { ready: false, error } on failure. */
export interface CpReadyz {
  ready: boolean;
  reason?: string;
  error?: string;
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

/** Backend uses delegator/delegatee/scope, not subject/audience/grants.
 *  `scope` is always an array of capability strings. */
export interface Delegation {
  jti: string;
  parentJti: string | null;
  delegator: string;
  delegatee: string;
  scope: string[];
  issuedAt: string;
  expiresAt: string | null;
  revoked: boolean;
  revokedAt?: string | null;
  revokedReason?: string | null;
}

export interface DelegationNode extends Delegation {
  children?: DelegationNode[];
  depth?: number;
  /** True when parentJti points to a row not present in the result
   *  window (e.g. older than the query's time horizon). */
  orphan?: boolean;
  /** True when a cycle was detected while walking the chain. */
  cycle?: boolean;
}

export interface TrustAnchor {
  id: string;
  namespace: string;
  issuerUrl: string;
  label: string | null;
  jwksUrl: string | null;
  jwksCachedAt: string | null;
  addedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Composite key is (namespace, aid) — no `id`. */
export interface PinnedKey {
  namespace: string;
  aid: string;
  /** 43-char base64url Ed25519 public key. */
  pubkey: string;
  label: string | null;
  expiresAt: string | null;
  addedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The CP `/api/revocation/entries` route is POST-only; the list is
 *  served by `/.well-known/aitp-revocation-list` via `RevocationList`. */

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
