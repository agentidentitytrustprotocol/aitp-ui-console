/** Shared refetch cadences for TanStack Query hooks.
 *
 *  Grouped by how fast the underlying data actually changes, not by the
 *  endpoint that fetches it. Tuning one cadence here updates every caller.
 *
 *  Adding a new hook? Pick the closest category — don't introduce a new
 *  raw `refetchInterval: 12_345` literal. If nothing fits, add a named
 *  entry and document what makes it different. */
export const REFETCH = {
  /** Cheap liveness probes — health and readiness checks. */
  health: 10_000,
  /** Slow-moving lists: dashboard summaries, registry, capabilities. */
  slow: 30_000,
  /** Identity / well-known documents — change very rarely. */
  veryslow: 60_000,
  /** Operator-visible lists where freshness matters but per-second polling
   *  would hammer the upstream: audit log, run history, metrics. */
  list: 15_000,
  /** Real-time-ish lists: active sessions, playground processes, an open
   *  circuit-breaker panel. */
  realtime: 5_000,
  /** Active run state — polled aggressively while a run is in flight. */
  runActive: 3_000,
} as const;

export type RefetchKey = keyof typeof REFETCH;
