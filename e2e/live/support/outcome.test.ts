/** @jest-environment node */
import {
  classifyFailure,
  classifyOutcome,
  classifyQuotaOutcome,
  deriveInputs,
  expectationFor,
  failed,
  llmCapabilitySteps,
} from './outcome';

const LLM_DETAIL = {
  spec: {
    inputs: {
      schema: {
        properties: { topic: { type: 'string', default: 'trust' }, depth: { type: 'integer' } },
        required: ['topic', 'depth', 'notes'],
      },
    },
    workflow: {
      steps: [
        { capability: 'research.web' },
        { capability: 'write.summary' },
        { capability: 'write.summary', expect_status: 403 },
        { capability: 'analyze.data', fault: 'peer_offline' },
        { capability: 'registry.lookup' },
      ],
    },
  },
};

describe('expectations', () => {
  it('derives inputs: defaults kept, required filled by type', () => {
    expect(deriveInputs(LLM_DETAIL.spec.inputs.schema)).toEqual({ topic: 'trust', depth: 1, notes: 'AITP console e2e' });
  });
  it('keeps only LLM steps that should reach the LLM', () => {
    expect(llmCapabilitySteps(LLM_DETAIL)).toEqual(['research.web', 'write.summary']);
  });
  it('applies the designed-outcome override for fault-injection', () => {
    const e = expectationFor('intra-org/fault-injection@1.0.0', LLM_DETAIL);
    expect(e.llm).toBe(false);
    expect(e.statuses).toEqual(['success']);
  });
  it('expects sdk_feature_unavailable when the pack says so', () => {
    const e = expectationFor('x/y@1', { ...LLM_DETAIL, sdk_available: false });
    expect(e).toMatchObject({ statuses: ['failed'], llm: false, failureCode: 'sdk_feature_unavailable' });
  });
});

const realRun = { status: 'success', llm_quota_exceeded: false, llm_calls_on_mock: 0 };
const realEvents = [
  { type: 'llm.started' },
  { type: 'llm.complete', capability: 'research.web', stub: false },
  { type: 'llm.complete', capability: 'write.summary', stub: false },
];

describe('classifyOutcome', () => {
  const exp = expectationFor('intra-org/research-and-write@1.1.0', LLM_DETAIL);

  it('passes a real-LLM success', () => {
    expect(failed(classifyOutcome(realRun, realEvents, exp))).toEqual([]);
  });
  it('fails a stub-only capability, and that is a real failure', () => {
    const ev = [realEvents[0], realEvents[1], { type: 'llm.complete', capability: 'write.summary', stub: true }];
    const bad = failed(classifyOutcome(realRun, ev, exp));
    expect(bad.map((c) => c.name)).toEqual(['real llm.complete for write.summary']);
    expect(classifyFailure({ checks: bad })).toBe('real');
  });
  it('fails a quota fallback, classified environmental (shared IP quota)', () => {
    const run = { status: 'success', llm_quota_exceeded: true, llm_calls_on_mock: 2 };
    const ev = [...realEvents.slice(0, 2), { type: 'llm.quota_exceeded' }, { type: 'llm.complete', capability: 'write.summary', stub: true }];
    const bad = failed(classifyOutcome(run, ev, exp));
    expect(bad.length).toBeGreaterThan(0);
    expect(classifyFailure({ checks: bad })).toBe('environmental');
  });
  it('fails unexpected steps, unmatched probes and a wrong status', () => {
    const ev = [...realEvents, { type: 'step.unexpected_status', step_id: 's1' }, { type: 'step.complete', step_id: 's2', result: { matched: false } }];
    const bad = failed(classifyOutcome({ ...realRun, status: 'failed' }, ev, exp)).map((c) => c.name);
    expect(bad).toEqual(['terminal_status', 'no step.unexpected_status', 'no probe with matched=false']);
  });
  it('a 429 is environmental and a retry pass is flaky', () => {
    expect(classifyFailure({ http429Layer: 'playground' })).toBe('environmental');
    expect(classifyFailure({ passedOnRetry: true })).toBe('flaky');
  });
});

describe('classifyQuotaOutcome', () => {
  it('passes a flagged mock fallback with exactly one event carrying resets_at', () => {
    const run = { status: 'success', llm_quota_exceeded: true, llm_calls_on_mock: 3 };
    const ev = [{ type: 'llm.quota_exceeded', resets_at: '2026-11-09T00:00:00Z', quota: 'per_ip_daily' }];
    expect(failed(classifyQuotaOutcome(run, ev))).toEqual([]);
  });
  it('fails when the run was not flagged', () => {
    expect(failed(classifyQuotaOutcome(realRun, [])).map((c) => c.name)).toEqual([
      'llm_quota_exceeded true',
      'llm_calls_on_mock > 0',
      'single llm.quota_exceeded',
      'llm.quota_exceeded has resets_at',
    ]);
  });
});
