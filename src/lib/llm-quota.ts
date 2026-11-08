import type { LlmQuotaFields, RunEvent } from '@/lib/types/playground';

/** Why a run's LLM calls went to the mock: the quota that first refused a
 *  real call, read from whichever source the console still holds. */
export interface LlmQuotaInfo {
  /** The counter that refused (e.g. `per_ip_daily`), or `"unknown"` when
   *  the run is flagged but carries no detail. */
  quota: string;
  limit: number | null;
  /** RFC 3339 UTC, as the playground sends it; null when not reported. */
  resetsAt: string | null;
  /** `quota_exceeded` | `quota_store_unavailable` | `quota_check_failed`. */
  reason: string | null;
  /** Refused call units that ran on the mock. */
  callsOnMock: number;
  source: 'run' | 'run.complete' | 'event';
}

type QuotaCarrier = Partial<LlmQuotaFields> | null | undefined;

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function fromFields(
  c: Partial<LlmQuotaFields>,
  source: LlmQuotaInfo['source'],
): LlmQuotaInfo {
  const q = c.llm_quota ?? null;
  return {
    quota: str(q?.quota) ?? 'unknown',
    limit: num(q?.limit),
    resetsAt: str(q?.resets_at),
    reason: str(q?.reason),
    callsOnMock: num(c.llm_calls_on_mock) ?? 0,
    source,
  };
}

function latest(
  events: readonly RunEvent[],
  type: string,
  pick: (e: RunEvent) => boolean,
) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === type && pick(e)) return e;
  }
  return undefined;
}

/** The run's LLM-quota state, most durable source first:
 *
 *  1. the run's own fields (`GET /runs`, `/runs/{id}`, `/runs/{id}/status`;
 *     playground `api/runs.py:61-85`), which survive the SSE buffer;
 *  2. the latest `run.complete` event, if it carries those fields;
 *  3. the latest `llm.quota_exceeded` event (`api/quota.py:99-102`), the
 *     only source an older summary or a still-loading run may have.
 *
 *  Null when no source says the run fell back: an older playground without
 *  the fields renders no badge. */
export function runLlmQuota(
  run: QuotaCarrier,
  events: readonly RunEvent[] = [],
): LlmQuotaInfo | null {
  if (run?.llm_quota_exceeded === true) return fromFields(run, 'run');

  const done = latest(
    events,
    'run.complete',
    (e) => (e as Partial<LlmQuotaFields>).llm_quota_exceeded === true,
  );
  if (done) return fromFields(done as Partial<LlmQuotaFields>, 'run.complete');

  const evt = latest(events, 'llm.quota_exceeded', () => true);
  if (evt) {
    return {
      quota: str(evt.quota) ?? 'unknown',
      limit: num(evt.limit),
      resetsAt: str(evt.resets_at),
      reason: str(evt.code),
      // The run's running total beats the event's first-denial count.
      callsOnMock: num(run?.llm_calls_on_mock) || num(evt.calls) || 0,
      source: 'event',
    };
  }
  return null;
}

/** `resetsAt` in the viewer's local time; the raw value if it won't parse. */
export function formatResetsAt(resetsAt: string): string {
  const d = new Date(resetsAt);
  return Number.isNaN(d.getTime()) ? resetsAt : d.toLocaleString();
}

/** Why there is no reset time, keyed on the playground's reason code. */
function noResetText(reason: string | null): string {
  if (reason === 'quota_store_unavailable') return 'quota store unavailable';
  if (reason === 'quota_check_failed') return 'quota check failed';
  return 'reset time not reported';
}

/** The badge's exact text, e.g.
 *  `LLM quota reached: mock responses (resets 11/8/2026, 12:00:00 AM) · 3 calls on mock`.
 *  A `resetsAt` in the past still renders: it is what the run recorded. */
export function quotaBadgeText(q: LlmQuotaInfo): string {
  const why = q.resetsAt
    ? `resets ${formatResetsAt(q.resetsAt)}`
    : noResetText(q.reason);
  const calls =
    q.callsOnMock > 0
      ? ` · ${q.callsOnMock} ${q.callsOnMock === 1 ? 'call' : 'calls'} on mock`
      : '';
  return `LLM quota reached: mock responses (${why})${calls}`;
}
