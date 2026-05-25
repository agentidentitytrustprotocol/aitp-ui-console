import { boundaryColor, C, eventColor, statusColor } from './colors';

describe('eventColor', () => {
  it.each([
    ['agent.ready', C.tealBright],
    ['handshake.complete', C.blue],
    ['trust.established', C.blue],
    ['capability.invoked', C.amber],
    ['step.complete', C.amber],
    ['tct.revoked', C.red],
    ['revocation.published', C.red],
    ['run.started', C.purple],
    ['llm.complete', C.green],
    ['unknown.foo', C.textDim],
  ])('%s → %s', (type, expected) => {
    expect(eventColor(type)).toBe(expected);
  });
});

describe('boundaryColor', () => {
  it('maps the three known boundaries', () => {
    expect(boundaryColor('intra_org')).toBe(C.blue);
    expect(boundaryColor('cross_org')).toBe(C.amber);
    expect(boundaryColor('cross_cloud')).toBe(C.purple);
  });
  it('falls back to muted for unknown / null', () => {
    expect(boundaryColor(null)).toBe(C.textMuted);
    expect(boundaryColor('something_else')).toBe(C.textMuted);
  });
});

describe('statusColor', () => {
  it.each([
    ['active', C.green],
    ['success', C.green],
    ['complete', C.green],
    ['expired', C.yellow],
    ['running', C.blue],
    ['started', C.blue],
    ['failed', C.red],
    ['pending', C.textMuted],
    ['cancelled', C.textMuted],
    ['deregistered', C.textMuted],
    [null, C.textMuted],
  ])('%s → expected color', (input, expected) => {
    expect(statusColor(input)).toBe(expected);
  });
});
