import {
  formatResetsAt,
  quotaBadgeText,
  runLlmQuota,
  type LlmQuotaInfo,
} from './llm-quota';
import type { RunEvent, RunResponse } from './types/playground';

const RESETS = '2026-11-08T00:00:00Z';
const local = (iso: string) => new Date(iso).toLocaleString();

const flagged = {
  llm_quota_exceeded: true,
  llm_quota: {
    reason: 'quota_exceeded',
    quota: 'per_ip_daily',
    limit: 20,
    resets_at: RESETS,
  },
  llm_calls_on_mock: 3,
};

const quotaEvent = (extra: Partial<RunEvent> = {}): RunEvent => ({
  type: 'llm.quota_exceeded',
  ts: 1_790_000_000,
  code: 'quota_exceeded',
  quota: 'global_monthly',
  limit: 5000,
  resets_at: '2026-12-01T00:00:00Z',
  calls: 1,
  capability: 'research.summarize',
  agent_id: 'researcher',
  ...extra,
});

const info = (over: Partial<LlmQuotaInfo> = {}): LlmQuotaInfo => ({
  quota: 'per_ip_daily',
  limit: 20,
  resetsAt: RESETS,
  reason: 'quota_exceeded',
  callsOnMock: 0,
  source: 'run',
  ...over,
});

describe('runLlmQuota sources', () => {
  it('returns null for an older playground that sends none of the fields', () => {
    expect(runLlmQuota({}, [])).toBeNull();
    expect(runLlmQuota(undefined)).toBeNull();
    expect(
      runLlmQuota({ llm_quota_exceeded: false, llm_calls_on_mock: 0 }, []),
    ).toBeNull();
  });

  it('reads the run fields first, over any event', () => {
    expect(runLlmQuota(flagged, [quotaEvent()])).toEqual({
      quota: 'per_ip_daily',
      limit: 20,
      resetsAt: RESETS,
      reason: 'quota_exceeded',
      callsOnMock: 3,
      source: 'run',
    });
  });

  it('a flagged run with no llm_quota reports the quota as unknown', () => {
    expect(runLlmQuota({ llm_quota_exceeded: true, llm_quota: null })).toEqual({
      quota: 'unknown',
      limit: null,
      resetsAt: null,
      reason: null,
      callsOnMock: 0,
      source: 'run',
    });
  });

  it('falls back to the latest run.complete event that carries the fields', () => {
    const older = {
      type: 'run.complete',
      ts: 1,
      ...flagged,
      llm_quota: { quota: 'old' },
    };
    const newer = { type: 'run.complete', ts: 2, ...flagged };
    const q = runLlmQuota({}, [older, newer, quotaEvent()] as RunEvent[]);
    expect(q).toMatchObject({
      quota: 'per_ip_daily',
      source: 'run.complete',
      callsOnMock: 3,
    });
  });

  it('skips a run.complete event without the flag and uses the quota event', () => {
    const q = runLlmQuota({}, [quotaEvent(), { type: 'run.complete', ts: 3 }]);
    expect(q).toEqual({
      quota: 'global_monthly',
      limit: 5000,
      resetsAt: '2026-12-01T00:00:00Z',
      reason: 'quota_exceeded',
      callsOnMock: 1,
      source: 'event',
    });
  });

  it('uses the latest llm.quota_exceeded event', () => {
    const q = runLlmQuota(null, [
      quotaEvent({ quota: 'first' }),
      quotaEvent({ quota: 'second' }),
    ]);
    expect(q?.quota).toBe('second');
  });

  it("prefers the run's running mock-call total over the event's first-denial count", () => {
    expect(
      runLlmQuota({ llm_calls_on_mock: 7 }, [quotaEvent()])?.callsOnMock,
    ).toBe(7);
  });

  it('an event with no detail still flags the run, quota unknown', () => {
    const q = runLlmQuota(null, [
      { type: 'llm.quota_exceeded', ts: 1, code: 'quota_check_failed' },
    ]);
    expect(q).toMatchObject({
      quota: 'unknown',
      resetsAt: null,
      reason: 'quota_check_failed',
      callsOnMock: 0,
    });
  });

  it('keeps the run fields when the SSE buffer dropped the quota event', () => {
    const run = { ...flagged } as Partial<RunResponse>;
    expect(runLlmQuota(run, [{ type: 'llm.complete', ts: 1 }])?.source).toBe(
      'run',
    );
  });
});

describe('quotaBadgeText', () => {
  it('names the local reset time', () => {
    expect(quotaBadgeText(info())).toBe(
      `LLM quota reached: mock responses (resets ${local(RESETS)})`,
    );
  });

  it('appends the mock-call count, singular and plural', () => {
    expect(quotaBadgeText(info({ callsOnMock: 1 }))).toBe(
      `LLM quota reached: mock responses (resets ${local(RESETS)}) · 1 call on mock`,
    );
    expect(quotaBadgeText(info({ callsOnMock: 3 }))).toBe(
      `LLM quota reached: mock responses (resets ${local(RESETS)}) · 3 calls on mock`,
    );
  });

  it.each([
    ['quota_store_unavailable', 'quota store unavailable'],
    ['quota_check_failed', 'quota check failed'],
    ['quota_exceeded', 'reset time not reported'],
    [null, 'reset time not reported'],
  ])('with no reset time, reason %s reads "%s"', (reason, text) => {
    expect(quotaBadgeText(info({ resetsAt: null, reason }))).toBe(
      `LLM quota reached: mock responses (${text})`,
    );
  });

  it('still renders a reset time in the past', () => {
    const past = '2020-01-01T00:00:00Z';
    expect(quotaBadgeText(info({ resetsAt: past }))).toBe(
      `LLM quota reached: mock responses (resets ${local(past)})`,
    );
  });

  it('shows an unparseable reset time as sent', () => {
    expect(formatResetsAt('soon')).toBe('soon');
  });
});
