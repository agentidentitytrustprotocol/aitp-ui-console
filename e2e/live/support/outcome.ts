/** Per-run assertions for the live matrix: a TypeScript port of the
 *  playground's reference tool (`aitp-playground/scripts/console_e2e.py`:
 *  `derive_inputs`, `llm_capability_steps`, `expectation_for`,
 *  `classify_outcome`, `classify_quota_outcome`, `badge_text`), so the
 *  console suite and the playground tool judge a run the same way. */

export type Json = Record<string, unknown>;
export type RunEvent = Json & { type?: string };

export const LLM_CAPABILITY_PREFIXES = ['research.', 'write.', 'analyze.'] as const;
export const SDK_UNAVAILABLE_CODE = 'sdk_feature_unavailable';
export const FILLER_TEXT = 'AITP console e2e';

/** Runs whose designed outcome differs from what the pack implies
 *  (`console_e2e.py` `DESIGNED_OUTCOMES`). */
export const DESIGNED_OUTCOMES: Record<string, { statuses?: string[]; llm?: boolean }> = {
  // Its only capability step is the injected peer_offline fault, so no LLM
  // call ever succeeds; the run itself still ends success.
  'intra-org/fault-injection@1.0.0': { statuses: ['success'], llm: false },
};

export interface Expectation {
  ref: string;
  statuses: string[];
  llm: boolean;
  llmCapabilities: string[];
  failureCode: string | null;
  inputs: Json;
  sdkAvailable: boolean;
  reason: string;
}

export interface Check {
  name: string;
  ok: boolean;
  detail: Json;
}

function obj(v: unknown): Json {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

/** Inputs from a pack's JSON schema: every default; a required property
 *  without one gets filler of its type. */
export function deriveInputs(schema: unknown): Json {
  const s = obj(schema);
  const props = obj(s.properties);
  const out: Json = {};
  for (const [name, spec] of Object.entries(props)) {
    const sp = obj(spec);
    if ('default' in sp) out[name] = sp.default;
  }
  const required = Array.isArray(s.required) ? (s.required as unknown[]) : [];
  for (const name of required) {
    if (typeof name !== 'string' || name in out) continue;
    const typ = obj(props[name]).type ?? 'string';
    const filler: Record<string, unknown> = {
      string: FILLER_TEXT,
      integer: 1,
      number: 1,
      boolean: true,
      array: [],
      object: {},
    };
    out[name] = typeof typ === 'string' && typ in filler ? filler[typ] : FILLER_TEXT;
  }
  return out;
}

/** LLM capabilities a pack expects to succeed: a step naming an LLM
 *  capability with no injected fault and no non-200 `expect_status`. */
export function llmCapabilitySteps(detail: unknown): string[] {
  const steps = obj(obj(obj(detail).spec).workflow).steps;
  if (!Array.isArray(steps)) return [];
  const caps: string[] = [];
  for (const raw of steps) {
    const st = obj(raw);
    const cap = st.capability;
    if (typeof cap !== 'string' || !LLM_CAPABILITY_PREFIXES.some((p) => cap.startsWith(p))) continue;
    if (st.fault) continue;
    if (st.expect_status !== undefined && st.expect_status !== null && st.expect_status !== 200) continue;
    caps.push(cap);
  }
  return caps;
}

export function expectationFor(
  ref: string,
  detail: unknown,
  summary: unknown = {},
  overrides: typeof DESIGNED_OUTCOMES = DESIGNED_OUTCOMES,
): Expectation {
  const d = obj(detail);
  const caps = llmCapabilitySteps(d);
  const sdkFlag = 'sdk_available' in d ? d.sdk_available : obj(summary).sdk_available;
  const sdkAvailable = sdkFlag !== false;
  const exp: Expectation = {
    ref,
    statuses: ['success'],
    llm: caps.length > 0,
    llmCapabilities: caps,
    failureCode: null,
    inputs: deriveInputs(obj(obj(d.spec).inputs).schema),
    sdkAvailable,
    reason: 'derived from pack',
  };
  if (!sdkAvailable) {
    exp.statuses = ['failed'];
    exp.llm = false;
    exp.failureCode = SDK_UNAVAILABLE_CODE;
    exp.reason = 'pack: sdk_available=false, refused with sdk_feature_unavailable';
  }
  const o = overrides[ref];
  if (o) {
    if (o.statuses) {
      exp.statuses = [...o.statuses];
      if (!o.statuses.includes('failed')) exp.failureCode = null;
    }
    if (o.llm !== undefined) exp.llm = o.llm;
    exp.reason = 'allowlist: DESIGNED_OUTCOMES';
  }
  return exp;
}

function probeUnmatched(e: RunEvent): boolean {
  return e.matched === false || obj(e.result).matched === false;
}

function realLlmChecks(events: RunEvent[], capabilities: string[]): Check[] {
  const completes = events.filter((e) => e.type === 'llm.complete');
  const caps: (string | null)[] = capabilities.length > 0 ? [...new Set(capabilities)] : [null];
  return caps.map((cap) => {
    const mine = completes.filter((e) => cap === null || e.capability === cap);
    const real = mine.filter((e) => e.stub === false);
    const detail: Json = {
      capability: cap,
      llm_complete: mine.map((e) => ({
        agent_id: e.agent_id,
        capability: e.capability,
        provider: e.provider,
        model: e.model,
        stub: e.stub,
      })),
    };
    if (real.length === 0) {
      if (completes.some((e) => !('stub' in e))) detail.reason = 'llm.complete carries no stub field (old playground)';
      else if (mine.length === 0) detail.reason = `no llm.complete for ${cap ?? 'any capability'}`;
      else detail.reason = 'every llm.complete for it ran on the stub';
    }
    return { name: `real llm.complete for ${cap ?? 'some capability'}`, ok: real.length > 0, detail };
  });
}

/** The matrix assertions for one finished run. */
export function classifyOutcome(run: Json, rawEvents: unknown[], exp: Expectation): Check[] {
  const events = rawEvents.filter((e): e is RunEvent => !!e && typeof e === 'object');
  const types = events.map((e) => e.type);
  const checks: Check[] = [
    {
      name: 'terminal_status',
      ok: typeof run.status === 'string' && exp.statuses.includes(run.status),
      detail: { status: run.status, expected: exp.statuses, error: run.error },
    },
  ];
  if (exp.failureCode) {
    const codes = events.filter((e) => e.type === 'run.failed').map((e) => e.code);
    checks.push({ name: `run.failed code = ${exp.failureCode}`, ok: codes.includes(exp.failureCode), detail: { codes } });
  }
  const unexpected = events.filter((e) => e.type === 'step.unexpected_status').map((e) => e.step_id);
  checks.push({ name: 'no step.unexpected_status', ok: unexpected.length === 0, detail: { step_ids: unexpected } });
  const unmatched = events.filter(probeUnmatched).map((e) => e.step_id);
  checks.push({ name: 'no probe with matched=false', ok: unmatched.length === 0, detail: { step_ids: unmatched } });
  if (exp.llm) {
    checks.push({ name: 'llm.started present', ok: types.includes('llm.started'), detail: { capabilities: exp.llmCapabilities } });
    checks.push(...realLlmChecks(events, exp.llmCapabilities));
  }
  const qe = types.filter((t) => t === 'llm.quota_exceeded').length;
  checks.push({ name: 'no llm.quota_exceeded', ok: qe === 0, detail: { count: qe } });
  checks.push({ name: 'llm_quota_exceeded false', ok: run.llm_quota_exceeded !== true, detail: { llm_quota: run.llm_quota } });
  checks.push({
    name: 'llm_calls_on_mock == 0',
    ok: Number(run.llm_calls_on_mock ?? 0) === 0,
    detail: { llm_calls_on_mock: run.llm_calls_on_mock },
  });
  return checks;
}

/** The low-quota assertions: the run fell back to the mock with a visible
 *  flag and still completed. */
export function classifyQuotaOutcome(run: Json, rawEvents: unknown[]): Check[] {
  const qe = rawEvents.filter((e): e is RunEvent => obj(e).type === 'llm.quota_exceeded');
  return [
    { name: 'run completed', ok: run.status === 'success', detail: { status: run.status, error: run.error } },
    { name: 'llm_quota_exceeded true', ok: run.llm_quota_exceeded === true, detail: { llm_quota: run.llm_quota } },
    {
      name: 'llm_calls_on_mock > 0',
      ok: Number(run.llm_calls_on_mock ?? 0) > 0,
      detail: { llm_calls_on_mock: run.llm_calls_on_mock },
    },
    { name: 'single llm.quota_exceeded', ok: qe.length === 1, detail: { count: qe.length } },
    {
      name: 'llm.quota_exceeded has resets_at',
      ok: qe.length > 0 && !!qe[0].resets_at,
      detail: { resets_at: qe[0]?.resets_at ?? null, quota: qe[0]?.quota ?? null },
    },
  ];
}

export function failed(checks: readonly Check[]): Check[] {
  return checks.filter((c) => !c.ok);
}

export type FailureClass = 'real' | 'flaky' | 'environmental';

/** A first-cut classification hint; the final call is made by a human or
 *  the run report with the evidence in hand. */
export function classifyFailure(input: {
  checks?: readonly Check[];
  http429Layer?: 'console' | 'playground' | null;
  timedOut?: boolean;
  passedOnRetry?: boolean;
}): FailureClass {
  if (input.http429Layer) return 'environmental';
  if (input.passedOnRetry) return 'flaky';
  const bad = failed(input.checks ?? []);
  // A quota fallback during the matrix means the shared per-IP quota ran
  // out (five units share one IP): environmental, not a console defect.
  // A stub-only run with no quota flag is a backend defect, so it stays real.
  const quotaHit = bad.some((c) => /quota|on_mock/.test(c.name));
  if (quotaHit && bad.every((c) => /quota|on_mock|real llm\.complete/.test(c.name))) return 'environmental';
  if (input.timedOut && bad.length === 0) return 'flaky';
  return 'real';
}
